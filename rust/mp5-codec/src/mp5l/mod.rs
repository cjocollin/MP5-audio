//! MP5-L lossless codec.
//! - v2: raw PCM blocks + CRC (legacy)
//! - v3: silence / const / LPC+Rice / raw fallback; optional M/S stereo per block

pub mod bitwriter;
pub mod block;
pub mod diag;
pub mod predict;
pub mod rice;
pub mod stereo;
pub mod varint;

use block::{decode_block_payload, encode_block_payload, FLAG_RAW};

/// Stereo transform hints in the high bits of the left-channel flag byte.
/// Clear with `STEREO_MASK` before `decode_block_payload`.
const STEREO_MASK: u8 = 0xC0;
const STEREO_MS: u8 = 0x80;
const STEREO_LS: u8 = 0x40;
const STEREO_RS: u8 = 0xC0;
use diag::{VERSION_V2, VERSION_V3};

const BLOCK_SIZE: usize = 4096;
const MIN_SILENCE_RUN: usize = 64;

/// Current encoder (v3).
pub fn encode(samples: &[i16], channels: u8) -> Vec<u8> {
    encode_v3(samples, channels)
}

/// Legacy v2 raw PCM encoder (benchmark baseline).
pub fn encode_v2_raw(samples: &[i16], channels: u8) -> Vec<u8> {
    let ch = channels.max(1) as usize;
    let per_ch: Vec<Vec<i16>> = if ch == 1 {
        vec![samples.to_vec()]
    } else {
        crate::pcm::deinterleave_i16(samples, ch)
    };
    let frames_per_ch = per_ch
        .iter()
        .map(|c| (c.len() + BLOCK_SIZE - 1) / BLOCK_SIZE)
        .max()
        .unwrap_or(0) as u32;
    let mut out = vec![0x4c, VERSION_V2];
    out.push(ch as u8);
    out.extend(&frames_per_ch.to_le_bytes());
    for channel in &per_ch {
        let mut i = 0;
        while i < channel.len() {
            let end = (i + BLOCK_SIZE).min(channel.len());
            let block = &channel[i..end];
            let payload = raw_payload(block);
            out.extend(wrap_block(block, FLAG_RAW, &payload));
            i = end;
        }
    }
    out
}

pub fn encode_v3(samples: &[i16], channels: u8) -> Vec<u8> {
    encode_version(samples, channels, VERSION_V3, false)
}

fn encode_version(samples: &[i16], channels: u8, version: u8, force_raw: bool) -> Vec<u8> {
    let ch = channels.max(1) as usize;
    let per_ch: Vec<Vec<i16>> = if ch == 1 {
        vec![samples.to_vec()]
    } else {
        crate::pcm::deinterleave_i16(samples, ch)
    };

    let plan = plan_blocks(&per_ch);

    let mut out = vec![0x4c, version];
    out.push(ch as u8);
    out.extend(&plan.frames_per_ch.to_le_bytes());

    if ch == 2 && !force_raw {
        encode_stereo_channels(&mut out, &per_ch[0], &per_ch[1], &plan);
    } else {
        for channel in &per_ch {
            encode_channel_blocks(&mut out, channel, &plan, force_raw);
        }
    }
    out
}

fn encode_stereo_channels(
    out: &mut Vec<u8>,
    left: &[i16],
    right: &[i16],
    plan: &BlockPlan,
) {
    let mut ch0_blocks: Vec<Vec<u8>> = Vec::new();
    let mut ch1_blocks: Vec<Vec<u8>> = Vec::new();
    let mut start = 0usize;
    for &end in &plan.boundaries {
        if start >= left.len() && start >= right.len() {
            break;
        }
        let block_end = end.min(left.len()).min(right.len());
        if start >= block_end {
            break;
        }
        let lb = &left[start..block_end];
        let rb = &right[start..block_end];
        let (c0, c1) = encode_stereo_block_best(lb, rb);
        ch0_blocks.push(c0);
        ch1_blocks.push(c1);
        start = block_end;
    }
    for b in ch0_blocks {
        out.extend(b);
    }
    for b in ch1_blocks {
        out.extend(b);
    }
}

/// Try independent L/R, mid/side, left-side, right-side; pick smallest verified.
fn encode_stereo_block_best(lb: &[i16], rb: &[i16]) -> (Vec<u8>, Vec<u8>) {
    let (lf, lp) = encode_block_payload(lb);
    let (rf, rp) = encode_block_payload(rb);
    let mut best0 = wrap_block(lb, lf, &lp);
    let mut best1 = wrap_block(rb, rf, &rp);
    let mut best_len = best0.len() + best1.len();

    let try_pair = |a: &[i16],
                    b: &[i16],
                    hint: u8,
                    verify: &dyn Fn(&[i16], &[i16]) -> bool|
     -> Option<(Vec<u8>, Vec<u8>)> {
        let (af, ap) = encode_block_payload(a);
        let (bf, bp) = encode_block_payload(b);
        if !payload_roundtrips(af, &ap, a) || !payload_roundtrips(bf, &bp, b) {
            return None;
        }
        if !verify(a, b) {
            return None;
        }
        Some((wrap_block(a, af | hint, &ap), wrap_block(b, bf, &bp)))
    };

    {
        let (mid, side) = stereo::encode_ms(lb, rb);
        if let Some((c0, c1)) = try_pair(&mid, &side, STEREO_MS, &|m, s| {
            let (l2, r2) = stereo::decode_ms(m, s);
            l2 == lb && r2 == rb
        }) {
            let n = c0.len() + c1.len();
            if n < best_len {
                best_len = n;
                best0 = c0;
                best1 = c1;
            }
        }
    }
    {
        let (lkeep, side) = stereo::encode_ls(lb, rb);
        if let Some((c0, c1)) = try_pair(&lkeep, &side, STEREO_LS, &|l, s| {
            let (l2, r2) = stereo::decode_ls(l, s);
            l2 == lb && r2 == rb
        }) {
            let n = c0.len() + c1.len();
            if n < best_len {
                best_len = n;
                best0 = c0;
                best1 = c1;
            }
        }
    }
    {
        let (rkeep, side) = stereo::encode_rs(lb, rb);
        if let Some((c0, c1)) = try_pair(&rkeep, &side, STEREO_RS, &|r, s| {
            let (l2, r2) = stereo::decode_rs(r, s);
            l2 == lb && r2 == rb
        }) {
            let n = c0.len() + c1.len();
            if n < best_len {
                best_len = n;
                best0 = c0;
                best1 = c1;
            }
        }
    }

    let _ = best_len;
    (best0, best1)
}

fn payload_roundtrips(flag: u8, payload: &[u8], samples: &[i16]) -> bool {
    decode_block_payload(flag, payload, samples.len())
        .map(|d| d == samples)
        .unwrap_or(false)
}

struct BlockPlan {
    frames_per_ch: u32,
    boundaries: Vec<usize>,
}

fn plan_blocks(per_ch: &[Vec<i16>]) -> BlockPlan {
    let max_len = per_ch.iter().map(|c| c.len()).max().unwrap_or(0);
    let probe = per_ch.first().map(|c| c.as_slice()).unwrap_or(&[]);
    let mut boundaries = Vec::new();
    let mut i = 0usize;
    while i < max_len {
        let hard_end = (i + BLOCK_SIZE).min(max_len);
        let mut end = silence_aware_block_end(probe, i, hard_end);
        if end <= i {
            end = hard_end;
        }
        boundaries.push(end);
        i = end;
    }
    let frames_per_ch = if boundaries.is_empty() {
        0u32
    } else {
        boundaries.len() as u32
    };
    BlockPlan {
        frames_per_ch,
        boundaries,
    }
}

/// Prefer ending a non-silent block just before a long silence run, and ending a
/// silence block when signal returns — so FLAG_SILENCE can cover whole blocks.
fn silence_aware_block_end(probe: &[i16], start: usize, hard_end: usize) -> usize {
    if probe.is_empty() || start >= hard_end {
        return hard_end;
    }
    let scan_end = hard_end.min(probe.len());
    if start >= scan_end {
        return hard_end;
    }
    let in_silence = probe[start] == 0;
    if in_silence {
        let mut j = start;
        while j < scan_end && probe[j] == 0 {
            j += 1;
        }
        if j - start >= MIN_SILENCE_RUN {
            return j;
        }
        return hard_end;
    }
    let mut run = 0usize;
    let mut run_start = start;
    for j in start..scan_end {
        if probe[j] == 0 {
            if run == 0 {
                run_start = j;
            }
            run += 1;
            if run >= MIN_SILENCE_RUN && run_start > start {
                return run_start;
            }
        } else {
            run = 0;
        }
    }
    hard_end
}

fn encode_channel_blocks(out: &mut Vec<u8>, channel: &[i16], plan: &BlockPlan, force_raw: bool) {
    let mut start = 0usize;
    for &end in &plan.boundaries {
        if start >= channel.len() {
            break;
        }
        let block_end = end.min(channel.len());
        if start >= block_end {
            break;
        }
        let block = &channel[start..block_end];
        if force_raw {
            let payload = raw_payload(block);
            out.extend(wrap_block(block, FLAG_RAW, &payload));
        } else {
            let (flag, payload) = encode_block_payload(block);
            out.extend(wrap_block(block, flag, &payload));
        }
        start = block_end;
    }
}

fn raw_payload(block: &[i16]) -> Vec<u8> {
    let mut out = Vec::with_capacity(block.len() * 2);
    for &s in block {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

fn wrap_block(samples: &[i16], flag: u8, payload: &[u8]) -> Vec<u8> {
    let len = samples.len() as u32;
    let crc = crc32(samples);
    let mut out = Vec::with_capacity(13 + payload.len());
    out.extend(&len.to_le_bytes());
    out.push(flag);
    out.extend(&crc.to_le_bytes());
    out.extend(&(payload.len() as u32).to_le_bytes());
    out.extend_from_slice(payload);
    out
}

pub fn decode(data: &[u8]) -> Result<Vec<i16>, String> {
    if data.len() < 7 || data[0] != 0x4c {
        return Err("invalid MP5-L stream".into());
    }
    if data[1] == VERSION_V2 {
        return decode_v2(data);
    }
    if data[1] != VERSION_V3 {
        return Err(format!(
            "unsupported MP5-L version {} (re-export with current converter)",
            data[1]
        ));
    }
    let ch = data[2].max(1) as usize;
    let frames_per_ch = u32::from_le_bytes(data[3..7].try_into().unwrap()) as usize;
    let mut pos = 7;
    let mut channels: Vec<Vec<i16>> = vec![vec![]; ch];

    let mut block_idx = 0usize;
    // (start, len, stereo_hint) recorded from channel 0; applied when ch1 arrives.
    let mut stereo_meta: Vec<(usize, usize, u8)> = Vec::new();
    for c in 0..ch {
        let mut bi = 0usize;
        for _ in 0..frames_per_ch {
            if pos + 13 > data.len() {
                break;
            }
            let len = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
            let mut flag = data[pos + 4];
            let stereo_hint = if c == 0 { flag & STEREO_MASK } else { 0 };
            flag &= !STEREO_MASK;
            let crc_expected = u32::from_le_bytes(data[pos + 5..pos + 9].try_into().unwrap());
            let enc_len = u32::from_le_bytes(data[pos + 9..pos + 13].try_into().unwrap()) as usize;
            let block_len = 13 + enc_len;
            if pos + block_len > data.len() {
                return Err(format!("truncated MP5-L block at index {block_idx}"));
            }
            let payload = &data[pos + 13..pos + block_len];
            let block = decode_block_payload(flag, payload, len).map_err(|e| {
                format!("block {block_idx} ch {c} flag {flag}: {e}")
            })?;
            if crc32(&block) != crc_expected {
                return Err(format!(
                    "block CRC mismatch at index {block_idx} ch {c} flag {flag} len {len}"
                ));
            }
            let start = channels[c].len();
            channels[c].extend(block);
            if c == 0 {
                stereo_meta.push((start, len, stereo_hint));
            } else if ch >= 2 && bi < stereo_meta.len() {
                let (start0, blen, hint) = stereo_meta[bi];
                if hint != 0 && blen == len {
                    let start1 = start;
                    let a = channels[0][start0..start0 + blen].to_vec();
                    let b = channels[1][start1..start1 + blen].to_vec();
                    let (l, r) = match hint {
                        STEREO_MS => stereo::decode_ms(&a, &b),
                        STEREO_LS => stereo::decode_ls(&a, &b),
                        STEREO_RS => stereo::decode_rs(&a, &b),
                        _ => (a, b),
                    };
                    channels[0][start0..start0 + blen].copy_from_slice(&l);
                    channels[1][start1..start1 + blen].copy_from_slice(&r);
                }
            }
            pos += block_len;
            block_idx += 1;
            bi += 1;
        }
    }

    if ch == 1 {
        Ok(channels[0].clone())
    } else {
        Ok(crate::pcm::interleave_i16(&channels))
    }
}

/// v2 streams are always raw PCM blocks (legacy; ignores flag byte).
pub fn decode_v2(data: &[u8]) -> Result<Vec<i16>, String> {
    let ch = data[2].max(1) as usize;
    let frames_per_ch = u32::from_le_bytes(data[3..7].try_into().unwrap()) as usize;
    let mut pos = 7;
    let mut channels: Vec<Vec<i16>> = vec![vec![]; ch];

    for c in 0..ch {
        for _ in 0..frames_per_ch {
            if pos + 13 > data.len() {
                break;
            }
            let len = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
            let crc_expected = u32::from_le_bytes(data[pos + 5..pos + 9].try_into().unwrap());
            let enc_len = u32::from_le_bytes(data[pos + 9..pos + 13].try_into().unwrap()) as usize;
            if enc_len != len.saturating_mul(2) || data.len() < pos + 13 + enc_len {
                return Err("truncated MP5-L v2 block".into());
            }
            let mut block = Vec::with_capacity(len);
            let mut o = pos + 13;
            for _ in 0..len {
                block.push(i16::from_le_bytes(data[o..o + 2].try_into().unwrap()));
                o += 2;
            }
            if crc32(&block) != crc_expected {
                return Err("block CRC mismatch".into());
            }
            channels[c].extend(block);
            pos += 13 + enc_len;
        }
    }

    if ch == 1 {
        Ok(channels[0].clone())
    } else {
        Ok(crate::pcm::interleave_i16(&channels))
    }
}

fn crc32(data: &[i16]) -> u32 {
    let bytes: Vec<u8> = data.iter().flat_map(|s| s.to_le_bytes()).collect();
    let mut crc = 0xffffffffu32;
    for b in bytes {
        crc ^= b as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                0xedb88320 ^ (crc >> 1)
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_lossless() {
        let samples: Vec<i16> = (0..8000)
            .map(|i| ((i as f32 * 0.01).sin() * 20000.0) as i16)
            .collect();
        let enc = encode(&samples, 1);
        assert_eq!(enc[1], VERSION_V3);
        let dec = decode(&enc).unwrap();
        assert_eq!(samples, dec);
    }

    #[test]
    fn v2_legacy_decode() {
        let samples: Vec<i16> = vec![1, 2, 3, 4, 5, 6];
        let enc = encode_v2_raw(&samples, 1);
        assert_eq!(enc[1], VERSION_V2);
        let dec = decode(&enc).unwrap();
        assert_eq!(samples, dec);
    }

    #[test]
    fn stereo_roundtrip() {
        let mut interleaved = Vec::new();
        for i in 0..4096 {
            interleaved.push(((i as f32 * 0.02).sin() * 10000.0) as i16);
            interleaved.push(((i as f32 * 0.03).cos() * 8000.0) as i16);
        }
        let enc = encode(&interleaved, 2);
        let dec = decode(&enc).unwrap();
        assert_eq!(interleaved, dec);
    }

    #[test]
    fn silence_compresses() {
        let silence = vec![0i16; 8192];
        let enc = encode(&silence, 1);
        let pcm_bytes = silence.len() * 2;
        assert!(enc.len() < pcm_bytes / 4, "silence should compress heavily");
        let dec = decode(&enc).unwrap();
        assert_eq!(silence, dec);
    }

    #[test]
    fn origami_sized_roundtrip_bit_exact() {
        // Regression: long stereo-ish buffer must round-trip exactly.
        let mut samples = Vec::new();
        for i in 0..12000 {
            samples.push(((i as f32 * 0.01).sin() * 15000.0) as i16);
            samples.push(((i as f32 * 0.013).cos() * 12000.0) as i16);
        }
        let enc = encode(&samples, 2);
        let dec = decode(&enc).unwrap();
        assert_eq!(samples, dec);
    }

    #[test]
    fn v3_smaller_than_v2_on_sine() {
        let samples: Vec<i16> = (0..48000)
            .map(|i| ((i as f32 * 0.02).sin() * 20000.0) as i16)
            .collect();
        let v2 = encode_v2_raw(&samples, 1);
        let v3 = encode(&samples, 1);
        assert!(
            v3.len() <= v2.len(),
            "v3 must not exceed v2 raw: v3 {} vs v2 {}",
            v3.len(),
            v2.len()
        );
        assert_eq!(samples, decode(&v3).unwrap());
    }

    #[test]
    fn silence_aware_plan_splits_before_long_silence() {
        let mut ch = vec![1000i16; 200];
        ch.extend(std::iter::repeat(0i16).take(128));
        ch.extend(std::iter::repeat(500i16).take(100));
        let plan = plan_blocks(&[ch.clone()]);
        assert!(
            plan.boundaries.len() >= 2,
            "expected silence split, got {:?}",
            plan.boundaries
        );
        assert_eq!(plan.boundaries[0], 200);
        let enc = encode(&ch, 1);
        assert_eq!(decode(&enc).unwrap(), ch);
    }
}
