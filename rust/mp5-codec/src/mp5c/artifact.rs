//! Artifact-focused quality metrics beyond full-song SNR (hiss investigation).

use crate::pcm::{i16_to_f32, snr_db};

/// Per-window / per-codec artifact summary.
#[derive(Debug, Clone)]
pub struct ArtifactMetrics {
    pub label: String,
    pub codec_label: String,
    pub full_snr_db: f64,
    pub quiet_snr_db: f64,
    pub quiet_noise_floor_db: f64,
    pub hf_err_rms: f32,
    pub lf_err_rms: f32,
    pub side_err_rms: f32,
    pub mid_err_rms: f32,
    pub noise_floor_rms: f32,
    pub peak_error: f32,
    pub clipped_samples: u32,
    pub worst_1s_snr_db: f64,
    pub worst_1s_start_sec: f64,
    pub spectral_err_ratio: [f64; 4],
    pub ratio_vs_pcm: f64,
}

#[derive(Debug, Clone)]
pub struct HissSection {
    pub label: &'static str,
    pub start_sec: f64,
    pub end_sec: f64,
}

pub const HISS_SECTIONS: &[HissSection] = &[
    HissSection {
        label: "full_song",
        start_sec: 0.0,
        end_sec: f64::MAX,
    },
    HissSection {
        label: "intro",
        start_sec: 0.0,
        end_sec: 30.0,
    },
    HissSection {
        label: "vocal_mid",
        start_sec: 30.0,
        end_sec: 60.0,
    },
    HissSection {
        label: "dense_mid",
        start_sec: 60.0,
        end_sec: 90.0,
    },
    HissSection {
        label: "outro_quiet",
        start_sec: f64::NAN,
        end_sec: f64::MAX,
    },
    HissSection {
        label: "reverb_tail",
        start_sec: f64::NAN,
        end_sec: f64::MAX,
    },
    HissSection {
        label: "wide_stereo",
        start_sec: 45.0,
        end_sec: 75.0,
    },
];

pub fn sections_for_duration(duration_sec: f64) -> Vec<(&'static str, f64, f64)> {
    vec![
        ("full_song", 0.0, duration_sec),
        ("intro", 0.0, 30.0),
        ("vocal_mid", 30.0, 60.0),
        ("dense_mid", 60.0, 90.0),
        ("outro_quiet", (duration_sec - 30.0).max(0.0), duration_sec),
        (
            "reverb_tail",
            (duration_sec - 45.0).max(0.0),
            (duration_sec - 15.0).max(0.0),
        ),
        ("wide_stereo", 45.0, 75.0),
    ]
    .into_iter()
    .filter(|(_, a, b)| *b > *a)
    .collect()
}

/// Analyze one codec variant on a time slice (interleaved i16).
pub fn analyze_slice(
    label: &str,
    codec_label: &str,
    original: &[i16],
    decoded: &[i16],
    sample_rate: u32,
    channels: u8,
    ratio_vs_pcm: f64,
) -> ArtifactMetrics {
    let n = original.len().min(decoded.len());
    let o = &original[..n];
    let d = &decoded[..n];
    let o_f = i16_to_f32(o);
    let d_f = i16_to_f32(d);

    let full_snr_db = snr_db(&o_f, &d_f);
    let (quiet_snr_db, quiet_noise_floor_db, noise_floor_rms) =
        quiet_metrics(&o_f, &d_f, channels);
    let (hf_err_rms, lf_err_rms) = hf_lf_error(&o_f, &d_f);
    let (side_err_rms, mid_err_rms) = stereo_mid_side_error(&o_f, &d_f, channels);
    let (worst_1s_snr_db, worst_1s_start_sec) =
        worst_sliding_snr(&o_f, &d_f, sample_rate, channels, 1.0);
    let spectral_err_ratio = spectral_band_error_ratios(&o_f, &d_f, sample_rate);
    let peak_error = peak_err(o, d);
    let clipped_samples = d.iter().filter(|&&s| s.abs() >= 32767).count() as u32;

    ArtifactMetrics {
        label: label.to_string(),
        codec_label: codec_label.to_string(),
        full_snr_db,
        quiet_snr_db,
        quiet_noise_floor_db,
        hf_err_rms,
        lf_err_rms,
        side_err_rms,
        mid_err_rms,
        noise_floor_rms,
        peak_error,
        clipped_samples,
        worst_1s_snr_db,
        worst_1s_start_sec,
        spectral_err_ratio,
        ratio_vs_pcm,
    }
}

fn peak_err(o: &[i16], d: &[i16]) -> f32 {
    let n = o.len().min(d.len());
    let mut max = 0f32;
    for i in 0..n {
        let e = (o[i] as f32 - d[i] as f32).abs() / 32768.0;
        max = max.max(e);
    }
    max
}

/// SNR and noise floor on samples below -42 dBFS (likely audible hiss regions).
fn quiet_metrics(o: &[f32], d: &[f32], channels: u8) -> (f64, f64, f32) {
    let ch = channels.max(1) as usize;
    let thr = 10f32.powf(-42.0 / 20.0);
    let mut sig = 0f64;
    let mut noise = 0f64;
    let mut err_sum = 0f64;
    let mut quiet_count = 0usize;
    for i in (0..o.len()).step_by(ch) {
        let mut frame_peak = 0f32;
        for c in 0..ch {
            if i + c < o.len() {
                frame_peak = frame_peak.max(o[i + c].abs());
            }
        }
        if frame_peak < thr {
            for c in 0..ch {
                if i + c >= o.len() {
                    break;
                }
                let ov = o[i + c] as f64;
                let dv = d[i + c] as f64;
                sig += ov * ov;
                let e = ov - dv;
                noise += e * e;
                err_sum += e * e;
                quiet_count += 1;
            }
        }
    }
    if quiet_count == 0 || sig < 1e-20 {
        return (120.0, -120.0, 0.0);
    }
    let snr = if noise < 1e-20 {
        120.0
    } else {
        10.0 * (sig / noise).log10()
    };
    let err_rms = (err_sum / quiet_count as f64).sqrt();
    let sig_rms = (sig / quiet_count as f64).sqrt();
    let nf_db = if sig_rms > 1e-12 {
        20.0 * (err_rms / sig_rms).log10()
    } else {
        20.0 * err_rms.log10()
    };
    (snr, nf_db, err_rms as f32)
}

fn hf_lf_error(o: &[f32], d: &[f32]) -> (f32, f32) {
    let n = o.len().min(d.len());
    if n < 4 {
        return (0.0, 0.0);
    }
    let mut hf_e = 0f64;
    let mut lf_e = 0f64;
    for i in 1..n {
        let od = o[i] - o[i - 1];
        let dd = d[i] - d[i - 1];
        let he = (od - dd) as f64;
        hf_e += he * he;
        let le = (o[i] - d[i]) as f64;
        lf_e += le * le;
    }
    let hf = (hf_e / (n - 1) as f64).sqrt() as f32;
    let lf = (lf_e / n as f64).sqrt() as f32;
    (hf, lf)
}

fn stereo_mid_side_error(o: &[f32], d: &[f32], channels: u8) -> (f32, f32) {
    if channels < 2 {
        return (0.0, hf_lf_error(o, d).1);
    }
    let frames = o.len() / 2;
    let mut mid_e = 0f64;
    let mut side_e = 0f64;
    for i in 0..frames {
        let ol = o[i * 2];
        let or = o[i * 2 + 1];
        let dl = d[i * 2];
        let dr = d[i * 2 + 1];
        let om = (ol + or) * 0.5;
        let os = (ol - or) * 0.5;
        let dm = (dl + dr) * 0.5;
        let ds = (dl - dr) * 0.5;
        let me = (om - dm) as f64;
        let se = (os - ds) as f64;
        mid_e += me * me;
        side_e += se * se;
    }
    let n = frames as f64;
    ((side_e / n).sqrt() as f32, (mid_e / n).sqrt() as f32)
}

fn worst_sliding_snr(
    o: &[f32],
    d: &[f32],
    sample_rate: u32,
    channels: u8,
    win_sec: f64,
) -> (f64, f64) {
    let ch = channels.max(1) as usize;
    let win = (sample_rate as f64 * win_sec) as usize * ch;
    if win == 0 || o.len() < win {
        return (snr_db(o, d), 0.0);
    }
    let mut worst = f64::INFINITY;
    let mut worst_start = 0usize;
    let step = win / 4;
    let mut i = 0;
    while i + win <= o.len() {
        let s = snr_db(&o[i..i + win], &d[i..i + win]);
        if s < worst {
            worst = s;
            worst_start = i;
        }
        i += step.max(1);
    }
    let sec = (worst_start / ch) as f64 / sample_rate as f64;
    (worst, sec)
}

/// Four-band error energy / signal energy (LF → HF), using cascaded one-pole splits.
fn spectral_band_error_ratios(o: &[f32], d: &[f32], sample_rate: u32) -> [f64; 4] {
    let sr = sample_rate.max(8000) as f32;
    let mut bands_o = [0f64; 4];
    let mut bands_e = [0f64; 4];
    let a1 = (-2.0 * std::f32::consts::PI * 120.0 / sr).exp();
    let a2 = (-2.0 * std::f32::consts::PI * 800.0 / sr).exp();
    let a3 = (-2.0 * std::f32::consts::PI * 4000.0 / sr).exp();
    let n = o.len().min(d.len());
    let mut l1o = 0f32;
    let mut l1d = 0f32;
    let mut r1o = 0f32;
    let mut r1d = 0f32;
    let mut r2o = 0f32;
    let mut r2d = 0f32;
    let mut r3o = 0f32;
    let mut r3d = 0f32;
    for i in 0..n {
        l1o = a1 * l1o + (1.0 - a1) * o[i];
        l1d = a1 * l1d + (1.0 - a1) * d[i];
        let b0o = o[i] - l1o;
        let b0d = d[i] - l1d;
        r1o = a2 * r1o + (1.0 - a2) * b0o;
        r1d = a2 * r1d + (1.0 - a2) * b0d;
        let b1o = b0o - r1o;
        let b1d = b0d - r1d;
        r2o = a3 * r2o + (1.0 - a3) * b1o;
        r2d = a3 * r2d + (1.0 - a3) * b1d;
        let b2o = b1o - r2o;
        let b2d = b1d - r2d;
        let b3o = b2o - r2o;
        let b3d = b2d - r2d;
        let errs = [
            (l1o - l1d) as f64,
            (b0o - b0d) as f64,
            (b1o - b1d) as f64,
            (b3o - b3d) as f64,
        ];
        let sigs = [l1o as f64, b0o as f64, b1o as f64, b3o as f64];
        for b in 0..4 {
            bands_e[b] += errs[b] * errs[b];
            bands_o[b] += sigs[b] * sigs[b];
        }
    }
    let mut out = [0.0; 4];
    for b in 0..4 {
        out[b] = if bands_o[b] > 1e-20 {
            (bands_e[b] / bands_o[b]).sqrt()
        } else {
            0.0
        };
    }
    out
}

pub fn hiss_score(m: &ArtifactMetrics) -> f64 {
    // Lower is better for listening; combines quiet noise floor + HF error + worst 1s.
    let nf = (-m.quiet_noise_floor_db).max(0.0);
    let hf = m.hf_err_rms as f64 * 1000.0;
    let w1 = (40.0 - m.worst_1s_snr_db).max(0.0);
    nf * 0.5 + hf * 2.0 + w1 * 0.3
}
