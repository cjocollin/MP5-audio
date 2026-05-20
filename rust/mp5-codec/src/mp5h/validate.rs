//! MP5-H validation helpers (encode metrics, bit-exact check).

use crate::mp5c::{self, Preset};
use crate::mp5l;
use crate::pcm::{i16_to_f32, snr_db};
use super::{decode, encode, DecodeMode};

#[derive(Debug, Clone)]
pub struct Mp5hBenchRow {
    pub label: String,
    pub preset: Preset,
    pub base_bytes: usize,
    pub corr_bytes: usize,
    pub hybrid_bytes: usize,
    pub ratio_vs_pcm: f64,
    pub ratio_vs_mp5l: f64,
    pub ratio_vs_mp5c_base: f64,
    pub full_snr_db: f64,
    pub quiet_snr_db: f64,
    pub clips: u32,
    pub bit_exact: bool,
    pub max_sample_diff: i32,
    pub corr_present: bool,
    pub enhanced_decode: bool,
    pub enc_ms: f64,
    pub dec_ms: f64,
    pub base_only_snr_db: f64,
}

pub fn bench_mp5h_row(
    label: &str,
    samples: &[i16],
    channels: u8,
    sample_rate: u32,
    preset: Preset,
    pcm_bytes: u64,
    mp5l_bytes: u64,
) -> Result<Mp5hBenchRow, String> {
    let t0 = std::time::Instant::now();
    let (base, corr) = encode(samples, channels, preset);
    let enc_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let base_bytes = base.len();
    let corr_bytes = corr.len();
    let hybrid_bytes = base_bytes + corr_bytes;

    let mp5c_only = mp5c::encode(samples, channels, preset);
    let ratio_vs_mp5c_base = if mp5c_only.is_empty() {
        0.0
    } else {
        hybrid_bytes as f64 / mp5c_only.len() as f64
    };
    let ratio_vs_pcm = hybrid_bytes as f64 / pcm_bytes as f64;
    let ratio_vs_mp5l = if mp5l_bytes > 0 {
        hybrid_bytes as f64 / mp5l_bytes as f64
    } else {
        0.0
    };

    let t1 = std::time::Instant::now();
    let dec_enh = decode(&base, Some(&corr), DecodeMode::Enhanced)?;
    let dec_ms = t1.elapsed().as_secs_f64() * 1000.0;
    let dec_base = decode(&base, None, DecodeMode::BaseOnly)?;

    let n = samples.len().min(dec_enh.len());
    let (bit_exact, max_diff) = bit_exact_diff(&samples[..n], &dec_enh[..n]);
    let full_snr = snr_db(&i16_to_f32(&samples[..n]), &i16_to_f32(&dec_enh[..n]));
    let quiet_snr = quiet_snr_db(&samples[..n], &dec_enh[..n], channels);
    let clips = dec_enh.iter().filter(|&&s| s.abs() >= 32767).count() as u32;
    let base_only_snr = snr_db(
        &i16_to_f32(&samples[..n.min(dec_base.len())]),
        &i16_to_f32(&dec_base[..n.min(dec_base.len())]),
    );

    Ok(Mp5hBenchRow {
        label: label.to_string(),
        preset,
        base_bytes,
        corr_bytes,
        hybrid_bytes,
        ratio_vs_pcm,
        ratio_vs_mp5l,
        ratio_vs_mp5c_base,
        full_snr_db: full_snr,
        quiet_snr_db: quiet_snr,
        clips,
        bit_exact,
        max_sample_diff: max_diff,
        corr_present: !corr.is_empty(),
        enhanced_decode: true,
        enc_ms,
        dec_ms,
        base_only_snr_db: base_only_snr,
    })
}

pub fn bench_mp5c_row(
    label: &str,
    samples: &[i16],
    channels: u8,
    sample_rate: u32,
    preset: Preset,
    pcm_bytes: u64,
) -> Result<(usize, f64, f64, f64, u32, f64, f64), String> {
    let _ = sample_rate;
    let t0 = std::time::Instant::now();
    let bs = mp5c::encode(samples, channels, preset);
    let enc_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let t1 = std::time::Instant::now();
    let dec = mp5c::decode(&bs)?;
    let dec_ms = t1.elapsed().as_secs_f64() * 1000.0;
    let n = samples.len().min(dec.len());
    let snr = snr_db(&i16_to_f32(&samples[..n]), &i16_to_f32(&dec[..n]));
    let quiet = quiet_snr_db(&samples[..n], &dec[..n], channels);
    let clips = dec.iter().filter(|&&s| s.abs() >= 32767).count() as u32;
    Ok((bs.len(), bs.len() as f64 / pcm_bytes as f64, snr, quiet, clips, enc_ms, dec_ms))
}

pub fn bench_mp5l_row(
    samples: &[i16],
    channels: u8,
) -> Result<(usize, f64, f64, f64, u32, f64, f64, bool), String> {
    let t0 = std::time::Instant::now();
    let bs = mp5l::encode(samples, channels);
    let enc_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let t1 = std::time::Instant::now();
    let dec = mp5l::decode(&bs)?;
    let dec_ms = t1.elapsed().as_secs_f64() * 1000.0;
    let n = samples.len().min(dec.len());
    let (bit_exact, _) = bit_exact_diff(&samples[..n], &dec[..n]);
    let snr = snr_db(&i16_to_f32(&samples[..n]), &i16_to_f32(&dec[..n]));
    let quiet = quiet_snr_db(&samples[..n], &dec[..n], channels);
    let clips = dec.iter().filter(|&&s| s.abs() >= 32767).count() as u32;
    let pcm_bytes = (samples.len() * 2) as f64;
    Ok((
        bs.len(),
        bs.len() as f64 / pcm_bytes,
        snr,
        quiet,
        clips,
        enc_ms,
        dec_ms,
        bit_exact,
    ))
}

fn bit_exact_diff(orig: &[i16], dec: &[i16]) -> (bool, i32) {
    let mut max = 0i32;
    for (a, b) in orig.iter().zip(dec.iter()) {
        let d = (*a as i32 - *b as i32).abs();
        if d > max {
            max = d;
        }
    }
    (max == 0, max)
}

fn quiet_snr_db(orig: &[i16], dec: &[i16], channels: u8) -> f64 {
    let ch = channels.max(1) as usize;
    let thr = 10f32.powf(-42.0 / 20.0);
    let mut sig = 0f64;
    let mut noise = 0f64;
    let o: Vec<f32> = orig.iter().map(|&s| s as f32 / 32768.0).collect();
    let d: Vec<f32> = dec.iter().map(|&s| s as f32 / 32768.0).collect();
    for i in (0..o.len()).step_by(ch) {
        let mut peak = 0f32;
        for c in 0..ch {
            if i + c < o.len() {
                peak = peak.max(o[i + c].abs());
            }
        }
        if peak < thr {
            for c in 0..ch {
                if i + c >= o.len() {
                    break;
                }
                let ov = o[i + c] as f64;
                let dv = d[i + c] as f64;
                sig += ov * ov;
                let e = ov - dv;
                noise += e * e;
            }
        }
    }
    if noise < 1e-20 {
        return 120.0;
    }
    if sig < 1e-20 {
        return 0.0;
    }
    10.0 * (sig / noise).log10()
}
