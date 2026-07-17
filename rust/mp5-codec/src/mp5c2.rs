//! MP5-C vNext (experimental, lab-only): adaptive lossless fallback with
//! sub-block + per-band + hysteresis quiet detection.
//!
//! This is the native Rust port of the audio-lab `mp5c2-smooth` prototype. It
//! composes the EXISTING codecs — MP5-L (lossless) for quiet/fragile/decaying
//! sub-blocks and MP5-C (lossy) for loud sub-blocks — and **never changes MP5-C
//! public behavior**. Its bitstream uses a distinct `0x43 0x34` magic, is NOT a
//! valid MP5-C stream, is NOT written into normal `.mp5` exports, and has no
//! public `CodecId`. It is reachable only through `encode_mp5c_vnext` /
//! `decode_mp5c_vnext`, which the audio lab uses for measurement.
//!
//! Quality results (synthetic `reverb_tail`): hiss risk low — quiet and tail
//! windows bit-exact. See docs/MP5C_VNEXT_RESULTS.md.
//!
//! Adjacent **lossy** sub-blocks are coalesced into one MP5-C encode (avoids paying
//! the 2048-frame pad per 1024-frame unit). Adjacent **lossless** L/B sub-blocks are
//! likewise coalesced into one MP5-L encode (fewer unit headers; better Rice packing).
//! Shipping protect thresholds use scale 1.5. Lab/advanced `CodecId` MP5C2 is gated;
//! default and batch export remain MP5-L.

use crate::mp5c::{self, Preset};
use crate::mp5l;

const MAGIC0: u8 = 0x43; // 'C'
const MAGIC1: u8 = 0x34; // '4' — native vNext container (lab JS uses 0x33)
const HEADER_LEN: usize = 10;

const SUB_BLOCK: usize = 1024; // ~23 ms at 44.1 kHz
const HF_CUTOFF_HZ: f64 = 3600.0; // high band for fragile-tail detection (mirrors mp5c bands)
const HF_PRESENT_MIN: f64 = 0.0005; // ignore true HF silence

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
    /// Default vNext "smooth" thresholds (synthetic hiss risk low).
    pub const DEFAULT: Self = Self {
        quiet_peak: 0.02,
        fragile_rms_max: 0.04,
        hf_fragile_max: 0.02,
        tail_rms_max: 0.06,
        tail_exit_peak: 0.06,
        lookahead: 8,
    };

    /// Widen lossless protection by `scale` (≥1.0). Used for the Phase 4.4
    /// real-track ≥40 dB experiment. Does not change the bitstream format.
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
const TAG_LOSSY: u8 = 0x43; // 'C' lossy (MP5-C)

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

/// Encode interleaved i16 PCM with the vNext smooth engine. `preset` selects the
/// lossy fallback used on loud sub-blocks; quiet/fragile/tail sub-blocks are
/// always lossless regardless of preset.
///
/// Consecutive lossy sub-blocks coalesce into one MP5-C encode; consecutive L/B
/// (lossless) sub-blocks coalesce into one MP5-L encode.
pub fn encode(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    // Phase 4.4: protect_scale 1.5 reaches real-track hiss risk low (bit-exact tails).
    encode_with_protect(samples, channels, preset, ProtectParams::widened(1.5))
}

/// Same as [`encode`] but with explicit quiet/tail protection thresholds.
pub fn encode_with_protect(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    protect: ProtectParams,
) -> Vec<u8> {
    let ch = channels.max(1) as usize;
    let frames = samples.len() / ch;
    let alpha = alpha_for_cutoff(HF_CUTOFF_HZ, 44100.0);

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
        } else {
            // Coalesce any consecutive lossless L/B run into one MP5-L payload.
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
        let payload = if out_tag == TAG_LOSSY {
            mp5c::encode(slice, ch as u8, preset)
        } else {
            mp5l::encode(slice, ch as u8)
        };
        push_unit(&mut out, out_tag, n, &payload);
        i = end;
    }
    out
}

/// Decode a vNext stream back to interleaved i16 PCM (trimmed per sub-block).
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
        let decoded = if tag == TAG_LOSSY {
            mp5c::decode(payload)?
        } else {
            mp5l::decode(payload)?
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
            if tag != TAG_LOSSY {
                lossless += n;
            }
        }
        let _ = ch;
        if total == 0 { 0.0 } else { 100.0 * lossless as f64 / total as f64 }
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
        // ~ -40 dBFS sine: below the quiet peak threshold -> lossless -> bit-exact
        let n = SUB_BLOCK * 4;
        let s = interleave(n, 2, |i, _| ((i as f64 * 0.05).sin() * 0.01 * 32767.0) as i16);
        let enc = encode(&s, 2, Preset::Extreme);
        let dec = decode(&enc).unwrap();
        assert_eq!(dec, s, "quiet content must be lossless");
    }

    #[test]
    fn loud_then_quiet_protects_the_tail_and_is_duration_exact() {
        // first half loud, second half a decaying tail
        let n = SUB_BLOCK * 8;
        let s = interleave(n, 2, |i, _| {
            let t = i as f64 / n as f64;
            let amp = if t < 0.4 { 0.5 } else { 0.5 * (-(t - 0.4) * 12.0).exp() };
            ((i as f64 * 0.06).sin() * amp * 32767.0) as i16
        });
        let enc = encode(&s, 2, Preset::Extreme);
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), s.len(), "no duration drift");
        // the decaying tail should be protected losslessly (vs 0% for pure-loud material)
        assert!(lossless_pct(&enc, 2) > 30.0, "tail must be protected: {}", lossless_pct(&enc, 2));
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
    fn loud_block_is_lossy_not_protected() {
        let n = SUB_BLOCK * 4;
        let s = interleave(n, 2, |i, _| ((i as f64 * 0.06).sin() * 0.6 * 32767.0) as i16);
        let enc = encode(&s, 2, Preset::Extreme);
        assert_eq!(lossless_pct(&enc, 2), 0.0, "loud material must not waste lossless fallback");
        // and it still round-trips with the right length
        assert_eq!(decode(&enc).unwrap().len(), s.len());
    }

    #[test]
    fn adjacent_lossy_sub_blocks_are_coalesced() {
        // Four consecutive loud sub-blocks → one coalesced lossy unit (not four).
        let n = SUB_BLOCK * 4;
        let s = interleave(n, 2, |i, _| ((i as f64 * 0.06).sin() * 0.6 * 32767.0) as i16);
        let enc = encode(&s, 2, Preset::Extreme);
        assert_eq!(unit_count(&enc), 1, "lossy runs must coalesce into one MP5-C encode");
        assert_eq!(decode(&enc).unwrap().len(), s.len());
    }

    #[test]
    fn adjacent_lossless_sub_blocks_are_coalesced() {
        // Four consecutive quiet sub-blocks → one coalesced MP5-L unit (not four).
        let n = SUB_BLOCK * 4;
        let s = interleave(n, 2, |i, _| ((i as f64 * 0.01).sin() * 40.0) as i16);
        let enc = encode(&s, 2, Preset::Extreme);
        assert_eq!(unit_count(&enc), 1, "lossless L/B runs must coalesce into one MP5-L encode");
        let dec = decode(&enc).unwrap();
        assert_eq!(dec, s, "coalesced lossless must stay bit-exact");
    }

    #[test]
    fn does_not_alter_mp5c_public_streams() {
        // a real MP5-C stream starts 0x43 0x06 (v5.1); vNext is 0x43 0x34 and the
        // decoders reject each other's containers.
        let s = interleave(2048, 2, |i, _| ((i as f64 * 0.02).sin() * 16000.0) as i16);
        let mp5c_stream = mp5c::encode(&s, 2, Preset::Extreme);
        assert_eq!(mp5c_stream[0], 0x43);
        assert_eq!(mp5c_stream[1], 6, "MP5-C v5.1 unchanged");
        assert!(decode(&mp5c_stream).is_err(), "vNext decoder must reject MP5-C streams");
        let vnext = encode(&s, 2, Preset::Extreme);
        assert!(mp5c::decode(&vnext).is_err(), "MP5-C decoder must reject vNext streams");
    }
}
