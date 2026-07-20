//! MP5-L lossless codec.
//! - v2: raw PCM blocks + CRC (legacy)
//! - v3: silence / const / LPC+Rice / raw fallback; optional M/S stereo per block

pub mod bitwriter;
pub mod block;
pub mod diag;
pub mod predict;
pub mod qlp;
pub mod rice;
pub mod stereo;
pub mod varint;

use block::{
    decode_block_payload, decode_i32_rice_payload, encode_block_payload, encode_block_payload_v4,
    encode_i32_rice_payload, FLAG_I32_RICE, FLAG_QLP, FLAG_RAW,
};

/// Stereo transform hints in the high bits of the left-channel flag byte.
/// Clear with `STEREO_MASK` before `decode_block_payload`.
const STEREO_MASK: u8 = 0xC0;
const STEREO_MS: u8 = 0x80;
const STEREO_LS: u8 = 0x40;
const STEREO_RS: u8 = 0xC0;
use diag::{VERSION_V2, VERSION_V3, VERSION_V4};

const BLOCK_SIZE: usize = 4096;
const MIN_SILENCE_RUN: usize = 64;
const SEEK_MAGIC: &[u8; 4] = b"SEEK";

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

/// Experimental v4 encoder. Frames are interleaved by block boundary and an
/// absolute-offset seek table immediately follows the seven-byte header.
pub fn encode_v4(samples: &[i16], channels: u8) -> Vec<u8> {
    let channel_count = channels.max(1) as usize;
    let per_channel = if channel_count == 1 {
        vec![samples.to_vec()]
    } else {
        crate::pcm::deinterleave_i16(samples, channel_count)
    };
    let plan = plan_blocks(&per_channel);
    let mut frames: Vec<(u64, Vec<u8>)> = Vec::new();
    let mut start = 0usize;
    for &boundary in &plan.boundaries {
        let end = boundary.min(per_channel.first().map(Vec::len).unwrap_or(0));
        if start >= end {
            break;
        }
        let mut frame = Vec::new();
        if channel_count == 2 {
            let (first, second) = encode_stereo_block_best_v4(
                &per_channel[0][start..end],
                &per_channel[1][start..end],
            );
            frame.extend_from_slice(&first);
            frame.extend_from_slice(&second);
        } else {
            for channel in &per_channel {
                let channel_end = end.min(channel.len());
                if start >= channel_end {
                    continue;
                }
                let block = &channel[start..channel_end];
                let (flag, payload) = encode_block_payload_v4(block);
                frame.extend_from_slice(&wrap_block(block, flag, &payload));
            }
        }
        frames.push((start as u64, frame));
        start = end;
    }

    let mut out = vec![0x4c, VERSION_V4, channel_count as u8];
    out.extend_from_slice(&(frames.len() as u32).to_le_bytes());
    out.extend_from_slice(SEEK_MAGIC);
    out.extend_from_slice(&(frames.len() as u32).to_le_bytes());
    let frame_data_start = 7usize + 8 + frames.len() * 16;
    let mut offset = frame_data_start as u64;
    for (sample_offset, frame) in &frames {
        out.extend_from_slice(&sample_offset.to_le_bytes());
        out.extend_from_slice(&offset.to_le_bytes());
        offset += frame.len() as u64;
    }
    for (_, frame) in frames {
        out.extend_from_slice(&frame);
    }
    out
}

fn encode_stereo_block_best_v4(left: &[i16], right: &[i16]) -> (Vec<u8>, Vec<u8>) {
    let (left_flag, left_payload) = encode_block_payload_v4(left);
    let (right_flag, right_payload) = encode_block_payload_v4(right);
    let mut best = (
        wrap_block(left, left_flag, &left_payload),
        wrap_block(right, right_flag, &right_payload),
    );
    let mut best_len = best.0.len() + best.1.len();

    let mut try_side = |first: &[i16], side: &[i32], hint: u8, verified: bool| {
        if !verified {
            return;
        }
        let (first_flag, first_payload) = encode_block_payload_v4(first);
        let side_payload = encode_i32_rice_payload(side);
        let first_block = wrap_block(first, first_flag | hint, &first_payload);
        let side_block = wrap_i32_block(side, FLAG_I32_RICE, &side_payload);
        let total = first_block.len() + side_block.len();
        if total < best_len {
            best_len = total;
            best = (first_block, side_block);
        }
    };

    let (mid, side) = stereo::encode_ms_i32(left, right);
    try_side(
        &mid,
        &side,
        STEREO_MS,
        stereo::decode_ms_i32(&mid, &side)
            .map(|pair| pair.0 == left && pair.1 == right)
            .unwrap_or(false),
    );
    let (left_keep, side) = stereo::encode_ls_i32(left, right);
    try_side(
        &left_keep,
        &side,
        STEREO_LS,
        stereo::decode_ls_i32(&left_keep, &side)
            .map(|pair| pair.0 == left && pair.1 == right)
            .unwrap_or(false),
    );
    let (right_keep, side) = stereo::encode_rs_i32(left, right);
    try_side(
        &right_keep,
        &side,
        STEREO_RS,
        stereo::decode_rs_i32(&right_keep, &side)
            .map(|pair| pair.0 == left && pair.1 == right)
            .unwrap_or(false),
    );
    best
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

fn encode_stereo_channels(out: &mut Vec<u8>, left: &[i16], right: &[i16], plan: &BlockPlan) {
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
        let (side_flag, side_payload) = encode_block_payload(&side);
        let verified = payload_roundtrips(lf, &lp, &lkeep)
            && payload_roundtrips(side_flag, &side_payload, &side)
            && {
                let (l2, r2) = stereo::decode_ls(&lkeep, &side);
                l2 == lb && r2 == rb
            };
        if verified {
            let c0 = wrap_block(&lkeep, lf | STEREO_LS, &lp);
            let c1 = wrap_block(&side, side_flag, &side_payload);
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
        let (side_flag, side_payload) = encode_block_payload(&side);
        let verified = payload_roundtrips(rf, &rp, &rkeep)
            && payload_roundtrips(side_flag, &side_payload, &side)
            && {
                let (l2, r2) = stereo::decode_rs(&rkeep, &side);
                l2 == lb && r2 == rb
            };
        if verified {
            let c0 = wrap_block(&rkeep, rf | STEREO_RS, &rp);
            let c1 = wrap_block(&side, side_flag, &side_payload);
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
        // Verified adaptive split: whole window vs 2× / 4× (probe channel cost).
        for e in adaptive_split_ends(probe, i, end) {
            boundaries.push(e);
        }
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

/// Approximate wrapped-block byte cost for adaptive planning.
fn block_encode_cost(samples: &[i16]) -> usize {
    if samples.is_empty() {
        return 0;
    }
    let (_flag, payload) = encode_block_payload(samples);
    13 + payload.len()
}

/// Try keeping `[start, end)` as one block vs 2 or 4 equal splits; return end offsets.
fn adaptive_split_ends(probe: &[i16], start: usize, end: usize) -> Vec<usize> {
    let len = end.saturating_sub(start);
    if len < 1024 || probe.is_empty() || start >= probe.len() {
        return vec![end];
    }
    let slice_end = end.min(probe.len());
    if start >= slice_end {
        return vec![end];
    }
    let cost = |a: usize, b: usize| -> usize {
        let a = a.min(probe.len());
        let b = b.min(probe.len());
        if a >= b {
            return 0;
        }
        block_encode_cost(&probe[a..b])
    };
    let c1 = cost(start, slice_end);
    let mid = start + len / 2;
    let c2 = cost(start, mid) + cost(mid, slice_end);
    let q = len / 4;
    let c4 = if q >= 256 {
        cost(start, start + q)
            + cost(start + q, start + 2 * q)
            + cost(start + 2 * q, start + 3 * q)
            + cost(start + 3 * q, slice_end)
    } else {
        usize::MAX
    };

    if c4 < c1 && c4 <= c2 {
        return vec![start + q, start + 2 * q, start + 3 * q, end];
    }
    if c2 < c1 {
        return vec![mid, end];
    }
    vec![end]
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

fn wrap_i32_block(samples: &[i32], flag: u8, payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(13 + payload.len());
    out.extend_from_slice(&(samples.len() as u32).to_le_bytes());
    out.push(flag);
    out.extend_from_slice(&crc32_i32(samples).to_le_bytes());
    out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
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
    if data[1] == VERSION_V4 {
        return decode_v4(data);
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
            if flag == FLAG_QLP || flag == FLAG_I32_RICE {
                return Err(format!("v3 stream uses v4-only block flag {flag}"));
            }
            let crc_expected = u32::from_le_bytes(data[pos + 5..pos + 9].try_into().unwrap());
            let enc_len = u32::from_le_bytes(data[pos + 9..pos + 13].try_into().unwrap()) as usize;
            let block_len = 13 + enc_len;
            if pos + block_len > data.len() {
                return Err(format!("truncated MP5-L block at index {block_idx}"));
            }
            let payload = &data[pos + 13..pos + block_len];
            let block = decode_block_payload(flag, payload, len)
                .map_err(|e| format!("block {block_idx} ch {c} flag {flag}: {e}"))?;
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

#[derive(Clone, Debug)]
struct SeekEntry {
    sample_offset: u64,
    byte_offset: usize,
}

fn parse_v4_prefix(data: &[u8]) -> Result<Option<(usize, usize, Vec<SeekEntry>)>, String> {
    if data.len() < 7 {
        return Ok(None);
    }
    if data[0] != 0x4c || data[1] != VERSION_V4 {
        return Err("stream decoder requires MP5-L v4".into());
    }
    let channels = data[2].max(1) as usize;
    let frames = u32::from_le_bytes(
        data[3..7]
            .try_into()
            .map_err(|_| "v4 frame count truncated")?,
    ) as usize;
    if data.len() < 15 {
        return Ok(None);
    }
    if &data[7..11] != SEEK_MAGIC {
        return Err("MP5-L v4 seek table missing".into());
    }
    let count = u32::from_le_bytes(
        data[11..15]
            .try_into()
            .map_err(|_| "v4 seek count truncated")?,
    ) as usize;
    if count != frames {
        return Err(format!("v4 seek count {count} != frame count {frames}"));
    }
    let table_bytes = count
        .checked_mul(16)
        .and_then(|bytes| bytes.checked_add(15))
        .ok_or("v4 seek table size overflow")?;
    if data.len() < table_bytes {
        return Ok(None);
    }
    let mut entries = Vec::with_capacity(count);
    let mut position = 15usize;
    let mut previous_sample = 0u64;
    let mut previous_byte = table_bytes;
    for index in 0..count {
        let sample_offset = u64::from_le_bytes(
            data[position..position + 8]
                .try_into()
                .map_err(|_| "v4 seek sample offset truncated")?,
        );
        let byte_offset_u64 = u64::from_le_bytes(
            data[position + 8..position + 16]
                .try_into()
                .map_err(|_| "v4 seek byte offset truncated")?,
        );
        let byte_offset =
            usize::try_from(byte_offset_u64).map_err(|_| "v4 seek offset exceeds platform")?;
        if byte_offset < table_bytes
            || (index > 0 && (sample_offset <= previous_sample || byte_offset <= previous_byte))
        {
            return Err("v4 seek table is not strictly ordered".into());
        }
        entries.push(SeekEntry {
            sample_offset,
            byte_offset,
        });
        previous_sample = sample_offset;
        previous_byte = byte_offset;
        position += 16;
    }
    Ok(Some((channels, frames, entries)))
}

fn try_decode_v4_frame(
    data: &[u8],
    mut position: usize,
    channels: usize,
) -> Result<Option<(Vec<i16>, usize, usize)>, String> {
    let frame_start = position;
    let mut decoded_channels: Vec<Vec<i16>> = Vec::with_capacity(channels);
    let mut stereo_hint = 0u8;
    let mut i32_side: Option<Vec<i32>> = None;
    let mut frame_samples = 0usize;

    for channel in 0..channels {
        let header_end = position
            .checked_add(13)
            .ok_or("v4 block header offset overflow")?;
        if header_end > data.len() {
            return Ok(None);
        }
        let len = u32::from_le_bytes(
            data[position..position + 4]
                .try_into()
                .map_err(|_| "v4 block length truncated")?,
        ) as usize;
        let raw_flag = data[position + 4];
        let flag = raw_flag & !STEREO_MASK;
        if channel == 0 {
            stereo_hint = raw_flag & STEREO_MASK;
            frame_samples = len;
        } else if len != frame_samples {
            return Err("v4 frame channel lengths differ".into());
        }
        let crc_expected = u32::from_le_bytes(
            data[position + 5..position + 9]
                .try_into()
                .map_err(|_| "v4 block CRC truncated")?,
        );
        let payload_len = u32::from_le_bytes(
            data[position + 9..position + 13]
                .try_into()
                .map_err(|_| "v4 payload length truncated")?,
        ) as usize;
        let block_end = header_end
            .checked_add(payload_len)
            .ok_or("v4 payload offset overflow")?;
        if block_end > data.len() {
            return Ok(None);
        }
        let payload = &data[header_end..block_end];
        if channel == 1 && stereo_hint != 0 && flag == FLAG_I32_RICE {
            let side = decode_i32_rice_payload(payload, len)?;
            if crc32_i32(&side) != crc_expected {
                return Err("v4 i32 side CRC mismatch".into());
            }
            i32_side = Some(side);
        } else {
            if flag == FLAG_I32_RICE {
                return Err("v4 i32 side flag outside stereo side channel".into());
            }
            let block = decode_block_payload(flag, payload, len)?;
            if crc32(&block) != crc_expected {
                return Err("v4 block CRC mismatch".into());
            }
            decoded_channels.push(block);
        }
        position = block_end;
    }

    let pcm = if channels == 2 && stereo_hint != 0 {
        let first = decoded_channels
            .first()
            .ok_or("v4 stereo first channel missing")?;
        let (left, right) = if let Some(side) = i32_side {
            match stereo_hint {
                STEREO_MS => stereo::decode_ms_i32(first, &side)?,
                STEREO_LS => stereo::decode_ls_i32(first, &side)?,
                STEREO_RS => stereo::decode_rs_i32(first, &side)?,
                _ => return Err("v4 stereo hint invalid".into()),
            }
        } else {
            let side = decoded_channels.get(1).ok_or("v4 stereo side missing")?;
            match stereo_hint {
                STEREO_MS => stereo::decode_ms(first, side),
                STEREO_LS => stereo::decode_ls(first, side),
                STEREO_RS => stereo::decode_rs(first, side),
                _ => return Err("v4 stereo hint invalid".into()),
            }
        };
        crate::pcm::interleave_i16(&[left, right])
    } else if channels == 1 {
        decoded_channels.into_iter().next().unwrap_or_default()
    } else {
        if decoded_channels.len() != channels {
            return Err("v4 frame channel missing".into());
        }
        crate::pcm::interleave_i16(&decoded_channels)
    };
    if position <= frame_start {
        return Err("v4 frame made no progress".into());
    }
    Ok(Some((pcm, position, frame_samples)))
}

fn decode_v4(data: &[u8]) -> Result<Vec<i16>, String> {
    let (channels, frames, entries) =
        parse_v4_prefix(data)?.ok_or("truncated MP5-L v4 header or seek table")?;
    let mut output = Vec::new();
    let mut position = entries
        .first()
        .map(|entry| entry.byte_offset)
        .unwrap_or(data.len());
    for frame_index in 0..frames {
        if entries[frame_index].byte_offset != position {
            return Err(format!("v4 seek offset mismatch at frame {frame_index}"));
        }
        let (pcm, next, _) = try_decode_v4_frame(data, position, channels)?
            .ok_or_else(|| format!("truncated MP5-L v4 frame {frame_index}"))?;
        output.extend_from_slice(&pcm);
        position = next;
    }
    Ok(output)
}

/// Incremental v4 decoder. Complete frame pairs are emitted as soon as all
/// channel blocks for a frame are available.
pub struct StreamDecoder {
    buffer: Vec<u8>,
    channels: usize,
    frame_count: usize,
    frame_index: usize,
    position: usize,
    entries: Vec<SeekEntry>,
    initialized: bool,
    skip_samples: usize,
}

impl StreamDecoder {
    pub fn new(data_prefix: &[u8]) -> Result<Self, String> {
        let mut decoder = Self {
            buffer: data_prefix.to_vec(),
            channels: 0,
            frame_count: 0,
            frame_index: 0,
            position: 0,
            entries: Vec::new(),
            initialized: false,
            skip_samples: 0,
        };
        decoder.initialize_if_available()?;
        Ok(decoder)
    }

    fn initialize_if_available(&mut self) -> Result<(), String> {
        if self.initialized {
            return Ok(());
        }
        let Some((channels, frame_count, entries)) = parse_v4_prefix(&self.buffer)? else {
            return Ok(());
        };
        self.channels = channels;
        self.frame_count = frame_count;
        self.position = entries
            .first()
            .map(|entry| entry.byte_offset)
            .unwrap_or(self.buffer.len());
        self.entries = entries;
        self.initialized = true;
        Ok(())
    }

    pub fn push(&mut self, data: &[u8]) -> Result<Vec<i16>, String> {
        self.buffer.extend_from_slice(data);
        self.initialize_if_available()?;
        if !self.initialized {
            return Ok(Vec::new());
        }
        let mut output = Vec::new();
        while self.frame_index < self.frame_count {
            let expected_offset = self.entries[self.frame_index].byte_offset;
            if self.position != expected_offset {
                return Err("stream position does not match v4 seek table".into());
            }
            let Some((pcm, next, frame_samples)) =
                try_decode_v4_frame(&self.buffer, self.position, self.channels)?
            else {
                break;
            };
            let skip = self.skip_samples.min(frame_samples);
            let interleaved_skip = skip
                .checked_mul(self.channels)
                .ok_or("stream seek sample offset overflow")?;
            output.extend_from_slice(&pcm[interleaved_skip.min(pcm.len())..]);
            self.skip_samples = self.skip_samples.saturating_sub(frame_samples);
            self.position = next;
            self.frame_index += 1;
        }
        Ok(output)
    }

    /// Seek to a channel-frame sample index. The next `push` (including an
    /// empty push) emits from that exact sample within the indexed frame.
    pub fn seek_frame(&mut self, sample_index: usize) -> Result<(), String> {
        self.initialize_if_available()?;
        if !self.initialized {
            return Err("v4 seek table is not available yet".into());
        }
        let target = sample_index as u64;
        let (index, entry) = self
            .entries
            .iter()
            .enumerate()
            .rev()
            .find(|(_, entry)| entry.sample_offset <= target)
            .ok_or("seek target precedes first frame")?;
        self.frame_index = index;
        self.position = entry.byte_offset;
        self.skip_samples = usize::try_from(target - entry.sample_offset)
            .map_err(|_| "seek offset exceeds platform")?;
        Ok(())
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
    crc32_bytes(data.iter().flat_map(|sample| sample.to_le_bytes()))
}

fn crc32_i32(data: &[i32]) -> u32 {
    crc32_bytes(data.iter().flat_map(|sample| sample.to_le_bytes()))
}

fn crc32_bytes(bytes: impl IntoIterator<Item = u8>) -> u32 {
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

    #[test]
    fn default_encoder_remains_v3() {
        let enc = encode(&[1, -2, 3, -4], 1);
        assert_eq!(enc[1], VERSION_V3);
    }

    #[test]
    fn v3_synthetic_bitstream_golden_crc() {
        let samples: Vec<i16> = (0..1024)
            .flat_map(|i| {
                let left = ((i as f32 * 0.031).sin() * 22000.0) as i16;
                [left, left.wrapping_add((i % 7) as i16 - 3)]
            })
            .collect();
        let encoded = encode_v3(&samples, 2);
        assert_eq!(crc32_bytes(encoded.iter().copied()), 2_311_717_603);
        assert_eq!(decode(&encoded).unwrap(), samples);
    }

    #[test]
    fn v4_stereo_is_frame_interleaved_and_roundtrips() {
        let mut samples = Vec::new();
        for i in 0..9000 {
            samples.push(((i as f32 * 0.021).sin() * 30000.0) as i16);
            samples.push(((i as f32 * 0.019).cos() * 28000.0) as i16);
        }
        let enc = encode_v4(&samples, 2);
        assert_eq!(enc[1], VERSION_V4);
        assert_eq!(&enc[7..11], b"SEEK");
        assert_eq!(decode(&enc).unwrap(), samples);
    }

    #[test]
    fn v4_extreme_stereo_uses_width_safe_side() {
        let samples = vec![
            i16::MAX,
            i16::MIN,
            i16::MIN,
            i16::MAX,
            i16::MAX,
            i16::MIN,
            i16::MIN,
            i16::MAX,
        ];
        let enc = encode_v4(&samples, 2);
        assert_eq!(decode(&enc).unwrap(), samples);
    }

    #[test]
    fn stream_decoder_waits_for_complete_frames() {
        let samples: Vec<i16> = (0..12000)
            .flat_map(|i| [i as i16, (i as i16).wrapping_neg()])
            .collect();
        let enc = encode_v4(&samples, 2);
        let split = enc.len() / 2;
        let mut stream = StreamDecoder::new(&[]).unwrap();
        let mut got = stream.push(&enc[..split]).unwrap();
        got.extend(stream.push(&enc[split..]).unwrap());
        assert_eq!(got, samples);

        let mut truncated = StreamDecoder::new(&[]).unwrap();
        let partial = truncated.push(&enc[..enc.len() - 1]).unwrap();
        assert!(partial.len() < samples.len());
        assert!(decode(&enc[..enc.len() - 1]).is_err());
    }

    #[test]
    fn stream_decoder_seek_starts_within_target_frame() {
        let samples: Vec<i16> = (0..10000)
            .flat_map(|i| [i as i16, (30000 - i) as i16])
            .collect();
        let enc = encode_v4(&samples, 2);
        let target = 4500usize;
        let mut stream = StreamDecoder::new(&enc).unwrap();
        stream.seek_frame(target).unwrap();
        let got = stream.push(&[]).unwrap();
        assert_eq!(got, samples[target * 2..]);
    }

    #[test]
    fn malformed_v4_never_panics() {
        let cases: &[&[u8]] = &[
            &[],
            &[0x4c],
            &[0x4c, VERSION_V4, 2, 1, 0, 0, 0],
            &[0x4c, VERSION_V4, 2, 1, 0, 0, 0, b'S', b'E', b'E', b'K'],
            &[0xff; 64],
        ];
        for data in cases {
            let result = std::panic::catch_unwind(|| decode(data));
            assert!(result.is_ok());
        }
    }
}
