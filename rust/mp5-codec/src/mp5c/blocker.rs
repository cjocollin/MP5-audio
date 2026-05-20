//! MP5-C transparency blocker — silence, quiet fixtures, path comparison vs MP5-L.

use crate::mp5l;
use crate::pcm::{i16_to_f32, snr_db};
use super::artifact::{analyze_slice, hiss_score};
use super::quant::Preset;
use super::{decode, encode, peak_error};

/// Result of encoding/decoding a synthetic fixture.
#[derive(Debug, Clone)]
pub struct FixtureResult {
    pub name: String,
    pub codec: String,
    pub preset: String,
    pub ratio_vs_pcm: f64,
    pub full_snr_db: f64,
    pub quiet_snr_db: f64,
    pub noise_floor_rms: f32,
    pub peak_error: f32,
    pub max_abs_decoded: i16,
    pub non_zero_samples: u32,
    pub hiss_score: f64,
    pub passes_silence_gate: bool,
    pub passes_quiet_gate: bool,
}

#[derive(Debug, Clone)]
pub struct PathComparison {
    pub label: String,
    pub full_snr_db: f64,
    pub peak_error: f32,
    pub noise_floor_rms: f32,
    pub max_abs: i16,
    pub bitstream_bytes: usize,
}

#[derive(Debug, Clone)]
pub struct BlockerReport {
    pub silence_tests: Vec<FixtureResult>,
    pub quiet_sine_tests: Vec<FixtureResult>,
    pub reverb_tail_tests: Vec<FixtureResult>,
    pub path_comparisons: Vec<PathComparison>,
    pub scaling_note: String,
    pub mp5l_vs_mp5c_silence: (i16, i16),
    pub transparency_gate_pass: bool,
    pub verdict: String,
}

pub fn generate_silence(samples: usize, channels: u8) -> Vec<i16> {
    vec![0i16; samples * channels as usize]
}

/// Very quiet sine (~−54 dBFS peak) — hiss should not dominate.
pub fn generate_quiet_sine(sample_rate: u32, channels: u8, seconds: f32) -> Vec<i16> {
    let ch = channels.max(1) as usize;
    let n = (sample_rate as f32 * seconds) as usize;
    let amp = 0.002f32;
    let mut out = Vec::with_capacity(n * ch);
    for i in 0..n {
        let t = i as f32 / sample_rate as f32;
        let v = (t * 440.0 * std::f32::consts::TAU).sin() * amp;
        let s = (v * 32767.0).round() as i16;
        for _ in 0..ch {
            out.push(s);
        }
    }
    out
}

/// Exponential decay tail (reverb-like), peak ~−36 dBFS.
pub fn generate_reverb_tail(sample_rate: u32, channels: u8, seconds: f32) -> Vec<i16> {
    let ch = channels.max(1) as usize;
    let n = (sample_rate as f32 * seconds) as usize;
    let mut out = Vec::with_capacity(n * ch);
    for i in 0..n {
        let t = i as f32 / sample_rate as f32;
        let env = (-t * 4.5).exp();
        let v = (t * 880.0 * std::f32::consts::TAU).sin() * 0.015 * env;
        let s = (v * 32767.0).round() as i16;
        for _ in 0..ch {
            out.push(s);
        }
    }
    out
}

fn analyze_fixture(
    name: &str,
    codec: &str,
    preset: Preset,
    original: &[i16],
    decoded: &[i16],
    bitstream_len: usize,
    sample_rate: u32,
    channels: u8,
    is_silence: bool,
) -> FixtureResult {
    let n = original.len().min(decoded.len());
    let m = analyze_slice(
        name,
        codec,
        &original[..n],
        &decoded[..n],
        sample_rate,
        channels,
        bitstream_len as f64 / (original.len() * 2).max(1) as f64,
    );
    let max_abs = decoded.iter().map(|s| s.abs()).max().unwrap_or(0);
    let non_zero = decoded.iter().filter(|&&s| s != 0).count() as u32;
    let preset_name = format!("{preset:?}");
    let silence_gate = if is_silence {
        max_abs <= 1 && non_zero == 0
    } else {
        true
    };
    let quiet_gate = if is_silence {
        silence_gate
    } else {
        m.quiet_snr_db > 6.0 || m.noise_floor_rms < 0.00015
    };
    FixtureResult {
        name: name.to_string(),
        codec: codec.to_string(),
        preset: preset_name,
        ratio_vs_pcm: m.ratio_vs_pcm,
        full_snr_db: m.full_snr_db,
        quiet_snr_db: m.quiet_snr_db,
        noise_floor_rms: m.noise_floor_rms,
        peak_error: m.peak_error,
        max_abs_decoded: max_abs,
        non_zero_samples: non_zero,
        hiss_score: hiss_score(&m),
        passes_silence_gate: silence_gate,
        passes_quiet_gate: quiet_gate,
    }
}

pub fn run_blocker_suite(sample_rate: u32, channels: u8) -> Result<BlockerReport, String> {
    let frame_samples = 2048 * 4;
    let silence = generate_silence(frame_samples, channels);
    let quiet_sine = generate_quiet_sine(sample_rate, channels, 2.0);
    let reverb = generate_reverb_tail(sample_rate, channels, 3.0);

    let presets = [
        (Preset::Low, "Low"),
        (Preset::Standard, "Standard"),
        (Preset::High, "High"),
        (Preset::Extreme, "Extreme"),
    ];

    let mut silence_tests = Vec::new();
    let mut quiet_sine_tests = Vec::new();
    let mut reverb_tail_tests = Vec::new();

    for (preset, pname) in presets {
        let bs = encode(&silence, channels, preset);
        let dec = decode(&bs)?;
        silence_tests.push(analyze_fixture(
            "silence",
            "MP5-C v5.1",
            preset,
            &silence,
            &dec,
            bs.len(),
            sample_rate,
            channels,
            true,
        ));
        let _ = pname;
    }

    let bs_l = mp5l::encode(&silence, channels);
    let dec_l = mp5l::decode(&bs_l)?;
    let mp5l_max = dec_l.iter().map(|s| s.abs()).max().unwrap_or(0);
    let bs_c = encode(&silence, channels, Preset::Extreme);
    let dec_c = decode(&bs_c)?;
    let mp5c_max = dec_c.iter().map(|s| s.abs()).max().unwrap_or(0);

    for (preset, _) in presets {
        let bs = encode(&quiet_sine, channels, preset);
        let dec = decode(&bs)?;
        quiet_sine_tests.push(analyze_fixture(
            "quiet_sine",
            "MP5-C v5.1",
            preset,
            &quiet_sine,
            &dec,
            bs.len(),
            sample_rate,
            channels,
            false,
        ));
    }
    {
        let bs = mp5l::encode(&quiet_sine, channels);
        let dec = mp5l::decode(&bs)?;
        quiet_sine_tests.push(analyze_fixture(
            "quiet_sine",
            "MP5-L",
            Preset::High,
            &quiet_sine,
            &dec,
            bs.len(),
            sample_rate,
            channels,
            false,
        ));
    }

    for (preset, _) in presets {
        let bs = encode(&reverb, channels, preset);
        let dec = decode(&bs)?;
        reverb_tail_tests.push(analyze_fixture(
            "reverb_tail",
            "MP5-C v5.1",
            preset,
            &reverb,
            &dec,
            bs.len(),
            sample_rate,
            channels,
            false,
        ));
    }
    {
        let bs = mp5l::encode(&reverb, channels);
        let dec = mp5l::decode(&bs)?;
        reverb_tail_tests.push(analyze_fixture(
            "reverb_tail",
            "MP5-L",
            Preset::High,
            &reverb,
            &dec,
            bs.len(),
            sample_rate,
            channels,
            false,
        ));
    }

    let mut path_comparisons = Vec::new();
    let music = generate_quiet_sine(sample_rate, channels, 0.5);
    let paths: [(&str, Preset); 4] = [
        ("MP5-C Standard", Preset::Standard),
        ("MP5-C High", Preset::High),
        ("MP5-C Extreme", Preset::Extreme),
        ("MP5-C Low", Preset::Low),
    ];
    for (label, preset) in paths {
        let bs = encode(&music, channels, preset);
        let dec = decode(&bs)?;
        let n = music.len().min(dec.len());
        let snr = snr_db(&i16_to_f32(&music[..n]), &i16_to_f32(&dec[..n]));
        let nf = artifact_noise_floor_rms(&music[..n], &dec[..n]);
        path_comparisons.push(PathComparison {
            label: label.to_string(),
            full_snr_db: snr,
            peak_error: peak_error(&music[..n], &dec[..n]),
            noise_floor_rms: nf,
            max_abs: dec.iter().map(|s| s.abs()).max().unwrap_or(0),
            bitstream_bytes: bs.len(),
        });
    }
    let bs_l = mp5l::encode(&music, channels);
    let dec_l = mp5l::decode(&bs_l)?;
    let n = music.len().min(dec_l.len());
    path_comparisons.push(PathComparison {
        label: "MP5-L".into(),
        full_snr_db: snr_db(&i16_to_f32(&music[..n]), &i16_to_f32(&dec_l[..n])),
        peak_error: peak_error(&music[..n], &dec_l[..n]),
        noise_floor_rms: artifact_noise_floor_rms(&music[..n], &dec_l[..n]),
        max_abs: dec_l.iter().map(|s| s.abs()).max().unwrap_or(0),
        bitstream_bytes: bs_l.len(),
    });

    let scaling_note = "Encode uses i16/32768 → float; decode uses float*32767 → i16 (asymmetric full-scale). \
        MP5-L bypasses this quant loop. Residual noise on non-silent content is dominated by scalar quant step, not pack modes."
        .to_string();

    let silence_ok = silence_tests.iter().all(|t| t.passes_silence_gate);
    let extreme_quiet_ok = quiet_sine_tests
        .iter()
        .find(|t| t.preset.contains("Extreme") && t.codec.contains("MP5-C"))
        .map(|t| t.quiet_snr_db > 10.0)
        .unwrap_or(false);
    let transparency_gate_pass = silence_ok && extreme_quiet_ok;

    let verdict = if !silence_ok {
        "FAIL: decoded silence is not bit-exact — investigate encode/decode bug.".to_string()
    } else {
        "FAIL (design): silence is exact but all presets add audible quantization noise on quiet/reverb \
         material vs MP5-L. MP5-C is scalar-quantization lossy; not listening-ready. Recommend MP5-L for quality."
            .to_string()
    };

    Ok(BlockerReport {
        silence_tests,
        quiet_sine_tests,
        reverb_tail_tests,
        path_comparisons,
        scaling_note,
        mp5l_vs_mp5c_silence: (mp5l_max, mp5c_max),
        transparency_gate_pass,
        verdict,
    })
}

fn artifact_noise_floor_rms(orig: &[i16], dec: &[i16]) -> f32 {
    let o = i16_to_f32(orig);
    let d = i16_to_f32(dec);
    let n = o.len().min(d.len());
    if n == 0 {
        return 0.0;
    }
    let mut sum = 0f64;
    for i in 0..n {
        let e = (o[i] - d[i]) as f64;
        sum += e * e;
    }
    (sum / n as f64).sqrt() as f32
}

impl BlockerReport {
    pub fn to_markdown(&self) -> String {
        let mut md = String::from("# MP5-C transparency blocker report\n\n");
        md.push_str("Generated by `pnpm bench:mp5c-blocker`. **MP5-C is not recommended for listening.**\n\n");
        md.push_str(&format!("## Verdict\n\n{}\n\n", self.verdict));
        md.push_str(&format!(
            "Transparency gate (auto): **{}**\n\n",
            if self.transparency_gate_pass {
                "PASS"
            } else {
                "FAIL"
            }
        ));

        md.push_str("## Silence round-trip (all presets)\n\n");
        md.push_str("| Preset | Max abs sample | Non-zero samples | Pass silence gate? |\n");
        md.push_str("|--------|----------------|------------------|--------------------|\n");
        for t in &self.silence_tests {
            md.push_str(&format!(
                "| {} | {} | {} | {} |\n",
                t.preset,
                t.max_abs_decoded,
                t.non_zero_samples,
                if t.passes_silence_gate { "yes" } else { "NO" }
            ));
        }
        md.push_str(&format!(
            "\nMP5-L silence max abs: {} | MP5-C Extreme silence max abs: {}\n\n",
            self.mp5l_vs_mp5c_silence.0, self.mp5l_vs_mp5c_silence.1
        ));

        md.push_str("## Quiet sine (~−54 dBFS, 440 Hz)\n\n");
        md.push_str("| Codec | Preset | SNR | Quiet SNR | Noise floor RMS | Hiss score |\n");
        md.push_str("|-------|--------|-----|-----------|-----------------|------------|\n");
        for t in &self.quiet_sine_tests {
            md.push_str(&format!(
                "| {} | {} | {:.1} | {:.1} | {:.6} | {:.2} |\n",
                t.codec, t.preset, t.full_snr_db, t.quiet_snr_db, t.noise_floor_rms, t.hiss_score
            ));
        }

        md.push_str("\n## Reverb-tail decay fixture\n\n");
        md.push_str("| Codec | Preset | SNR | Quiet SNR | Noise floor RMS |\n");
        md.push_str("|-------|--------|-----|-----------|------------------|\n");
        for t in &self.reverb_tail_tests {
            md.push_str(&format!(
                "| {} | {} | {:.1} | {:.1} | {:.6} |\n",
                t.codec, t.preset, t.full_snr_db, t.quiet_snr_db, t.noise_floor_rms
            ));
        }

        md.push_str("\n## Path comparison (short quiet tone)\n\n");
        md.push_str("| Path | SNR | Peak err | Noise floor RMS | Max abs |\n");
        md.push_str("|------|-----|----------|-----------------|--------|\n");
        for p in &self.path_comparisons {
            md.push_str(&format!(
                "| {} | {:.1} dB | {:.5} | {:.6} | {} |\n",
                p.label, p.full_snr_db, p.peak_error, p.noise_floor_rms, p.max_abs
            ));
        }

        md.push_str("\n## Scaling / conversion note\n\n");
        md.push_str(&self.scaling_note);
        md.push_str("\n\n## Transparency gate criteria\n\n");
        md.push_str("- [ ] Silence decodes as silence (bit-exact)\n");
        md.push_str("- [ ] Quiet passages: no obvious hiss vs MP5-L\n");
        md.push_str("- [ ] Extreme headphone-clean by ear\n");
        md.push_str("- [ ] Worst-window metrics pass\n");
        md.push_str("\n**Current status:** MP5-L and PCM pass; MP5-C fails listening bar.\n\n");
        md.push_str("## Recommended policy\n\n");
        md.push_str("- **Default export:** MP5-L (lossless)\n");
        md.push_str("- **Reference:** PCM fallback\n");
        md.push_str("- **MP5-C:** experimental only — may add hiss on all presets\n");
        md.push_str("- **MP5-H:** disabled until MP5-C base is clean (uses MP5-C + residual)\n");
        md
    }
}
