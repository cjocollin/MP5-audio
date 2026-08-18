//! MP5-L lossless codec.
//! - v2: raw PCM blocks + CRC (legacy)
//! - v3: silence / const / LPC+Rice / raw fallback; optional M/S stereo per block
//! - v4: disposable seek-framed layout with verbatim QLP i16 and fixed-i32
//!   warm-ups; escaped Rice codes only the `N - order` prediction residuals

pub mod bitwriter;
pub mod block;
pub mod diag;
pub mod predict;
pub mod qlp;
pub mod rice;
pub mod stereo;
pub mod varint;

use block::{
    decode_block_payload, decode_i32_predicted_rice_payload, decode_i32_qlp_payload,
    decode_i32_rice_payload, encode_block_payload, encode_block_payload_v4,
    encode_block_payload_v4_with_qlp, estimate_block_payload_v4_bytes,
    estimate_block_payload_v4_bytes_with_qlp, prepare_i32_side, FLAG_I32_PRED, FLAG_I32_QLP,
    FLAG_I32_RICE, FLAG_QLP, FLAG_RAW,
};

/// Stereo transform hints in the high bits of the left-channel flag byte.
/// Clear with `STEREO_MASK` before `decode_block_payload`.
const STEREO_MASK: u8 = 0xC0;
const STEREO_MS: u8 = 0x80;
const STEREO_LS: u8 = 0x40;
const STEREO_RS: u8 = 0xC0;
use diag::{VERSION_V2, VERSION_V3, VERSION_V4};

const BLOCK_SIZE: usize = 4096;
/// v4 encoder planning max — longer windows help stationary speech LPC; wire
/// stores per-block length so this is encoder-only (v3 stays 4096).
const BLOCK_SIZE_V4: usize = 8192;
const MIN_SILENCE_RUN: usize = 64;
const SEEK_MAGIC: &[u8; 4] = b"SEEK";
/// Sparse seek table stride for disposable experimental v4 (P4a).
const SEEK_STRIDE: usize = 8;
/// v4 block header: len(4)+flag(1)+crc16(2)+enc_len(4) — CRC16 replaces per-block CRC32.
const V4_BLOCK_HDR: usize = 11;

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

fn plan_v4_ranges(per_channel: &[Vec<i16>]) -> Vec<(usize, usize)> {
    let plan = plan_blocks_v4(per_channel);
    let sample_len = per_channel.first().map(Vec::len).unwrap_or(0);
    let mut ranges = Vec::with_capacity(plan.boundaries.len());
    let mut start = 0usize;
    for &boundary in &plan.boundaries {
        let end = boundary.min(sample_len);
        if start >= end {
            break;
        }
        ranges.push((start, end));
        start = end;
    }
    ranges
}

fn assemble_v4_bitstream(
    channel_count: usize,
    frames: &[(u64, Vec<u8>, diag::EncodeTelemetry)],
) -> Vec<u8> {
    let seek_indices: Vec<usize> = (0..frames.len())
        .filter(|&i| i % SEEK_STRIDE == 0 || i + 1 == frames.len())
        .collect();
    let mut out = vec![0x4c, VERSION_V4, channel_count as u8];
    out.extend_from_slice(&(frames.len() as u32).to_le_bytes());
    out.extend_from_slice(SEEK_MAGIC);
    out.extend_from_slice(&(seek_indices.len() as u32).to_le_bytes());
    let frame_data_start = 7usize + 8 + seek_indices.len() * 16;
    let mut offset = frame_data_start as u64;
    let mut frame_offsets = Vec::with_capacity(frames.len());
    for (_, frame, _) in frames {
        frame_offsets.push(offset);
        offset += frame.len() as u64;
    }
    for &i in &seek_indices {
        out.extend_from_slice(&frames[i].0.to_le_bytes());
        out.extend_from_slice(&frame_offsets[i].to_le_bytes());
    }
    for (_, frame, _) in frames {
        out.extend_from_slice(frame);
    }
    out
}

/// Experimental v4 encoder. Frames are interleaved by block boundary and an
/// absolute-offset seek table immediately follows the seven-byte header.
pub fn encode_v4(samples: &[i16], channels: u8) -> Vec<u8> {
    diag::reset_encode_telemetry();
    let channel_count = channels.max(1) as usize;
    let per_channel = if channel_count == 1 {
        vec![samples.to_vec()]
    } else {
        crate::pcm::deinterleave_i16(samples, channel_count)
    };
    let ranges = plan_v4_ranges(&per_channel);

    #[cfg(all(feature = "native_parallel", not(target_arch = "wasm32")))]
    let frames: Vec<_> = {
        use rayon::prelude::*;
        ranges
            .par_iter()
            .map(|&(start, end)| encode_v4_frame(&per_channel, channel_count, start, end))
            .collect()
    };
    #[cfg(not(all(feature = "native_parallel", not(target_arch = "wasm32"))))]
    let frames: Vec<_> = ranges
        .iter()
        .map(|&(start, end)| encode_v4_frame(&per_channel, channel_count, start, end))
        .collect();

    diag::reset_encode_telemetry();
    for (_, _, telemetry) in &frames {
        diag::merge_encode_telemetry(*telemetry);
    }

    assemble_v4_bitstream(channel_count, &frames)
}

/// Progressive MP5-L v4 encoder: same bitstream as [`encode_v4`], one frame at a time.
///
/// Call [`Mp5lV4StreamEncoder::encode_next_frame`] until it returns false, then
/// [`Mp5lV4StreamEncoder::finish`]. Planning runs once up front (serial); frames
/// encode in plan order for bit-identical output.
pub struct Mp5lV4StreamEncoder {
    channel_count: usize,
    per_channel: Vec<Vec<i16>>,
    ranges: Vec<(usize, usize)>,
    frames: Vec<(u64, Vec<u8>, diag::EncodeTelemetry)>,
    next: usize,
}

impl Mp5lV4StreamEncoder {
    pub fn new(samples: &[i16], channels: u8) -> Self {
        diag::reset_encode_telemetry();
        let channel_count = channels.max(1) as usize;
        let per_channel = if channel_count == 1 {
            vec![samples.to_vec()]
        } else {
            crate::pcm::deinterleave_i16(samples, channel_count)
        };
        let ranges = plan_v4_ranges(&per_channel);
        let frame_cap = ranges.len();
        Self {
            channel_count,
            per_channel,
            ranges,
            frames: Vec::with_capacity(frame_cap),
            next: 0,
        }
    }

    pub fn frame_count(&self) -> usize {
        self.ranges.len()
    }

    pub fn frames_done(&self) -> usize {
        self.next
    }

    /// Encode the next planned frame. Returns `false` when all frames are done.
    pub fn encode_next_frame(&mut self) -> bool {
        if self.next >= self.ranges.len() {
            return false;
        }
        let (start, end) = self.ranges[self.next];
        let frame = encode_v4_frame(&self.per_channel, self.channel_count, start, end);
        self.frames.push(frame);
        self.next += 1;
        true
    }

    pub fn finish(self) -> Vec<u8> {
        diag::reset_encode_telemetry();
        for (_, _, telemetry) in &self.frames {
            diag::merge_encode_telemetry(*telemetry);
        }
        assemble_v4_bitstream(self.channel_count, &self.frames)
    }
}

/// Public helpers for multi-worker frame encode (plan serial, concat ordered).
pub fn plan_mp5l_v4_frame_ranges(samples: &[i16], channels: u8) -> Vec<(u32, u32)> {
    let channel_count = channels.max(1) as usize;
    let per_channel = if channel_count == 1 {
        vec![samples.to_vec()]
    } else {
        crate::pcm::deinterleave_i16(samples, channel_count)
    };
    plan_v4_ranges(&per_channel)
        .into_iter()
        .map(|(s, e)| (s as u32, e as u32))
        .collect()
}

pub fn encode_mp5l_v4_frame_range(
    samples: &[i16],
    channels: u8,
    start: u32,
    end: u32,
) -> (u64, Vec<u8>) {
    let channel_count = channels.max(1) as usize;
    let per_channel = if channel_count == 1 {
        vec![samples.to_vec()]
    } else {
        crate::pcm::deinterleave_i16(samples, channel_count)
    };
    let (sample_off, frame, _) =
        encode_v4_frame(&per_channel, channel_count, start as usize, end as usize);
    (sample_off, frame)
}

pub fn assemble_mp5l_v4_frames(channels: u8, sample_offsets: &[u64], frame_payloads: &[Vec<u8>]) -> Vec<u8> {
    let channel_count = channels.max(1) as usize;
    let frames: Vec<_> = sample_offsets
        .iter()
        .zip(frame_payloads.iter())
        .map(|(&off, payload)| (off, payload.clone(), diag::EncodeTelemetry::default()))
        .collect();
    assemble_v4_bitstream(channel_count, &frames)
}

fn encode_v4_frame(
    per_channel: &[Vec<i16>],
    channel_count: usize,
    start: usize,
    end: usize,
) -> (u64, Vec<u8>, diag::EncodeTelemetry) {
    diag::reset_encode_telemetry();
    let mut frame = Vec::new();
    if channel_count == 2 {
        let (first, second) = encode_stereo_block_best_v4(
            &per_channel[0][start..end],
            &per_channel[1][start..end],
        );
        frame.extend_from_slice(&first);
        frame.extend_from_slice(&second);
    } else {
        for channel in per_channel {
            let channel_end = end.min(channel.len());
            if start >= channel_end {
                continue;
            }
            let block = &channel[start..channel_end];
            let (flag, payload) = encode_block_payload_v4(block);
            frame.extend_from_slice(&wrap_block_v4(block, flag, &payload));
        }
    }
    (start as u64, frame, diag::encode_telemetry())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum StereoChoiceV4 {
    Independent,
    MidSide,
    LeftSide,
    RightSide,
}

/// Estimate stereo modes, then encode only the winning channel set (bit-identical
/// when payload estimates match materialized sizes).
fn encode_stereo_block_best_v4(left: &[i16], right: &[i16]) -> (Vec<u8>, Vec<u8>) {
    let left_qlp = qlp::prepare_best_qlp(left);
    let right_qlp = qlp::prepare_best_qlp(right);
    let left_bytes = estimate_block_payload_v4_bytes_with_qlp(left, &left_qlp);
    let right_bytes = estimate_block_payload_v4_bytes_with_qlp(right, &right_qlp);
    let side = stereo::encode_side_i32(left, right);
    let side_prep = prepare_i32_side(&side);
    let side_total = V4_BLOCK_HDR + side_prep.payload_bytes();

    let mut choice = StereoChoiceV4::Independent;
    let mut best_len = V4_BLOCK_HDR * 2 + left_bytes + right_bytes;
    let mut mid_bundle: Option<(Vec<i16>, Option<qlp::PreparedQlp>)> = None;

    if stereo::should_encode_mid(left, right) {
        let (mid, _) = stereo::encode_ms_i32(left, right);
        let mid_qlp = qlp::prepare_best_qlp(&mid);
        let mid_bytes = estimate_block_payload_v4_bytes_with_qlp(&mid, &mid_qlp);
        let total = V4_BLOCK_HDR + mid_bytes + side_total;
        if total < best_len {
            best_len = total;
            choice = StereoChoiceV4::MidSide;
        }
        mid_bundle = Some((mid, mid_qlp));
    }

    let left_side_len = V4_BLOCK_HDR + left_bytes + side_total;
    if left_side_len < best_len {
        best_len = left_side_len;
        choice = StereoChoiceV4::LeftSide;
    }
    let right_side_len = V4_BLOCK_HDR + right_bytes + side_total;
    if right_side_len < best_len {
        choice = StereoChoiceV4::RightSide;
    }

    match choice {
        StereoChoiceV4::Independent => {
            let (left_flag, left_payload) = encode_block_payload_v4_with_qlp(left, left_qlp);
            let (right_flag, right_payload) = encode_block_payload_v4_with_qlp(right, right_qlp);
            (
                wrap_block_v4(left, left_flag, &left_payload),
                wrap_block_v4(right, right_flag, &right_payload),
            )
        }
        StereoChoiceV4::MidSide => {
            let (mid, mid_qlp) = mid_bundle.expect("mid/side choice requires mid samples");
            let (mid_flag, mid_payload) = encode_block_payload_v4_with_qlp(&mid, mid_qlp);
            let (side_flag, side_payload) = side_prep.encode(&side);
            (
                wrap_block_v4(&mid, mid_flag | STEREO_MS, &mid_payload),
                wrap_i32_block_v4(&side, side_flag, &side_payload),
            )
        }
        StereoChoiceV4::LeftSide => {
            let (left_flag, left_payload) = encode_block_payload_v4_with_qlp(left, left_qlp);
            let (side_flag, side_payload) = side_prep.encode(&side);
            (
                wrap_block_v4(left, left_flag | STEREO_LS, &left_payload),
                wrap_i32_block_v4(&side, side_flag, &side_payload),
            )
        }
        StereoChoiceV4::RightSide => {
            let (right_flag, right_payload) = encode_block_payload_v4_with_qlp(right, right_qlp);
            let (side_flag, side_payload) = side_prep.encode(&side);
            (
                wrap_block_v4(right, right_flag | STEREO_RS, &right_payload),
                wrap_i32_block_v4(&side, side_flag, &side_payload),
            )
        }
    }
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
    plan_blocks_version(per_ch, false)
}

fn plan_blocks_v4(per_ch: &[Vec<i16>]) -> BlockPlan {
    plan_blocks_version(per_ch, true)
}

fn plan_blocks_version(per_ch: &[Vec<i16>], v4: bool) -> BlockPlan {
    let max_len = per_ch.iter().map(|c| c.len()).max().unwrap_or(0);
    let probe = per_ch.first().map(|c| c.as_slice()).unwrap_or(&[]);
    let right = per_ch.get(1).map(|c| c.as_slice());
    let max_block = if v4 { BLOCK_SIZE_V4 } else { BLOCK_SIZE };
    let mut boundaries = Vec::new();
    let mut i = 0usize;
    while i < max_len {
        let hard_end = (i + max_block).min(max_len);
        let mut end = silence_aware_block_end(probe, i, hard_end);
        if end <= i {
            end = hard_end;
        }
        // Verified adaptive split: whole window vs 2× / 4× (v4 uses QLP/stereo costs).
        for e in adaptive_split_ends(probe, right, i, end, v4) {
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

/// v4 planning cost: QLP-capable mono payload + v4 header (CRC16).
fn block_encode_cost_v4(samples: &[i16]) -> usize {
    if samples.is_empty() {
        return 0;
    }
    V4_BLOCK_HDR + estimate_block_payload_v4_bytes(samples)
}

/// Stereo frame planning cost (cheap approx — full mid/side search is encode-time).
fn stereo_frame_encode_cost_v4(left: &[i16], right: &[i16]) -> usize {
    if left.is_empty() {
        return 0;
    }
    V4_BLOCK_HDR
        .saturating_mul(2)
        .saturating_add(stereo::stereo_split_proxy_bytes(left, right))
}

fn strongest_transient_cut(
    probe: &[i16],
    right: Option<&[i16]>,
    start: usize,
    end: usize,
) -> Option<usize> {
    const MIN_SEGMENT: usize = 256;
    if end.saturating_sub(start) < MIN_SEGMENT * 2 {
        return None;
    }
    let scan_start = start.saturating_add(MIN_SEGMENT).max(start + 1);
    let scan_end = end.saturating_sub(MIN_SEGMENT);
    let mut best: Option<(u64, usize)> = None;
    for index in scan_start..=scan_end {
        let left_jump = (probe[index] as i32 - probe[index - 1] as i32).unsigned_abs() as u64;
        let right_jump = right
            .and_then(|channel| {
                (index < channel.len()).then(|| {
                    (channel[index] as i32 - channel[index - 1] as i32).unsigned_abs() as u64
                })
            })
            .unwrap_or(0);
        let score = left_jump.saturating_add(right_jump);
        if best.map(|(current, _)| score > current).unwrap_or(true) {
            best = Some((score, index));
        }
    }
    best.and_then(|(score, index)| (score > 0).then_some(index))
}

/// Try keeping `[start, end)` whole, equal 2×/4× splits, and a transient cut.
fn adaptive_split_ends(
    probe: &[i16],
    right: Option<&[i16]>,
    start: usize,
    end: usize,
    v4: bool,
) -> Vec<usize> {
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
        if v4 {
            if let Some(r) = right {
                let ra = a.min(r.len());
                let rb = b.min(r.len());
                if ra < rb {
                    return stereo_frame_encode_cost_v4(&probe[a..b], &r[ra..rb]);
                }
            }
            block_encode_cost_v4(&probe[a..b])
        } else {
            block_encode_cost(&probe[a..b])
        }
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

    let (selected_cost, mut selected) = if c4 < c1 && c4 <= c2 {
        (c4, vec![start + q, start + 2 * q, start + 3 * q, end])
    } else if c2 < c1 {
        (c2, vec![mid, end])
    } else {
        (c1, vec![end])
    };
    if let Some(cut) = strongest_transient_cut(probe, right, start, slice_end) {
        let transient_cost = cost(start, cut) + cost(cut, slice_end);
        if transient_cost < selected_cost {
            selected = vec![cut, end];
        }
    }
    selected
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

fn wrap_block_v4(samples: &[i16], flag: u8, payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(V4_BLOCK_HDR + payload.len());
    out.extend_from_slice(&(samples.len() as u32).to_le_bytes());
    out.push(flag);
    out.extend_from_slice(&crc16_i16(samples).to_le_bytes());
    out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    out.extend_from_slice(payload);
    out
}

fn wrap_i32_block_v4(samples: &[i32], flag: u8, payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(V4_BLOCK_HDR + payload.len());
    out.extend_from_slice(&(samples.len() as u32).to_le_bytes());
    out.push(flag);
    out.extend_from_slice(&crc16_i32(samples).to_le_bytes());
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
            if flag == FLAG_QLP
                || flag == FLAG_I32_RICE
                || flag == FLAG_I32_PRED
                || flag == FLAG_I32_QLP
            {
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
    if count == 0 || count > frames {
        return Err(format!(
            "v4 seek count {count} invalid for frame count {frames}"
        ));
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
            .checked_add(V4_BLOCK_HDR)
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
        let crc_expected = u16::from_le_bytes(
            data[position + 5..position + 7]
                .try_into()
                .map_err(|_| "v4 block CRC truncated")?,
        );
        let payload_len = u32::from_le_bytes(
            data[position + 7..position + 11]
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
        if channel == 1
            && stereo_hint != 0
            && (flag == FLAG_I32_RICE || flag == FLAG_I32_PRED || flag == FLAG_I32_QLP)
        {
            let side = match flag {
                FLAG_I32_QLP => decode_i32_qlp_payload(payload, len)?,
                FLAG_I32_PRED => decode_i32_predicted_rice_payload(payload, len)?,
                _ => decode_i32_rice_payload(payload, len)?,
            };
            if crc16_i32(&side) != crc_expected {
                return Err("v4 i32 side CRC mismatch".into());
            }
            i32_side = Some(side);
        } else {
            if flag == FLAG_I32_RICE || flag == FLAG_I32_PRED || flag == FLAG_I32_QLP {
                return Err("v4 i32 side flag outside stereo side channel".into());
            }
            let block = decode_block_payload(flag, payload, len)?;
            if crc16_i16(&block) != crc_expected {
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
    // Pre-size to the exact upper bound (every frame is BLOCK_SIZE_V4 except the
    // last, which is smaller): avoids the doubling reallocation storm that peaked
    // ~96MB of transient wasm memory beyond the final buffer on multi-MB decodes.
    let mut output =
        Vec::with_capacity(frames.saturating_mul(BLOCK_SIZE_V4).saturating_mul(channels));
    let mut position = entries
        .first()
        .map(|entry| entry.byte_offset)
        .unwrap_or(data.len());
    for frame_index in 0..frames {
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
    /// Interleaved samples decoded past a bounded `push_until` limit, emitted
    /// first on the next call. Without this the straddling frame's tail was
    /// dropped, so chunked/continuation decoding lost samples at each seam.
    pending: Vec<i16>,
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
            pending: Vec::new(),
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
        self.push_until(data, None)
    }

    /// Like [`push`], but stops once at least `max_channel_samples` channel-frames
    /// have been emitted (truncated to that length). `None` drains all complete frames.
    pub fn push_until(
        &mut self,
        data: &[u8],
        max_channel_samples: Option<usize>,
    ) -> Result<Vec<i16>, String> {
        self.buffer.extend_from_slice(data);
        self.initialize_if_available()?;
        if !self.initialized {
            return Ok(Vec::new());
        }
        let max_interleaved = match max_channel_samples {
            Some(n) => Some(
                n.checked_mul(self.channels)
                    .ok_or("max_channel_samples * channels overflow")?,
            ),
            None => None,
        };
        // Emit samples held back from a previous bounded call before decoding more.
        let mut output = std::mem::take(&mut self.pending);
        if let Some(limit) = max_interleaved {
            if output.len() >= limit {
                self.pending = output.split_off(limit);
                return Ok(output);
            }
        }
        while self.frame_index < self.frame_count {
            if let Some(limit) = max_interleaved {
                if output.len() >= limit {
                    break;
                }
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
            if let Some(limit) = max_interleaved {
                if output.len() >= limit {
                    // Hold the straddling frame's tail for the next call instead
                    // of dropping it (keeps chunked decoding sample-exact).
                    self.pending = output.split_off(limit);
                    break;
                }
            }
        }
        Ok(output)
    }

    /// Seek to a channel-frame sample index. The next `push` (including an
    /// empty push) emits from that exact sample within the indexed frame.
    /// Sparse SEEK entries land on/before the target; leftover skip covers the gap.
    pub fn seek_frame(&mut self, sample_index: usize) -> Result<(), String> {
        self.initialize_if_available()?;
        if !self.initialized {
            return Err("v4 seek table is not available yet".into());
        }
        // A seek invalidates any tail buffered from a prior bounded push.
        self.pending.clear();
        let target = sample_index as u64;
        let entry = self
            .entries
            .iter()
            .rev()
            .find(|entry| entry.sample_offset <= target)
            .ok_or("seek target precedes first frame")?;
        // Estimate frame index from sample offset / typical block; refine by scanning.
        self.position = entry.byte_offset;
        self.skip_samples = usize::try_from(target - entry.sample_offset)
            .map_err(|_| "seek offset exceeds platform")?;
        // Count frames from stream start to this byte offset for frame_index bookkeeping.
        let mut position = self
            .entries
            .first()
            .map(|e| e.byte_offset)
            .unwrap_or(self.position);
        let mut frame_index = 0usize;
        while position < self.position && frame_index < self.frame_count {
            let Some((_, next, _)) = try_decode_v4_frame(&self.buffer, position, self.channels)?
            else {
                break;
            };
            position = next;
            frame_index += 1;
        }
        self.frame_index = frame_index;
        self.position = entry.byte_offset;
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

/// CRC-32/IEEE (reflected poly `0xEDB88320`, init/final `0xFFFFFFFF`).
/// Shared with container chunk CRCs and the CodecId 6 header/unit CRCs.
pub(crate) fn crc32_bytes(bytes: impl IntoIterator<Item = u8>) -> u32 {
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

fn crc16_i16(data: &[i16]) -> u16 {
    crc16_bytes(data.iter().flat_map(|sample| sample.to_le_bytes()))
}

fn crc16_i32(data: &[i32]) -> u16 {
    crc16_bytes(data.iter().flat_map(|sample| sample.to_le_bytes()))
}

/// CRC-16/IBM (poly 0xA001), used by disposable experimental v4 block headers.
fn crc16_bytes(bytes: impl IntoIterator<Item = u8>) -> u16 {
    let mut crc = 0xffffu16;
    for b in bytes {
        crc ^= u16::from(b);
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                0xa001 ^ (crc >> 1)
            } else {
                crc >> 1
            };
        }
    }
    crc
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
    fn v4_transient_cut_is_not_forced_to_equal_halves() {
        let mut channel = vec![100i16; 2048];
        channel[700..].fill(20_000);
        assert_eq!(
            strongest_transient_cut(&channel, None, 0, channel.len()),
            Some(700)
        );
        assert_ne!(700, channel.len() / 2);
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
    fn v4_stereo_encode_is_size_and_byte_deterministic() {
        let samples: Vec<i16> = (0..1536)
            .flat_map(|i| {
                let left = ((i as f64 * 0.023).sin() * 22_000.0) as i16;
                let right = left.saturating_sub(((i % 11) as i16) - 5);
                [left, right]
            })
            .collect();
        let first = encode_v4(&samples, 2);
        let second = encode_v4(&samples, 2);
        assert_eq!(first.len(), 1_204, "frozen v4 fixture size changed");
        assert_eq!(
            crc32_bytes(first.iter().copied()),
            1_830_739_704,
            "frozen v4 fixture bytes changed"
        );
        assert_eq!(first.len(), second.len());
        assert_eq!(first, second);
        assert_eq!(decode(&first).unwrap(), samples);
    }

    #[test]
    fn v4_native_encode_is_byte_deterministic() {
        let samples: Vec<i16> = (0..1536)
            .flat_map(|i| {
                let left = ((i as f64 * 0.023).sin() * 22_000.0) as i16;
                let right = left.saturating_sub(((i % 11) as i16) - 5);
                [left, right]
            })
            .collect();
        let first = encode_v4(&samples, 2);
        let second = encode_v4(&samples, 2);
        assert_eq!(first, second);
        assert_eq!(first[0], b'L');
        assert_eq!(first[1], 4);
    }

    #[test]
    #[ignore = "native-only golden; WASM golden is written by vitest WRITE_MP5L_V4_GOLDEN=1"]
    fn write_v4_encode_golden_fixture() {
        let samples: Vec<i16> = (0..1536)
            .flat_map(|i| {
                let left = ((i as f64 * 0.023).sin() * 22_000.0) as i16;
                let right = left.saturating_sub(((i % 11) as i16) - 5);
                [left, right]
            })
            .collect();
        let encoded = encode_v4(&samples, 2);
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/mp5l_v4_encode_golden.bin");
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        // Layout: magic "MP5LGOLD" | u32 pcm_i16_len | pcm LE i16s | bitstream
        let mut out = Vec::new();
        out.extend_from_slice(b"MP5LGOLD");
        out.extend_from_slice(&(samples.len() as u32).to_le_bytes());
        for s in &samples {
            out.extend_from_slice(&s.to_le_bytes());
        }
        out.extend_from_slice(&encoded);
        std::fs::write(&path, &out).expect("write golden");
        eprintln!(
            "wrote {} (pcm={} samples, bitstream={} bytes)",
            path.display(),
            samples.len(),
            encoded.len()
        );
    }

    #[test]
    fn v4_stream_encoder_matches_oneshot_bytes() {
        let samples: Vec<i16> = (0..4096)
            .flat_map(|i| {
                let left = ((i as f64 * 0.031).sin() * 18_000.0) as i16;
                let right = left.saturating_add(((i % 7) as i16) - 3);
                [left, right]
            })
            .collect();
        let oneshot = encode_v4(&samples, 2);
        let mut stream = Mp5lV4StreamEncoder::new(&samples, 2);
        while stream.encode_next_frame() {}
        let streamed = stream.finish();
        assert_eq!(streamed, oneshot);

        let ranges = plan_mp5l_v4_frame_ranges(&samples, 2);
        let mut offsets = Vec::new();
        let mut payloads = Vec::new();
        for &(start, end) in &ranges {
            let (off, payload) = encode_mp5l_v4_frame_range(&samples, 2, start, end);
            offsets.push(off);
            payloads.push(payload);
        }
        let assembled = assemble_mp5l_v4_frames(2, &offsets, &payloads);
        assert_eq!(assembled, oneshot);
    }

    #[test]
    #[ignore = "manual release-mode speed smoke"]
    fn v4_two_second_stereo_speed_smoke() {
        let sample_rate = 48_000usize;
        let duration_seconds = 2.0f64;
        let samples: Vec<i16> = (0..sample_rate * 2)
            .flat_map(|i| {
                let t = i as f64 / sample_rate as f64;
                let left = ((t * 440.0 * std::f64::consts::TAU).sin() * 20_000.0) as i16;
                let right = left
                    .saturating_add(((t * 2_100.0 * std::f64::consts::TAU).sin() * 180.0) as i16);
                [left, right]
            })
            .collect();
        let started = std::time::Instant::now();
        let encoded = encode_v4(&samples, 2);
        let elapsed = started.elapsed().as_secs_f64();
        let frames = u32::from_le_bytes(encoded[3..7].try_into().unwrap());
        eprintln!(
            "MP5-L v4 speed smoke: {:.3}s, {:.2}x RT, {} bytes, {} frames",
            elapsed,
            duration_seconds / elapsed.max(f64::EPSILON),
            encoded.len(),
            frames
        );
        assert_eq!(decode(&encoded).unwrap(), samples);
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
    fn v4_smooth_side_uses_predicted_i32_flag() {
        let left: Vec<i16> = (0..4096)
            .map(|i| ((i as f64 * 0.014).sin() * 20_000.0) as i16)
            .collect();
        let right: Vec<i16> = left
            .iter()
            .enumerate()
            .map(|(i, &sample)| {
                let side = ((i as f64 * 0.007).sin() * 500.0) as i32;
                (sample as i32 + side).clamp(i16::MIN as i32, i16::MAX as i32) as i16
            })
            .collect();
        let (_, side_block) = encode_stereo_block_best_v4(&left, &right);
        let side_flag = side_block[4] & !STEREO_MASK;
        assert!(
            side_flag == FLAG_I32_PRED || side_flag == FLAG_I32_QLP,
            "smooth side should use predicted/QLP i32, got {side_flag}"
        );
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
    fn stream_decoder_push_until_bounds_first_window() {
        let samples: Vec<i16> = (0..20_000)
            .flat_map(|i| [i as i16, (i as i16).wrapping_neg()])
            .collect();
        let enc = encode_v4(&samples, 2);
        let mut stream = StreamDecoder::new(&enc).unwrap();
        let want_frames = 8192usize; // one v4 block
        let got = stream.push_until(&[], Some(want_frames)).unwrap();
        assert_eq!(got.len(), want_frames * 2);
        assert_eq!(got, samples[..want_frames * 2]);
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
