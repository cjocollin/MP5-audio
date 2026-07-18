//! MP5-C3 — lab-only MDCT loud-path spike (psychoacoustic redesign Phase 0).
//!
//! Distinct bitstream magic `0x4D 0x33` ("M3"). Does **not** modify MP5-C v5.1
//! (`mp5c/**`). Quiet/fragile protection remains the job of vNext (`mp5c2`);
//! this module is a standalone lossy encoder for measurement and, if it passes
//! go criteria, a future `TAG_LOSSY` payload replacement.

pub mod mdct;
mod pack;

use crate::mp5c::Preset;
use crate::pcm;
use mdct::{analyze_frame, sine_window, synthesize_frame, COEFFS, HOP, N};
use pack::{pack_coeffs, unpack_coeffs};

const MAGIC0: u8 = 0x4d; // 'M'
const MAGIC1: u8 = 0x33; // '3'
const HEADER_LEN: usize = 10;
const NUM_BANDS: usize = 32;

/// Noise floor fraction of per-band RMS used as quant step (signal-relative).
fn noise_frac(preset: Preset) -> f32 {
    match preset {
        Preset::Low => 0.12,
        Preset::Standard => 0.06,
        Preset::High => 0.028,
        Preset::Extreme => 0.018,
    }
}

fn min_step(preset: Preset) -> f32 {
    match preset {
        Preset::Low => 0.008,
        Preset::Standard => 0.0035,
        Preset::High => 0.0018,
        Preset::Extreme => 0.0010,
    }
}

fn band_bounds(n_coeffs: usize) -> Vec<(usize, usize)> {
    let mut bounds = Vec::with_capacity(NUM_BANDS);
    let mut prev = 0usize;
    for b in 1..=NUM_BANDS {
        let t = b as f32 / NUM_BANDS as f32;
        let edge = ((t * t) * n_coeffs as f32).round() as usize;
        let end = edge.max(prev + 1).min(n_coeffs);
        bounds.push((prev, end));
        prev = end;
        if prev >= n_coeffs {
            break;
        }
    }
    if let Some(last) = bounds.last_mut() {
        last.1 = n_coeffs;
    }
    bounds
}

fn quantize_bands(coeffs: &[f32], preset: Preset) -> (Vec<i16>, Vec<f32>) {
    let bounds = band_bounds(coeffs.len());
    let nf = noise_frac(preset);
    let ms = min_step(preset);
    let mut steps = vec![ms; bounds.len()];
    let mut band_rms = vec![0f32; bounds.len()];
    let mut q = vec![0i16; coeffs.len()];
    for (bi, &(s, e)) in bounds.iter().enumerate() {
        let mut sumsq = 0f32;
        let mut peak = 0f32;
        for &c in &coeffs[s..e] {
            sumsq += c * c;
            let a = c.abs();
            if a > peak {
                peak = a;
            }
        }
        let n = (e - s).max(1) as f32;
        band_rms[bi] = (sumsq / n).sqrt();
        steps[bi] = (band_rms[bi] * nf).max(ms).max(peak * 1e-4);
    }
    // Masking-inspired: louder low bands permit coarser high-band steps.
    let low_mask = band_rms.get(0).copied().unwrap_or(0.0)
        .max(band_rms.get(1).copied().unwrap_or(0.0));
    for bi in 0..bounds.len() {
        let t = bi as f32 / bounds.len().max(1) as f32;
        if t > 0.35 && low_mask > 1e-4 {
            let mask_boost = 1.0 + (low_mask * 8.0).min(2.5) * ((t - 0.35) / 0.65);
            steps[bi] = (steps[bi] * mask_boost).max(ms);
        }
    }
    for (bi, &(s, e)) in bounds.iter().enumerate() {
        let step = steps[bi];
        for i in s..e {
            let v = (coeffs[i] / step).round();
            q[i] = v.clamp(-32767.0, 32767.0) as i16;
        }
    }
    (q, steps)
}

/// Simple transient scale: if frame time energy rises sharply vs previous hop,
/// tighten quant (pre-echo control) by shrinking all steps.
fn transient_tighten(steps: &mut [f32], frame: &[f32], prev_e: f32) -> f32 {
    let e: f32 = frame.iter().map(|x| x * x).sum::<f32>() / frame.len().max(1) as f32;
    if prev_e > 1e-8 && e > prev_e * 6.0 {
        for s in steps.iter_mut() {
            *s *= 0.55;
        }
    }
    e
}

fn dequantize_bands(q: &[i16], steps: &[f32]) -> Vec<f32> {
    let bounds = band_bounds(q.len());
    let mut out = vec![0f32; q.len()];
    for (bi, &(s, e)) in bounds.iter().enumerate() {
        let step = steps.get(bi).copied().unwrap_or(0.001);
        for i in s..e {
            out[i] = q[i] as f32 * step;
        }
    }
    out
}

fn encode_channel(samples: &[f32], preset: Preset, window: &[f32]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut pos = 0usize;
    let padded_len = if samples.len() <= N {
        N
    } else {
        let hops = (samples.len() + HOP - 1) / HOP;
        ((hops.saturating_sub(1)) * HOP + N).max(samples.len())
    };
    let mut padded = vec![0f32; padded_len];
    padded[..samples.len()].copy_from_slice(samples);

    let mut prev_e = 0f32;
    while pos + N <= padded.len() && pos < samples.len() {
        let frame = &padded[pos..pos + N];
        let mut coeffs = analyze_frame(frame, window);
        // Forward MDCT is unnormalized (O(M)); scale to ~sample magnitude for i16 quant.
        let inv_m = 1.0 / COEFFS as f32;
        for c in coeffs.iter_mut() {
            *c *= inv_m;
        }
        let (mut q, mut steps) = quantize_bands(&coeffs, preset);
        let e_now = transient_tighten(&mut steps, frame, prev_e);
        if e_now != prev_e && e_now > prev_e * 6.0 && prev_e > 1e-8 {
            // Re-quantize with tightened steps for pre-echo control.
            let bounds = band_bounds(coeffs.len());
            for (bi, &(s, e)) in bounds.iter().enumerate() {
                let step = steps[bi];
                for i in s..e {
                    let v = (coeffs[i] / step).round();
                    q[i] = v.clamp(-32767.0, 32767.0) as i16;
                }
            }
        }
        prev_e = e_now;
        let packed = pack_coeffs(&q);
        out.push(steps.len() as u8);
        for &st in &steps {
            out.extend(&st.to_le_bytes());
        }
        out.extend(&(packed.len() as u32).to_le_bytes());
        out.extend(&packed);
        pos += HOP;
        if pos >= samples.len() {
            break;
        }
    }
    out
}

fn decode_channel(data: &[u8], frames: usize, window: &[f32]) -> Result<(Vec<f32>, usize), String> {
    let mut pos = 0usize;
    let mut out = vec![0f32; frames + N];
    let mut hop_pos = 0usize;
    while hop_pos < frames {
        if pos >= data.len() {
            break;
        }
        if pos + 1 > data.len() {
            return Err("truncated mp5c3 band count".into());
        }
        let nb = data[pos] as usize;
        pos += 1;
        if pos + nb * 4 > data.len() {
            return Err("truncated mp5c3 steps".into());
        }
        let mut steps = Vec::with_capacity(nb);
        for _ in 0..nb {
            steps.push(f32::from_le_bytes(data[pos..pos + 4].try_into().unwrap()));
            pos += 4;
        }
        if pos + 4 > data.len() {
            return Err("truncated mp5c3 pack len".into());
        }
        let plen = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;
        if pos + plen > data.len() {
            return Err("truncated mp5c3 pack".into());
        }
        let q = unpack_coeffs(&data[pos..pos + plen])?;
        pos += plen;
        if q.len() != COEFFS {
            return Err(format!("mp5c3 coeff count {} != {COEFFS}", q.len()));
        }
        let mut coeffs = dequantize_bands(&q, &steps);
        let m_scale = COEFFS as f32;
        for c in coeffs.iter_mut() {
            *c *= m_scale;
        }
        let y = synthesize_frame(&coeffs, window);
        for i in 0..N {
            let idx = hop_pos + i;
            if idx < out.len() {
                out[idx] += y[i];
            }
        }
        hop_pos += HOP;
    }
    out.truncate(frames);
    Ok((out, pos))
}

/// Encode interleaved i16 PCM with the MDCT lab codec.
/// Pads each channel with `HOP` zeros on both ends so OLA reconstructs the
/// full original duration (standard MDCT edge handling).
pub fn encode(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    let ch = channels.max(1) as usize;
    let frames = samples.len() / ch;
    let window = sine_window(N);
    let planar = pcm::deinterleave_i16(samples, ch);
    let mut out = vec![MAGIC0, MAGIC1, ch as u8, preset as u8];
    out.extend(&(N as u16).to_le_bytes());
    out.extend(&(frames as u32).to_le_bytes());
    debug_assert_eq!(out.len(), HEADER_LEN);

    for c in 0..ch {
        let f32s = pcm::i16_to_f32(&planar[c]);
        let mut padded = vec![0f32; HOP + f32s.len() + HOP];
        padded[HOP..HOP + f32s.len()].copy_from_slice(&f32s);
        let payload = encode_channel(&padded, preset, &window);
        out.extend(&(payload.len() as u32).to_le_bytes());
        out.extend(&payload);
    }
    out
}

/// Decode an MP5-C3 lab stream to interleaved i16 PCM.
pub fn decode(data: &[u8]) -> Result<Vec<i16>, String> {
    if data.len() < HEADER_LEN || data[0] != MAGIC0 || data[1] != MAGIC1 {
        return Err("invalid MP5-C3 stream".into());
    }
    let ch = data[2].max(1) as usize;
    let frames = u32::from_le_bytes(data[6..10].try_into().unwrap()) as usize;
    let window = sine_window(N);
    let mut pos = HEADER_LEN;
    let mut planar: Vec<Vec<f32>> = Vec::with_capacity(ch);
    // Encoded length includes HOP pad on each side.
    let padded_frames = frames + 2 * HOP;
    for _ in 0..ch {
        if pos + 4 > data.len() {
            return Err("truncated mp5c3 channel len".into());
        }
        let plen = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;
        if pos + plen > data.len() {
            return Err("truncated mp5c3 channel".into());
        }
        let (decoded, _consumed) = decode_channel(&data[pos..pos + plen], padded_frames, &window)?;
        if decoded.len() < HOP + frames {
            return Err("mp5c3 decode shorter than expected".into());
        }
        planar.push(decoded[HOP..HOP + frames].to_vec());
        pos += plen;
    }
    let i16_planar: Vec<Vec<i16>> = planar.iter().map(|c| pcm::f32_to_i16(c)).collect();
    Ok(pcm::interleave_i16(&i16_planar))
}

/// Float-only MDCT/IMDCT OLA roundtrip (no quantization) for unit tests.
pub fn float_roundtrip(samples: &[f32]) -> Vec<f32> {
    mdct::roundtrip_ola(samples, N)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn interleave(frames: usize, ch: usize, f: impl Fn(usize, usize) -> i16) -> Vec<i16> {
        let mut s = vec![0i16; frames * ch];
        for i in 0..frames {
            for c in 0..ch {
                s[i * ch + c] = f(i, c);
            }
        }
        s
    }

    #[test]
    fn float_ola_high_snr() {
        let len = HOP * 10;
        let x: Vec<f32> = (0..len)
            .map(|i| ((i as f32) * 0.04).sin() * 0.35)
            .collect();
        let y = float_roundtrip(&x);
        let start = HOP;
        let end = len - HOP;
        let mut err = 0f64;
        let mut sig = 0f64;
        for i in start..end {
            let e = (x[i] - y[i]) as f64;
            err += e * e;
            sig += (x[i] as f64).powi(2);
        }
        let snr = 10.0 * (sig / err.max(1e-30)).log10();
        assert!(snr > 80.0, "float SNR {snr}");
    }

    #[test]
    fn silence_roundtrip_near_zero_and_duration_exact() {
        let s = vec![0i16; 4096 * 2];
        let enc = encode(&s, 2, Preset::High);
        assert_eq!(enc[0], MAGIC0);
        assert_eq!(enc[1], MAGIC1);
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), s.len(), "no duration drift");
        assert!(dec.iter().all(|&v| v.abs() <= 1));
    }

    #[test]
    fn loud_sine_roundtrips_with_finite_snr() {
        let n = 8192;
        let s = interleave(n, 2, |i, _| ((i as f64 * 0.06).sin() * 0.5 * 32767.0) as i16);
        let enc = encode(&s, 2, Preset::High);
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), s.len());
        let o = pcm::i16_to_f32(&s);
        let d = pcm::i16_to_f32(&dec);
        let snr = pcm::snr_db(&o, &d);
        assert!(snr > 25.0, "loud sine SNR too low: {snr}");
    }

    #[test]




    /// Exact lab `dense_music` fixture (6s) — Phase 0 size go/no-go.
    #[test]
    fn dense_music_fixture_size_go_nogo() {
        const SR: usize = 44100;
        let frames = SR * 6;
        let mut rng: u32 = 0xabcd_1234;
        let mut next = || {
            rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
            (rng as f64) / (u32::MAX as f64)
        };
        let mut samples = vec![0i16; frames * 2];
        for i in 0..frames {
            let t = i as f64 / SR as f64;
            let kick_env = (1.0 - (t * 2.0 - (t * 2.0).floor())).max(0.0).powi(3);
            let kick = kick_env * (t * 70.0).sin() * 14000.0;
            let tau = std::f64::consts::TAU;
            let bass = (tau * 110.0 * t).sin() * 10000.0;
            let lead = (tau * 440.0 * t).sin() * 5000.0;
            let pad = (tau * 277.0 * t).sin() * 3500.0;
            let hat = (next() * 2.0 - 1.0)
                * 1500.0
                * (((t * 8.0).floor() as i64).rem_euclid(2)) as f64;
            let l = kick + bass + lead + pad + hat;
            let r = kick + bass + lead * 0.9 + pad * 1.1 - hat;
            samples[i * 2] = l.clamp(-32768.0, 32767.0) as i16;
            samples[i * 2 + 1] = r.clamp(-32768.0, 32767.0) as i16;
        }
        let pcm = (samples.len() * 2) as f64;
        let c3 = encode(&samples, 2, Preset::High);
        let lenc = crate::mp5l::encode(&samples, 2);
        let v = crate::mp5c2::encode(&samples, 2, Preset::High);
        let r3 = c3.len() as f64 / pcm;
        let rl = lenc.len() as f64 / pcm;
        let rv = v.len() as f64 / pcm;
        let dec = decode(&c3).unwrap();
        assert_eq!(dec.len(), samples.len(), "no duration drift");
        let snr = pcm::snr_db(&pcm::i16_to_f32(&samples), &pcm::i16_to_f32(&dec));
        eprintln!(
            "GO/NO-GO dense_music: mp5c3={r3:.3} mp5l={rl:.3} vnextHigh={rv:.3} SNR={snr:.1} (5% thr {thr:.3})",
            thr = rv * 0.95
        );
        assert!(
            r3 <= rv * 0.95,
            "NO-GO: mp5c3 {r3:.3} not >=5% better than vNext High {rv:.3}"
        );
    }

    #[test]
    fn magic_rejects_mp5c_and_vnext() {
        assert!(decode(&[0x43, 0x34, 0, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert!(decode(&[0x43, 0x06, 0, 0, 0, 0, 0, 0, 0, 0]).is_err());
    }
}
