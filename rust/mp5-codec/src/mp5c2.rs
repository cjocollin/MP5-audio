//! MP5-C2 / vNext: adaptive lossless fallback with sub-block + per-band +
//! hysteresis quiet detection, plus a C2-only signal-relative loud path.
//!
//! Quiet/fragile/decaying sub-blocks → MP5-L (bit-exact).
//! Mid/loud sub-blocks → bit-exact `min(TAG_SR+CORR, TAG_LOSSLESS)` by payload size.
//! Legacy `TAG_LOSSY` / `TAG_MDCT` units remain decodable.
//!
//! Classic MP5-C v5.1 (`mp5c::encode`) is never modified. Distinct magic
//! `0x43 0x34`. Shipping protect scale is 1.5.

use crate::mp5c::{self, Preset};
use crate::mp5c3;
use crate::mp5l;
use crate::pcm;

const MAGIC0: u8 = 0x43; // 'C'
const MAGIC1: u8 = 0x34; // '4' — native vNext / MP5-C2 container
const HEADER_LEN: usize = 10;

const SUB_BLOCK: usize = 1024; // ~23 ms at 44.1 kHz
const HF_CUTOFF_HZ: f64 = 3600.0;
const HF_PRESENT_MIN: f64 = 0.0005;
const DEFAULT_SAMPLE_RATE: u32 = 44100;

/// Target unit SNR before attaching CORR residual (dB). Below this → CORR.
const SR_CORR_SNR_DB: f64 = 52.0;
/// Peak target after normalize (fraction of full-scale).
const SR_PEAK_TARGET: f64 = 0.92;
/// Cap normalize gain so i16 won't overflow absurdly on near-silence peaks.
const SR_GAIN_MAX: f64 = 48.0;

/// Thresholds controlling how aggressively quiet/fragile/tail content goes lossless.
#[derive(Debug, Clone, Copy)]
pub struct ProtectParams {
    pub quiet_peak: f64,
    pub fragile_rms_max: f64,
    pub hf_fragile_max: f64,
    pub tail_rms_max: f64,
    pub tail_exit_peak: f64,
    pub lookahead: usize,
}

impl ProtectParams {
    /// Default vNext "smooth" thresholds (synthetic hiss risk low on quiet/tail).
    pub const DEFAULT: Self = Self {
        quiet_peak: 0.02,
        fragile_rms_max: 0.04,
        hf_fragile_max: 0.02,
        tail_rms_max: 0.06,
        tail_exit_peak: 0.06,
        lookahead: 8,
    };

    /// Widen lossless protection by `scale` (≥1.0).
    pub fn widened(scale: f64) -> Self {
        let s = scale.max(1.0);
        Self {
            quiet_peak: Self::DEFAULT.quiet_peak * s,
            fragile_rms_max: Self::DEFAULT.fragile_rms_max * s,
            hf_fragile_max: Self::DEFAULT.hf_fragile_max * s,
            tail_rms_max: Self::DEFAULT.tail_rms_max * s,
            tail_exit_peak: Self::DEFAULT.tail_exit_peak * s,
            lookahead: ((Self::DEFAULT.lookahead as f64) * s).round() as usize,
        }
    }
}

const TAG_LOSSLESS: u8 = 0x4c; // 'L' broadband-quiet
const TAG_BAND: u8 = 0x42; // 'B' per-band / decaying tail
const TAG_LOSSY: u8 = 0x43; // 'C' legacy lossy (MP5-C v5.1) — decode only for old files
const TAG_MDCT: u8 = 0x4d; // 'M' lossy MDCT (mp5c3 lab)
/// Signal-relative loud path (C2-only): normalize + MP5-C + optional CORR.
/// Uses 'F' (fine) — not 0x53, which the JS lab reserved for shaped pre-emphasis.
const TAG_SR: u8 = 0x46; // 'F'

const SR_FLAG_CORR: u8 = 0x01;
const SR_VERSION: u8 = 1;

struct SubStats {
    peak: f64,
    rms: f64,
    hf_peak: f64,
}

fn alpha_for_cutoff(hz: f64, sr: f64) -> f64 {
    let x = 2.0 * std::f64::consts::PI * hz / sr.max(8000.0);
    (1.0 - (-x).exp()).clamp(0.001, 0.999)
}

fn sub_stats(slice: &[i16], channels: usize, alpha: f64) -> SubStats {
    let mut peak = 0f64;
    let mut sumsq = 0f64;
    for &s in slice {
        let a = (s as f64).abs();
        if a > peak {
            peak = a;
        }
        let f = s as f64 / 32768.0;
        sumsq += f * f;
    }
    let frames = slice.len() / channels;
    let mut hf_peak = 0f64;
    for c in 0..channels {
        let mut st = 0f64;
        for i in 0..frames {
            let v = slice[i * channels + c] as f64 / 32768.0;
            st = alpha * v + (1.0 - alpha) * st;
            let hp = (v - st).abs();
            if hp > hf_peak {
                hf_peak = hp;
            }
        }
    }
    SubStats {
        peak: peak / 32768.0,
        rms: (sumsq / slice.len().max(1) as f64).sqrt(),
        hf_peak,
    }
}

fn future_max_peak(stats: &[SubStats], i: usize, lookahead: usize) -> f64 {
    let mut m = 0f64;
    let end = (i + lookahead).min(stats.len());
    for s in &stats[i..end] {
        if s.peak > m {
            m = s.peak;
        }
    }
    m
}

fn decide_tags(stats: &[SubStats], p: &ProtectParams) -> Vec<u8> {
    let mut tags = Vec::with_capacity(stats.len());
    let mut in_tail = false;
    for i in 0..stats.len() {
        let st = &stats[i];
        if st.peak >= p.tail_exit_peak {
            in_tail = false;
        }
        let tag = if st.peak < p.quiet_peak {
            in_tail = true;
            TAG_LOSSLESS
        } else if (st.rms < p.fragile_rms_max
            && st.hf_peak > HF_PRESENT_MIN
            && st.hf_peak < p.hf_fragile_max)
            || (st.rms < p.tail_rms_max
                && future_max_peak(stats, i, p.lookahead) < p.tail_exit_peak)
            || (in_tail && st.peak < p.tail_exit_peak)
        {
            in_tail = true;
            TAG_BAND
        } else {
            // Marker for "needs loud path" — encoder writes TAG_SR (or TAG_MDCT).
            TAG_LOSSY
        };
        tags.push(tag);
    }
    tags
}

fn push_unit(out: &mut Vec<u8>, tag: u8, n: usize, payload: &[u8]) {
    out.push(tag);
    out.extend(&(n as u32).to_le_bytes());
    out.extend(&(payload.len() as u32).to_le_bytes());
    out.extend(payload);
}

fn peak_i16(samples: &[i16]) -> i16 {
    samples.iter().map(|s| s.unsigned_abs()).max().unwrap_or(0) as i16
}

fn scale_samples(samples: &[i16], gain: f64) -> Vec<i16> {
    samples
        .iter()
        .map(|&s| {
            let v = (s as f64 * gain).round();
            v.clamp(-32768.0, 32767.0) as i16
        })
        .collect()
}

fn unit_snr_db(original: &[i16], decoded: &[i16]) -> f64 {
    let n = original.len().min(decoded.len());
    if n == 0 {
        return 0.0;
    }
    pcm::snr_db(
        &pcm::i16_to_f32(&original[..n]),
        &pcm::i16_to_f32(&decoded[..n]),
    )
}

/// Build residual for CORR. Returns `None` if any sample difference exceeds i16 range
/// (clamp would break bit-exact restore).
fn residual_i16_exact(samples: &[i16], recon: &[i16]) -> Option<Vec<i16>> {
    let mut residual = Vec::with_capacity(samples.len());
    for (i, &s) in samples.iter().enumerate() {
        let d = recon.get(i).copied().unwrap_or(0);
        let diff = s as i32 - d as i32;
        if diff < i16::MIN as i32 || diff > i16::MAX as i32 {
            return None;
        }
        residual.push(diff as i16);
    }
    Some(residual)
}

/// Encode one loud unit: normalize → classic MP5-C → always attach CORR (bit-exact).
/// Returns `None` when residual would clamp (caller must fall back to MP5-L).
fn encode_sr_unit_bitexact(samples: &[i16], channels: u8, preset: Preset) -> Option<Vec<u8>> {
    let peak = peak_i16(samples) as f64 / 32768.0;
    let gain = if peak < 1e-8 {
        1.0
    } else {
        (SR_PEAK_TARGET / peak).clamp(1.0, SR_GAIN_MAX)
    };
    let gain_q8 = (gain * 256.0).round().clamp(256.0, 65535.0) as u16;
    let gain_applied = gain_q8 as f64 / 256.0;

    let scaled = scale_samples(samples, gain_applied);
    let base = mp5c::encode(&scaled, channels, preset);
    let decoded_scaled = mp5c::decode(&base).unwrap_or_default();
    let inv = 1.0 / gain_applied;
    let mut recon = scale_samples(&decoded_scaled, inv);
    if recon.len() > samples.len() {
        recon.truncate(samples.len());
    } else if recon.len() < samples.len() {
        recon.resize(samples.len(), 0);
    }

    let residual = residual_i16_exact(samples, &recon)?;
    let corr = mp5l::encode(&residual, channels);

    let mut out = Vec::with_capacity(8 + base.len() + 4 + corr.len());
    out.push(SR_VERSION);
    out.extend(&gain_q8.to_le_bytes());
    out.push(SR_FLAG_CORR);
    out.extend(&(base.len() as u32).to_le_bytes());
    out.extend(&base);
    out.extend(&(corr.len() as u32).to_le_bytes());
    out.extend(&corr);
    Some(out)
}

/// Pick smaller bit-exact loud payload: SR+CORR vs MP5-L. Tie → MP5-L.
fn encode_loud_min_exact(samples: &[i16], channels: u8, preset: Preset) -> (u8, Vec<u8>) {
    let lossless = mp5l::encode(samples, channels);
    match encode_sr_unit_bitexact(samples, channels, preset) {
        Some(sr) if sr.len() < lossless.len() => (TAG_SR, sr),
        _ => (TAG_LOSSLESS, lossless),
    }
}

/// Legacy SNR-gated SR encode (lab / decode-compat only; shipping path uses [`encode_loud_min_exact`]).
#[allow(dead_code)]
fn encode_sr_unit(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    let peak = peak_i16(samples) as f64 / 32768.0;
    let gain = if peak < 1e-8 {
        1.0
    } else {
        (SR_PEAK_TARGET / peak).clamp(1.0, SR_GAIN_MAX)
    };
    let gain_q8 = (gain * 256.0).round().clamp(256.0, 65535.0) as u16;
    let gain_applied = gain_q8 as f64 / 256.0;

    let scaled = scale_samples(samples, gain_applied);
    let base = mp5c::encode(&scaled, channels, preset);
    let decoded_scaled = mp5c::decode(&base).unwrap_or_default();
    let inv = 1.0 / gain_applied;
    let mut recon = scale_samples(&decoded_scaled, inv);
    if recon.len() > samples.len() {
        recon.truncate(samples.len());
    } else if recon.len() < samples.len() {
        recon.resize(samples.len(), 0);
    }

    let snr = unit_snr_db(samples, &recon);
    let need_corr = !snr.is_finite() || snr < SR_CORR_SNR_DB;

    let mut out = Vec::with_capacity(8 + base.len() + 64);
    out.push(SR_VERSION);
    out.extend(&gain_q8.to_le_bytes());
    let mut flags = 0u8;
    if need_corr {
        flags |= SR_FLAG_CORR;
    }
    out.push(flags);
    out.extend(&(base.len() as u32).to_le_bytes());
    out.extend(&base);

    if need_corr {
        if let Some(residual) = residual_i16_exact(samples, &recon) {
            let corr = mp5l::encode(&residual, channels);
            out.extend(&(corr.len() as u32).to_le_bytes());
            out.extend(&corr);
        } else {
            // Clamp would break exactness — omit CORR (legacy path only).
        }
    }
    out
}

fn decode_sr_unit(payload: &[u8]) -> Result<Vec<i16>, String> {
    if payload.len() < 1 + 2 + 1 + 4 {
        return Err("truncated MP5-C2 TAG_SR payload".into());
    }
    let ver = payload[0];
    if ver != SR_VERSION {
        return Err(format!("unsupported MP5-C2 TAG_SR version {ver}"));
    }
    let gain_q8 = u16::from_le_bytes(payload[1..3].try_into().unwrap());
    let flags = payload[3];
    let base_len = u32::from_le_bytes(payload[4..8].try_into().unwrap()) as usize;
    let mut pos = 8;
    if pos + base_len > payload.len() {
        return Err("truncated MP5-C2 TAG_SR base".into());
    }
    let base = &payload[pos..pos + base_len];
    pos += base_len;
    let gain = (gain_q8 as f64 / 256.0).max(1.0 / 256.0);
    let decoded_scaled = mp5c::decode(base)?;
    let mut pcm_out = scale_samples(&decoded_scaled, 1.0 / gain);

    if flags & SR_FLAG_CORR != 0 {
        if pos + 4 > payload.len() {
            return Err("truncated MP5-C2 TAG_SR corr length".into());
        }
        let corr_len = u32::from_le_bytes(payload[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;
        if pos + corr_len > payload.len() {
            return Err("truncated MP5-C2 TAG_SR corr".into());
        }
        let residual = mp5l::decode(&payload[pos..pos + corr_len])?;
        for (i, r) in residual.iter().enumerate() {
            if i < pcm_out.len() {
                pcm_out[i] = (pcm_out[i] as i32 + *r as i32).clamp(-32768, 32767) as i16;
            }
        }
    }
    Ok(pcm_out)
}

/// Inspect unit-tag mix for diagnostics (frame counts and payload bytes per tag).
pub fn inspect_unit_mix(data: &[u8]) -> Result<UnitMix, String> {
    if data.len() < HEADER_LEN || data[0] != MAGIC0 || data[1] != MAGIC1 {
        return Err("invalid MP5-C2 stream".into());
    }
    let mut pos = HEADER_LEN;
    let mut mix = UnitMix::default();
    while pos + 9 <= data.len() {
        let tag = data[pos];
        let n = u32::from_le_bytes(data[pos + 1..pos + 5].try_into().unwrap()) as usize;
        let len = u32::from_le_bytes(data[pos + 5..pos + 9].try_into().unwrap()) as usize;
        pos += 9 + len;
        if pos > data.len() {
            return Err("truncated MP5-C2 unit".into());
        }
        mix.total_frames += n;
        mix.total_payload_bytes += len;
        match tag {
            TAG_LOSSLESS => {
                mix.lossless_l += n;
                mix.lossless_l_bytes += len;
            }
            TAG_BAND => {
                mix.lossless_b += n;
                mix.lossless_b_bytes += len;
            }
            TAG_LOSSY => {
                mix.legacy_lossy += n;
                mix.legacy_lossy_bytes += len;
            }
            TAG_SR => {
                mix.signal_relative += n;
                mix.signal_relative_bytes += len;
            }
            TAG_MDCT => {
                mix.mdct += n;
                mix.mdct_bytes += len;
            }
            _ => {
                mix.unknown += n;
                mix.unknown_bytes += len;
            }
        }
    }
    Ok(mix)
}

#[derive(Debug, Default, Clone)]
pub struct UnitMix {
    pub total_frames: usize,
    pub total_payload_bytes: usize,
    pub lossless_l: usize,
    pub lossless_l_bytes: usize,
    pub lossless_b: usize,
    pub lossless_b_bytes: usize,
    pub legacy_lossy: usize,
    pub legacy_lossy_bytes: usize,
    pub signal_relative: usize,
    pub signal_relative_bytes: usize,
    pub mdct: usize,
    pub mdct_bytes: usize,
    pub unknown: usize,
    pub unknown_bytes: usize,
}

/// Encode interleaved i16 PCM (protect 1.5, sample rate 44.1 kHz assumed).
pub fn encode(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    encode_at_rate(samples, channels, preset, DEFAULT_SAMPLE_RATE)
}

/// Encode with explicit sample rate (HF detector + sub-block timing).
pub fn encode_at_rate(samples: &[i16], channels: u8, preset: Preset, sample_rate: u32) -> Vec<u8> {
    encode_with_protect_at_rate(
        samples,
        channels,
        preset,
        ProtectParams::widened(1.5),
        sample_rate,
        LoudPath::SignalRelative,
    )
}

/// Same as [`encode`] but with explicit quiet/tail protection thresholds.
pub fn encode_with_protect(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    protect: ProtectParams,
) -> Vec<u8> {
    encode_with_protect_at_rate(
        samples,
        channels,
        preset,
        protect,
        DEFAULT_SAMPLE_RATE,
        LoudPath::SignalRelative,
    )
}

/// Protect encode with explicit sample rate (shipping SR loud path).
pub fn encode_with_protect_at_rate_public(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    protect: ProtectParams,
    sample_rate: u32,
) -> Vec<u8> {
    encode_with_protect_at_rate(
        samples,
        channels,
        preset,
        protect,
        sample_rate,
        LoudPath::SignalRelative,
    )
}

/// Encode with MDCT loud path (`TAG_MDCT` / mp5c3). Quiet/fragile/tail stay MP5-L.
pub fn encode_mdct(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    encode_with_protect_mdct(samples, channels, preset, ProtectParams::widened(1.5))
}

/// Same as [`encode_mdct`] with explicit protect thresholds.
pub fn encode_with_protect_mdct(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    protect: ProtectParams,
) -> Vec<u8> {
    encode_with_protect_at_rate(
        samples,
        channels,
        preset,
        protect,
        DEFAULT_SAMPLE_RATE,
        LoudPath::Mdct,
    )
}

/// Lab/test: force legacy `TAG_LOSSY` (classic MP5-C) on loud units — for metrics.
pub fn encode_legacy_lossy_loud(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    protect: ProtectParams,
) -> Vec<u8> {
    encode_with_protect_at_rate(
        samples,
        channels,
        preset,
        protect,
        DEFAULT_SAMPLE_RATE,
        LoudPath::LegacyLossy,
    )
}

#[derive(Clone, Copy)]
enum LoudPath {
    SignalRelative,
    Mdct,
    LegacyLossy,
}

fn encode_with_protect_at_rate(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    protect: ProtectParams,
    sample_rate: u32,
    loud: LoudPath,
) -> Vec<u8> {
    let ch = channels.max(1) as usize;
    let frames = samples.len() / ch;
    let sr = sample_rate.max(8000) as f64;
    let alpha = alpha_for_cutoff(HF_CUTOFF_HZ, sr);

    let mut bounds: Vec<(usize, usize)> = Vec::new();
    let mut stats: Vec<SubStats> = Vec::new();
    let mut f = 0;
    while f < frames {
        let e = (f + SUB_BLOCK).min(frames);
        stats.push(sub_stats(&samples[f * ch..e * ch], ch, alpha));
        bounds.push((f, e));
        f = e;
    }

    let tags = decide_tags(&stats, &protect);

    let mut out = vec![MAGIC0, MAGIC1, ch as u8, preset as u8];
    out.extend(&(SUB_BLOCK as u16).to_le_bytes());
    out.extend(&(frames as u32).to_le_bytes());
    debug_assert_eq!(out.len(), HEADER_LEN);

    let mut i = 0;
    while i < bounds.len() {
        let tag = tags[i];
        let start = i;
        let mut end = i + 1;
        let mut out_tag = tag;
        if tag == TAG_LOSSY {
            while end < bounds.len() && tags[end] == TAG_LOSSY {
                end += 1;
            }
            out_tag = match loud {
                LoudPath::SignalRelative => TAG_SR,
                LoudPath::Mdct => TAG_MDCT,
                LoudPath::LegacyLossy => TAG_LOSSY,
            };
        } else {
            while end < bounds.len() && tags[end] != TAG_LOSSY {
                if tags[end] == TAG_BAND {
                    out_tag = TAG_BAND;
                }
                end += 1;
            }
        }
        let s = bounds[start].0;
        let e = bounds[end - 1].1;
        let n = e - s;
        let slice = &samples[s * ch..e * ch];
        let (out_tag, payload) = match out_tag {
            TAG_MDCT => (TAG_MDCT, mp5c3::encode(slice, ch as u8, preset)),
            TAG_LOSSY => (TAG_LOSSY, mp5c::encode(slice, ch as u8, preset)),
            TAG_SR => encode_loud_min_exact(slice, ch as u8, preset),
            _ => (out_tag, mp5l::encode(slice, ch as u8)),
        };
        push_unit(&mut out, out_tag, n, &payload);
        i = end;
    }
    out
}

/// Decode a vNext / MP5-C2 stream back to interleaved i16 PCM.
pub fn decode(data: &[u8]) -> Result<Vec<i16>, String> {
    if data.len() < HEADER_LEN || data[0] != MAGIC0 || data[1] != MAGIC1 {
        return Err("invalid MP5-C vNext stream".into());
    }
    let ch = data[2].max(1) as usize;
    let mut pos = HEADER_LEN;
    let mut out: Vec<i16> = Vec::new();
    while pos + 9 <= data.len() {
        let tag = data[pos];
        let n = u32::from_le_bytes(data[pos + 1..pos + 5].try_into().unwrap()) as usize;
        let len = u32::from_le_bytes(data[pos + 5..pos + 9].try_into().unwrap()) as usize;
        pos += 9;
        if pos + len > data.len() {
            return Err("truncated MP5-C vNext sub-block".into());
        }
        let payload = &data[pos..pos + len];
        pos += len;
        let decoded = match tag {
            TAG_LOSSY => mp5c::decode(payload)?,
            TAG_MDCT => mp5c3::decode(payload)?,
            TAG_SR => decode_sr_unit(payload)?,
            TAG_LOSSLESS | TAG_BAND => mp5l::decode(payload)?,
            other => {
                return Err(format!(
                    "unsupported MP5-C2 unit tag 0x{other:02x} (fail-closed)"
                ));
            }
        };
        let want = (n * ch).min(decoded.len());
        out.extend_from_slice(&decoded[..want]);
    }
    Ok(out)
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

    fn lossless_pct(bytes: &[u8], ch: usize) -> f64 {
        let mut pos = HEADER_LEN;
        let (mut lossless, mut total) = (0usize, 0usize);
        while pos + 9 <= bytes.len() {
            let tag = bytes[pos];
            let n = u32::from_le_bytes(bytes[pos + 1..pos + 5].try_into().unwrap()) as usize;
            let len = u32::from_le_bytes(bytes[pos + 5..pos + 9].try_into().unwrap()) as usize;
            pos += 9 + len;
            total += n;
            if tag == TAG_LOSSLESS || tag == TAG_BAND {
                lossless += n;
            }
        }
        let _ = ch;
        if total == 0 {
            0.0
        } else {
            100.0 * lossless as f64 / total as f64
        }
    }

    fn has_tag(bytes: &[u8], want: u8) -> bool {
        let mut pos = HEADER_LEN;
        while pos + 9 <= bytes.len() {
            let tag = bytes[pos];
            let len = u32::from_le_bytes(bytes[pos + 5..pos + 9].try_into().unwrap()) as usize;
            if tag == want {
                return true;
            }
            pos += 9 + len;
        }
        false
    }

    #[test]
    fn silence_is_bit_exact_and_all_lossless() {
        let s = vec![0i16; SUB_BLOCK * 5 * 2];
        let enc = encode(&s, 2, Preset::Extreme);
        assert_eq!(enc[0], 0x43);
        assert_eq!(enc[1], 0x34, "distinct vNext magic, not an MP5-C stream");
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), s.len());
        assert_eq!(dec, s);
        assert_eq!(lossless_pct(&enc, 2), 100.0);
    }

    #[test]
    fn quiet_sine_is_bit_exact() {
        let n = SUB_BLOCK * 4;
        let s = interleave(n, 2, |i, _| {
            ((i as f64 * 0.05).sin() * 0.01 * 32767.0) as i16
        });
        let enc = encode(&s, 2, Preset::Extreme);
        let dec = decode(&enc).unwrap();
        assert_eq!(dec, s, "quiet content must be lossless");
    }

    #[test]
    fn loud_then_quiet_protects_the_tail_and_is_duration_exact() {
        let n = SUB_BLOCK * 8;
        let s = interleave(n, 2, |i, _| {
            let t = i as f64 / n as f64;
            let amp = if t < 0.4 {
                0.5
            } else {
                0.5 * (-(t - 0.4) * 12.0).exp()
            };
            ((i as f64 * 0.06).sin() * amp * 32767.0) as i16
        });
        let enc = encode(&s, 2, Preset::Extreme);
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), s.len(), "no duration drift");
        assert!(
            lossless_pct(&enc, 2) > 30.0,
            "tail must be protected: {}",
            lossless_pct(&enc, 2)
        );
    }

    fn unit_count(bytes: &[u8]) -> usize {
        let mut pos = HEADER_LEN;
        let mut n = 0usize;
        while pos + 9 <= bytes.len() {
            let len = u32::from_le_bytes(bytes[pos + 5..pos + 9].try_into().unwrap()) as usize;
            pos += 9 + len;
            n += 1;
        }
        n
    }

    #[test]
    fn mdct_loud_path_protects_tail_and_duration() {
        let n = SUB_BLOCK * 8;
        let s = interleave(n, 2, |i, _| {
            let t = i as f64 / n as f64;
            let amp = if t < 0.4 {
                0.5
            } else {
                0.5 * (-(t - 0.4) * 12.0).exp()
            };
            ((i as f64 * 0.06).sin() * amp * 32767.0) as i16
        });
        let enc = encode_mdct(&s, 2, Preset::High);
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), s.len());
        assert!(lossless_pct(&enc, 2) > 30.0);
        assert!(has_tag(&enc, TAG_MDCT), "expected TAG_MDCT on loud portion");
    }

    #[test]
    fn loud_block_bitexact_min_of_sr_or_lossless() {
        let n = SUB_BLOCK * 4;
        let s = interleave(n, 2, |i, _| {
            ((i as f64 * 0.06).sin() * 0.6 * 32767.0) as i16
        });
        let enc = encode(&s, 2, Preset::Extreme);
        let dec = decode(&enc).unwrap();
        assert_eq!(dec, s, "loud path must restore original PCM bit-exactly");
        assert!(
            has_tag(&enc, TAG_SR) || has_tag(&enc, TAG_LOSSLESS),
            "loud units must be TAG_SR or TAG_LOSSLESS (min path)"
        );
        assert!(!has_tag(&enc, TAG_LOSSY), "must not use legacy TAG_LOSSY");
        let pure_l = mp5l::encode(&s, 2);
        // C2 stream = header + units; payload path must not exceed pure L + framing.
        assert!(
            enc.len() <= HEADER_LEN + 9 + pure_l.len() + 64,
            "C2 loud encode should be near or under pure MP5-L size"
        );
    }

    #[test]
    fn mid_level_min_path_is_clean_vs_legacy_lossy() {
        // ~-20 dBFS: protect inactive, classic TAG_LOSSY hisses; min(SR,L) clean.
        let n = SUB_BLOCK * 4;
        let s = interleave(n, 2, |i, _| {
            ((i as f64 * 0.07).sin() * 0.1 * 32767.0) as i16
        });
        let legacy = encode_legacy_lossy_loud(&s, 2, Preset::High, ProtectParams::widened(1.5));
        let modern = encode(&s, 2, Preset::High);
        let leg_dec = decode(&legacy).unwrap();
        let mod_dec = decode(&modern).unwrap();
        let leg_snr = unit_snr_db(&s, &leg_dec);
        assert!(
            leg_snr < 45.0,
            "legacy loud path should show audible-range SNR, got {leg_snr}"
        );
        assert_eq!(mod_dec, s, "min(SR,L) path must be bit-exact");
        assert!(has_tag(&legacy, TAG_LOSSY));
        assert!(has_tag(&modern, TAG_SR) || has_tag(&modern, TAG_LOSSLESS));
    }

    #[test]
    fn dense_music_like_loud_run_near_mp5l_size() {
        // Broadband dense content: SR+CORR is huge; min() should pick TAG_LOSSLESS.
        let n = SUB_BLOCK * 8;
        let s = interleave(n, 2, |i, c| {
            let t = i as f64;
            let v = (t * 0.11).sin() * 0.35
                + (t * 0.37).sin() * 0.25
                + (t * 1.7).sin() * 0.15
                + ((i * 17 + c * 31) % 100) as f64 / 100.0 * 0.1;
            (v * 32767.0) as i16
        });
        let enc = encode(&s, 2, Preset::High);
        let dec = decode(&enc).unwrap();
        assert_eq!(dec, s);
        let pure_l = mp5l::encode(&s, 2);
        assert!(
            enc.len() <= HEADER_LEN + 9 + pure_l.len(),
            "C2 must be ≤ pure MP5-L + framing (c2={}, l={})",
            enc.len(),
            pure_l.len()
        );
        assert!(
            has_tag(&enc, TAG_LOSSLESS),
            "dense CORR-heavy material should select TAG_LOSSLESS"
        );
        // Encoded size should match pure L plus C2 unit framing (not SR+CORR blow-up).
        assert_eq!(
            enc.len(),
            HEADER_LEN + 9 + pure_l.len(),
            "when L wins, C2 stream is header + one TAG_LOSSLESS unit"
        );
    }

    #[test]
    fn clamp_hole_falls_back_to_lossless() {
        // Force recon far from samples so residual exceeds i16 — SR candidate rejected.
        // Full-scale square vs near-zero base is hard to force via public API; unit-test
        // residual_i16_exact directly and ensure encode stays bit-exact on hot content.
        let a = vec![i16::MAX, i16::MIN, i16::MAX, i16::MIN];
        let b = vec![i16::MIN, i16::MAX, i16::MIN, i16::MAX];
        assert!(residual_i16_exact(&a, &b).is_none());
        let n = SUB_BLOCK * 2;
        let s = interleave(n, 2, |i, _| if i % 2 == 0 { i16::MAX } else { i16::MIN });
        let enc = encode(&s, 2, Preset::Extreme);
        assert_eq!(decode(&enc).unwrap(), s);
    }

    #[test]
    fn adjacent_lossy_sub_blocks_are_coalesced() {
        let n = SUB_BLOCK * 4;
        let s = interleave(n, 2, |i, _| {
            ((i as f64 * 0.06).sin() * 0.6 * 32767.0) as i16
        });
        let enc = encode(&s, 2, Preset::Extreme);
        assert_eq!(
            unit_count(&enc),
            1,
            "lossy runs must coalesce into one unit"
        );
        assert_eq!(decode(&enc).unwrap().len(), s.len());
    }

    #[test]
    fn adjacent_lossless_sub_blocks_are_coalesced() {
        let n = SUB_BLOCK * 4;
        let s = interleave(n, 2, |i, _| ((i as f64 * 0.01).sin() * 40.0) as i16);
        let enc = encode(&s, 2, Preset::Extreme);
        assert_eq!(unit_count(&enc), 1, "lossless L/B runs must coalesce");
        let dec = decode(&enc).unwrap();
        assert_eq!(dec, s, "coalesced lossless must stay bit-exact");
    }

    #[test]
    fn unknown_tag_fails_closed() {
        let s = interleave(SUB_BLOCK, 2, |i, _| {
            ((i as f64 * 0.02).sin() * 1000.0) as i16
        });
        let mut enc = encode(&s, 2, Preset::High);
        // Corrupt first unit tag to unknown
        if enc.len() > HEADER_LEN {
            enc[HEADER_LEN] = 0x58; // 'X'
        }
        assert!(decode(&enc).is_err());
    }

    #[test]
    fn sample_rate_changes_hf_alpha_decisions() {
        // Content with HF that may classify differently at 96k vs 44.1k.
        let n = SUB_BLOCK * 6;
        let s = interleave(n, 2, |i, _| {
            let lo = (i as f64 * 0.02).sin() * 0.04;
            let hi = (i as f64 * 0.8).sin() * 0.015;
            ((lo + hi) * 32767.0) as i16
        });
        let a = encode_at_rate(&s, 2, Preset::High, 44100);
        let b = encode_at_rate(&s, 2, Preset::High, 96000);
        // Both must decode; mixes may differ (sample-rate-aware HF).
        assert_eq!(decode(&a).unwrap().len(), s.len());
        assert_eq!(decode(&b).unwrap().len(), s.len());
        let ma = inspect_unit_mix(&a).unwrap();
        let mb = inspect_unit_mix(&b).unwrap();
        assert_eq!(ma.total_frames, n);
        assert_eq!(mb.total_frames, n);
    }

    #[test]
    fn does_not_alter_mp5c_public_streams() {
        let s = interleave(2048, 2, |i, _| ((i as f64 * 0.02).sin() * 16000.0) as i16);
        let mp5c_stream = mp5c::encode(&s, 2, Preset::Extreme);
        assert_eq!(mp5c_stream[0], 0x43);
        assert_eq!(mp5c_stream[1], 6, "MP5-C v5.1 unchanged");
        assert!(
            decode(&mp5c_stream).is_err(),
            "vNext decoder must reject MP5-C streams"
        );
        let vnext = encode(&s, 2, Preset::Extreme);
        assert!(
            mp5c::decode(&vnext).is_err(),
            "MP5-C decoder must reject vNext streams"
        );
    }
}
