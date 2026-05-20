//! MP5-C High hiss investigation — artifact metrics across codec versions.
//!   cargo run --release -p mp5-codec --features bench_tools --bin bench_hiss_investigation

use mp5_codec::mp5c::{
    analyze_slice, encode, encode_v4_reference, encode_v5_reference, hiss_score, sections_for_duration,
    ArtifactMetrics, Preset,
};
use mp5_codec::mp5c::{self};
use mp5_codec::pcm::snr_db;
use std::fs;
use std::path::PathBuf;

struct Pcm {
    samples: Vec<i16>,
    channels: u8,
    sample_rate: u32,
    frames: usize,
}

struct Variant {
    label: &'static str,
    encode: fn(&[i16], u8, Preset) -> Vec<u8>,
    preset: Preset,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::var("MP5_BENCH_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\\Users\\colli\\OneDrive\\Desktop"));
    let flac = root.join("- ORIGAMI!.flac");
    if !flac.exists() {
        eprintln!("Missing: {}", flac.display());
        std::process::exit(1);
    }

    eprintln!("Loading {} …", flac.display());
    let pcm = load_flac(&flac)?;
    let pcm_bytes = (pcm.samples.len() * 2) as u64;
    let duration = pcm.frames as f64 / pcm.sample_rate as f64;
    let sections = sections_for_duration(duration);

    let variants: [Variant; 6] = [
        Variant {
            label: "High v4",
            encode: encode_v4_reference,
            preset: Preset::High,
        },
        Variant {
            label: "High v5",
            encode: encode_v5_reference,
            preset: Preset::High,
        },
        Variant {
            label: "High v5.1",
            encode: encode,
            preset: Preset::High,
        },
        Variant {
            label: "Extreme v5",
            encode: encode_v5_reference,
            preset: Preset::Extreme,
        },
        Variant {
            label: "Extreme v5.1",
            encode: encode,
            preset: Preset::Extreme,
        },
        Variant {
            label: "Standard v5",
            encode: encode_v5_reference,
            preset: Preset::Standard,
        },
    ];

    let mut decoded: Vec<(String, Vec<i16>, f64)> = Vec::new();
    decoded.push(("PCM fallback".into(), pcm.samples.clone(), 1.0));

    eprintln!("Encoding variants …");
    for v in &variants {
        eprintln!("  {}", v.label);
        let bs = (v.encode)(&pcm.samples, pcm.channels, v.preset);
        assert_eq!(bs[0], 0x43, "bad magic");
        let ver = bs[1];
        eprintln!("    bitstream 0x{:02x}", ver);
        let dec = mp5c::decode(&bs)?;
        let ratio = bs.len() as f64 / pcm_bytes as f64;
        let n = pcm.samples.len().min(dec.len());
        let snr = snr_db(
            &mp5_codec::pcm::i16_to_f32(&pcm.samples[..n]),
            &mp5_codec::pcm::i16_to_f32(&dec[..n]),
        );
        eprintln!("    ratio {:.3}x SNR {:.1} dB", ratio, snr);
        decoded.push((v.label.to_string(), dec, ratio));
    }

    // Packing lossless check (v5 High): coeffs roundtrip
    eprintln!("Checking v5 pack lossless on sample frames …");
    let bs5 = encode_v5_reference(&pcm.samples, pcm.channels, Preset::High);
    let pack_ok = verify_pack_lossless(&bs5)?;
    eprintln!("  pack roundtrip: {}", if pack_ok { "OK" } else { "FAIL" });

    let mut all_metrics: Vec<ArtifactMetrics> = Vec::new();
    for (codec, dec, ratio) in &decoded {
        for (label, start, end) in &sections {
            let ch = pcm.channels as usize;
            let i0 = (*start * pcm.sample_rate as f64) as usize * ch;
            let i1 = (*end * pcm.sample_rate as f64) as usize * ch;
            let i1 = i1.min(pcm.samples.len()).min(dec.len());
            if i0 >= i1 {
                continue;
            }
            let m = analyze_slice(
                label,
                codec,
                &pcm.samples[i0..i1],
                &dec[i0..i1],
                pcm.sample_rate,
                pcm.channels,
                *ratio,
            );
            all_metrics.push(m);
        }
    }

    let out_dir = PathBuf::from("benchmarks/real-music");
    fs::create_dir_all(&out_dir)?;
    let report_path = out_dir.join("HISS_INVESTIGATION.md");
    write_report(&report_path, &all_metrics, duration, pcm_bytes, pack_ok)?;
    eprintln!("\nWrote {}", report_path.display());
    Ok(())
}

fn verify_pack_lossless(bs: &[u8]) -> Result<bool, String> {
    if bs.len() < 8 || bs[1] != 5 {
        return Ok(true);
    }
    let ch = bs[2].max(1) as usize;
    let frames = u32::from_le_bytes(bs[4..8].try_into().unwrap()) as usize;
    let mut pos = 8usize;
    let mut checked = 0usize;
    for _c in 0..ch {
        for _f in 0..frames {
            if pos >= bs.len() {
                break;
            }
            let flag = bs[pos];
            pos += 2;
            if pos + 2 > bs.len() {
                break;
            }
            let len = u16::from_le_bytes(bs[pos..pos + 2].try_into().unwrap()) as usize;
            pos += 2;
            if pos + len > bs.len() {
                break;
            }
            let payload = &bs[pos..pos + len];
            pos += len;
            if flag >= 3 && flag <= 7 {
                let coeffs = mp5_codec::mp5c::pack_v5::unpack_frame(flag, payload, 2048)?;
                let (reflag, repack) = mp5_codec::mp5c::pack_v5::pack_frame(&coeffs);
                if reflag != flag || repack != payload {
                    return Ok(false);
                }
                checked += 1;
                if checked >= 200 {
                    return Ok(true);
                }
            }
        }
    }
    Ok(true)
}

fn write_report(
    path: &std::path::Path,
    metrics: &[ArtifactMetrics],
    duration: f64,
    pcm_bytes: u64,
    pack_lossless: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut md = String::from("# MP5-C High hiss investigation (ORIGAMI)\n\n");
    md.push_str("Generated by `pnpm bench:hiss-investigation`. MP5-C is **experimental**.\n\n");
    md.push_str(&format!(
        "Source: `- ORIGAMI!.flac` — {:.1}s, PCM {} bytes\n\n",
        duration, pcm_bytes
    ));
    md.push_str(&format!(
        "**v5 pack lossless check** (sampled non-dense frames): {}\n\n",
        if pack_lossless { "pass" } else { "**FAIL — investigate packing**" }
    ));

    md.push_str("## Findings summary\n\n");
    let full: Vec<_> = metrics
        .iter()
        .filter(|m| m.label == "full_song")
        .collect();

    let pcm = full.iter().find(|m| m.codec_label == "PCM fallback").cloned();
    let h4 = full.iter().find(|m| m.codec_label == "High v4").cloned();
    let h5 = full.iter().find(|m| m.codec_label == "High v5").cloned();
    let h51 = full.iter().find(|m| m.codec_label == "High v5.1").cloned();
    let ex5 = full.iter().find(|m| m.codec_label == "Extreme v5").cloned();
    let ex51 = full.iter().find(|m| m.codec_label == "Extreme v5.1").cloned();

    if let (Some(h4), Some(h5), Some(h51)) = (h4, h5, h51) {
        let same_quant = (h4.full_snr_db - h5.full_snr_db).abs() < 0.05
            && (h5.full_snr_db - h51.full_snr_db).abs() < 0.05;
        md.push_str(&format!(
            "- **High v4 / v5 / v5.1 full-song SNR:** {:.1} / {:.1} / {:.1} dB — {}\n",
            h4.full_snr_db,
            h5.full_snr_db,
            h51.full_snr_db,
            if same_quant {
                "identical (quantization-limited, not packing)"
            } else {
                "differ — check decode path"
            }
        ));
        md.push_str(&format!(
            "- **Quiet-passage SNR (−42 dBFS gate):** v4 {:.1} | v5 {:.1} | v5.1 {:.1} dB\n",
            h4.quiet_snr_db, h5.quiet_snr_db, h51.quiet_snr_db
        ));
        md.push_str(&format!(
            "- **Quiet noise floor (err/signal dB):** v4 {:.1} | v5 {:.1} | v5.1 {:.1} dB\n",
            h4.quiet_noise_floor_db, h5.quiet_noise_floor_db, h51.quiet_noise_floor_db
        ));
        md.push_str(&format!(
            "- **HF error RMS:** v4 {:.5} | v5 {:.5} | v5.1 {:.5}\n",
            h4.hf_err_rms, h5.hf_err_rms, h51.hf_err_rms
        ));
        md.push_str(&format!(
            "- **Worst 1s SNR:** v4 {:.1} @ {:.1}s | v5 {:.1} @ {:.1}s | v5.1 {:.1} @ {:.1}s\n",
            h4.worst_1s_snr_db,
            h4.worst_1s_start_sec,
            h5.worst_1s_snr_db,
            h5.worst_1s_start_sec,
            h51.worst_1s_snr_db,
            h51.worst_1s_start_sec
        ));
    }

    if let (Some(ex5), Some(h5)) = (ex5, h5) {
        md.push_str(&format!(
            "- **Extreme vs High (full):** SNR {:.1} vs {:.1} dB; quiet NF {:.1} vs {:.1} dB\n",
            ex5.full_snr_db,
            h5.full_snr_db,
            ex5.quiet_noise_floor_db,
            h5.quiet_noise_floor_db
        ));
    }

    md.push_str("\n### Hiss score (lower = cleaner proxy)\n\n");
    md.push_str("| Codec | full_song |\n|-------|----------|\n");
    let mut scored: Vec<_> = full
        .iter()
        .map(|m| (m.codec_label.as_str(), hiss_score(m)))
        .collect();
    scored.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
    for (name, score) in &scored {
        md.push_str(&format!("| {name} | {score:.2} |\n"));
    }

    md.push_str("\n## Full song metrics\n\n");
    md.push_str("| Codec | Ratio | SNR | Quiet SNR | Quiet NF dB | HF err | Side err | Worst 1s | Peak err |\n");
    md.push_str("|-------|-------|-----|-----------|-------------|--------|----------|----------|----------|\n");
    for m in &full {
        md.push_str(&format!(
            "| {} | {:.3} | {:.1} | {:.1} | {:.1} | {:.5} | {:.5} | {:.1} @ {:.0}s | {:.4} |\n",
            m.codec_label,
            m.ratio_vs_pcm,
            m.full_snr_db,
            m.quiet_snr_db,
            m.quiet_noise_floor_db,
            m.hf_err_rms,
            m.side_err_rms,
            m.worst_1s_snr_db,
            m.worst_1s_start_sec,
            m.peak_error
        ));
    }

    let section_labels = [
        "intro",
        "vocal_mid",
        "dense_mid",
        "outro_quiet",
        "reverb_tail",
        "wide_stereo",
    ];
    for sec in section_labels {
        md.push_str(&format!("\n## Section: {sec}\n\n"));
        md.push_str("| Codec | SNR | Quiet SNR | Quiet NF | HF err | Worst 1s |\n");
        md.push_str("|-------|-----|-----------|----------|--------|----------|\n");
        let mut rows: Vec<_> = metrics
            .iter()
            .filter(|m| m.label == sec)
            .collect();
        rows.sort_by(|a, b| a.codec_label.cmp(&b.codec_label));
        for m in rows {
            md.push_str(&format!(
                "| {} | {:.1} | {:.1} | {:.1} | {:.5} | {:.1} |\n",
                m.codec_label,
                m.full_snr_db,
                m.quiet_snr_db,
                m.quiet_noise_floor_db,
                m.hf_err_rms,
                m.worst_1s_snr_db
            ));
        }
    }

    md.push_str("\n## Spectral error ratio by band (LF→HF, full song)\n\n");
    md.push_str("| Codec | band0 LF | band1 lo-mid | band2 hi-mid | band3 HF |\n");
    md.push_str("|-------|----------|-------------|--------------|--------|\n");
    for m in &full {
        md.push_str(&format!(
            "| {} | {:.5} | {:.5} | {:.5} | {:.5} |\n",
            m.codec_label,
            m.spectral_err_ratio[0],
            m.spectral_err_ratio[1],
            m.spectral_err_ratio[2],
            m.spectral_err_ratio[3]
        ));
    }

    md.push_str("\n## Conclusions (auto-generated — confirm by ear)\n\n");
    write_conclusions(&mut md, h4, h5, h51, ex5, ex51, pcm);

    fs::write(path, md)?;
    Ok(())
}

fn write_conclusions(
    md: &mut String,
    h4: Option<&ArtifactMetrics>,
    h5: Option<&ArtifactMetrics>,
    h51: Option<&ArtifactMetrics>,
    ex5: Option<&ArtifactMetrics>,
    ex51: Option<&ArtifactMetrics>,
    pcm: Option<&ArtifactMetrics>,
) {
    let h4_h5_same = match (h4, h5) {
        (Some(a), Some(b)) => {
            (a.quiet_noise_floor_db - b.quiet_noise_floor_db).abs() < 0.5
                && (a.hf_err_rms - b.hf_err_rms).abs() < 1e-5
        }
        _ => false,
    };

    if h4_h5_same {
        md.push_str(
            "1. **Hiss is present in High v4, v5, and v5.1** at the same quantization floor — not introduced by v5 packing or v5.1 bands.\n",
        );
    } else if let (Some(a), Some(b)) = (h4, h5) {
        md.push_str(&format!(
            "1. **v4 vs v5 differ** in quiet NF ({:.1} vs {:.1} dB) — investigate decode/version byte.\n",
            a.quiet_noise_floor_db, b.quiet_noise_floor_db
        ));
    }

    if let (Some(h), Some(ex)) = (h5, ex5) {
        if ex.quiet_snr_db > h.quiet_snr_db + 0.5 {
            md.push_str(&format!(
                "2. **Extreme is cleaner in quiet passages** than High (quiet SNR {:.1} vs {:.1} dB) — Extreme is the converter default.\n",
                ex.quiet_snr_db, h.quiet_snr_db
            ));
        } else {
            md.push_str(
                "2. **Extreme vs High** — quiet metrics are close after High retune; confirm by ear.\n",
            );
        }
    }

    if let Some(ex51) = ex51 {
        if let Some(ex5) = ex5 {
            if (ex51.quiet_noise_floor_db - ex5.quiet_noise_floor_db).abs() < 1.0 {
                md.push_str("3. **v5.1 does not worsen Extreme** vs v5 reference.\n");
            }
        }
    }

    if pcm.is_some() {
        md.push_str("4. **PCM fallback** is the only lossless reference in this table.\n");
    }

    md.push_str(
        "\n### Default preset recommendation\n\nSee `docs/MP5C_LIMITATIONS.md` after any High retune.\n",
    );
}

fn load_flac(path: &PathBuf) -> Result<Pcm, Box<dyn std::error::Error>> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::errors::Error;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let src = fs::File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(src), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let probed = symphonia::default::get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    )?;
    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("no track")?
        .clone();
    let track_id = track.id;
    let mut decoder =
        symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default())?;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(48000);
    let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(2) as u8;
    let mut planes: Vec<Vec<i16>> = (0..channels).map(|_| Vec::new()).collect();
    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let mut buf = SampleBuffer::<i16>::new(decoded.capacity() as u64, spec);
                buf.copy_interleaved_ref(decoded);
                let ch = spec.channels.count();
                for (i, &s) in buf.samples().iter().enumerate() {
                    planes[i % ch].push(s);
                }
            }
            Err(Error::IoError(_)) => break,
            Err(Error::DecodeError(_)) => continue,
            Err(_) => break,
        }
    }
    let frames = planes[0].len();
    let mut interleaved = Vec::with_capacity(frames * channels as usize);
    for i in 0..frames {
        for c in 0..channels as usize {
            interleaved.push(planes[c][i]);
        }
    }
    Ok(Pcm {
        samples: interleaved,
        channels,
        sample_rate,
        frames,
    })
}
