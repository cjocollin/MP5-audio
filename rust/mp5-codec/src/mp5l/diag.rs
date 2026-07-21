//! MP5-L compression diagnostics.

use std::cell::RefCell;

use super::block::{
    FLAG_CONST, FLAG_DELTA, FLAG_I32_PRED, FLAG_I32_QLP, FLAG_I32_RICE, FLAG_QLP, FLAG_RAW,
    FLAG_RICE, FLAG_RICE_PACKED, FLAG_SILENCE,
};
use super::predict::residuals;
use super::rice::{
    best_partitioned_ks, estimate_k, rice_estimate_bits,
    rice_estimate_prefix_bits_partitioned_escape,
};

pub const VERSION_V2: u8 = 2;
pub const VERSION_V3: u8 = 3;
pub const VERSION_V4: u8 = 4;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct EncodeTelemetry {
    pub qlp_top4_misses: usize,
    pub qlp_top4_checks: usize,
    pub rice_escape_bits_total: usize,
    pub rice_escape_events: usize,
    pub partition_header_bits_total: usize,
}

thread_local! {
    static ENCODE_TELEMETRY: RefCell<EncodeTelemetry> =
        RefCell::new(EncodeTelemetry::default());
}

pub fn reset_encode_telemetry() {
    ENCODE_TELEMETRY.with(|telemetry| *telemetry.borrow_mut() = EncodeTelemetry::default());
}

pub fn encode_telemetry() -> EncodeTelemetry {
    ENCODE_TELEMETRY.with(|telemetry| *telemetry.borrow())
}

pub(crate) fn merge_encode_telemetry(other: EncodeTelemetry) {
    ENCODE_TELEMETRY.with(|telemetry| {
        let mut telemetry = telemetry.borrow_mut();
        telemetry.qlp_top4_misses = telemetry
            .qlp_top4_misses
            .saturating_add(other.qlp_top4_misses);
        telemetry.qlp_top4_checks = telemetry
            .qlp_top4_checks
            .saturating_add(other.qlp_top4_checks);
        telemetry.rice_escape_bits_total = telemetry
            .rice_escape_bits_total
            .saturating_add(other.rice_escape_bits_total);
        telemetry.rice_escape_events = telemetry
            .rice_escape_events
            .saturating_add(other.rice_escape_events);
        telemetry.partition_header_bits_total = telemetry
            .partition_header_bits_total
            .saturating_add(other.partition_header_bits_total);
    });
}

pub(crate) fn record_qlp_top4_check(missed: bool) {
    ENCODE_TELEMETRY.with(|telemetry| {
        let mut telemetry = telemetry.borrow_mut();
        telemetry.qlp_top4_checks = telemetry.qlp_top4_checks.saturating_add(1);
        if missed {
            telemetry.qlp_top4_misses = telemetry.qlp_top4_misses.saturating_add(1);
        }
    });
}

pub(crate) fn record_rice_wire(escape_bits: u8, escape_events: usize, parts: usize) {
    ENCODE_TELEMETRY.with(|telemetry| {
        let mut telemetry = telemetry.borrow_mut();
        telemetry.rice_escape_events = telemetry.rice_escape_events.saturating_add(escape_events);
        telemetry.rice_escape_bits_total = telemetry
            .rice_escape_bits_total
            .saturating_add(escape_events.saturating_mul(escape_bits as usize));
        telemetry.partition_header_bits_total = telemetry
            .partition_header_bits_total
            .saturating_add(16usize.saturating_add(parts.saturating_mul(4)));
    });
}

#[derive(Debug, Clone, Default)]
pub struct BlockStat {
    pub index: usize,
    pub samples: usize,
    pub flag: u8,
    pub payload_bytes: usize,
    pub total_bytes: usize,
    pub order: u8,
    pub rice_k: u8,
    pub bits_per_sample: f64,
}

#[derive(Debug, Clone, Default)]
pub struct Mp5lDiagnostics {
    pub version: u8,
    pub total_samples: usize,
    pub channels: u8,
    pub file_bytes: usize,
    pub pcm_bytes: usize,
    pub ratio_vs_pcm: f64,
    pub bits_per_sample: f64,
    pub block_count: usize,
    pub avg_block_samples: f64,
    pub block_overhead_pct: f64,
    pub silence_blocks: usize,
    pub const_blocks: usize,
    pub rice_blocks: usize,
    pub rice_packed_blocks: usize,
    pub delta_blocks: usize,
    pub raw_blocks: usize,
    pub qlp_blocks: usize,
    pub i32_pred_blocks: usize,
    pub i32_qlp_blocks: usize,
    pub qlp_warmup_verbatim_bits: usize,
    pub qlp_warmup_rice_counterfactual_bits: usize,
    pub qlp_top4_misses: usize,
    pub qlp_top4_checks: usize,
    pub rice_escape_bits_total: usize,
    pub rice_escape_events: usize,
    pub partition_header_bits_total: usize,
    pub rice_block_pct: f64,
    pub avg_rice_k: f64,
    pub avg_predictor_order: f64,
    pub residual_entropy_bits_per_sample: f64,
    pub stereo_ms_blocks: usize,
    pub worst_blocks: Vec<BlockStat>,
    pub best_blocks: Vec<BlockStat>,
}

pub fn analyze_bitstream(data: &[u8], channels: u8) -> Result<Mp5lDiagnostics, String> {
    if data.len() < 7 || data[0] != 0x4c {
        return Err("not MP5-L".into());
    }
    let version = data[1];
    let ch = data[2].max(1) as usize;
    let frames_per_ch = u32::from_le_bytes(data[3..7].try_into().unwrap()) as usize;
    let mut pos = 7;
    if version == VERSION_V4 {
        if data.len() < 15 || &data[7..11] != b"SEEK" {
            return Err("MP5-L v4 seek table missing".into());
        }
        let seek_count =
            u32::from_le_bytes(data[11..15].try_into().map_err(|_| "seek count short")?) as usize;
        if seek_count == 0 || seek_count > frames_per_ch {
            return Err("MP5-L v4 seek count mismatch".into());
        }
        pos = 15usize
            .checked_add(seek_count.checked_mul(16).ok_or("seek table overflow")?)
            .ok_or("seek table overflow")?;
        if pos > data.len() {
            return Err("MP5-L v4 seek table truncated".into());
        }
    }
    let hdr = if version == VERSION_V4 {
        11usize
    } else {
        13usize
    };
    let mut blocks: Vec<BlockStat> = Vec::new();
    let mut idx = 0usize;
    let mut total_samples = 0usize;
    let mut qlp_warmup_verbatim_bits = 0usize;
    let mut qlp_warmup_rice_counterfactual_bits = 0usize;

    for _ in 0..ch.saturating_mul(frames_per_ch) {
        if pos + hdr > data.len() {
            break;
        }
        let len = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
        let raw_flag = data[pos + 4];
        let flag = raw_flag & 0x3f;
        let enc_len = if version == VERSION_V4 {
            u32::from_le_bytes(data[pos + 7..pos + 11].try_into().unwrap()) as usize
        } else {
            u32::from_le_bytes(data[pos + 9..pos + 13].try_into().unwrap()) as usize
        };
        let total = hdr + enc_len;
        if pos + total > data.len() {
            return Err("MP5-L block payload truncated".into());
        }
        let payload = &data[pos + hdr..pos + total];
        let (order, rice_k) = parse_rice_meta(flag, payload);
        if flag == FLAG_QLP {
            if let (Ok(samples), Some((shift, coefficients))) = (
                super::qlp::decode_qlp_payload(payload, len),
                parse_qlp_predictor(payload),
            ) {
                let (rice_bits, verbatim_bits) =
                    qlp_warmup_bits(&samples, order, shift, &coefficients);
                qlp_warmup_rice_counterfactual_bits =
                    qlp_warmup_rice_counterfactual_bits.saturating_add(rice_bits);
                qlp_warmup_verbatim_bits = qlp_warmup_verbatim_bits.saturating_add(verbatim_bits);
            }
        }
        let bps = if len > 0 {
            (enc_len as f64 * 8.0) / len as f64
        } else {
            0.0
        };
        blocks.push(BlockStat {
            index: idx,
            samples: len,
            flag: raw_flag,
            payload_bytes: enc_len,
            total_bytes: total,
            order,
            rice_k,
            bits_per_sample: bps,
        });
        total_samples += len;
        pos += total;
        idx += 1;
    }

    // `total_samples` already sums every channel's block lengths (= total i16 samples).
    let pcm_bytes = total_samples * 2;
    let file_bytes = data.len();
    let rice_blocks: Vec<_> = blocks
        .iter()
        .filter(|b| (b.flag & 0x3f) == FLAG_RICE || (b.flag & 0x3f) == FLAG_RICE_PACKED)
        .collect();
    let avg_k = if rice_blocks.is_empty() {
        0.0
    } else {
        rice_blocks.iter().map(|b| b.rice_k as f64).sum::<f64>() / rice_blocks.len() as f64
    };
    let avg_order = if rice_blocks.is_empty() {
        0.0
    } else {
        rice_blocks.iter().map(|b| b.order as f64).sum::<f64>() / rice_blocks.len() as f64
    };

    let mut sorted = blocks.clone();
    sorted.sort_by_key(|b| std::cmp::Reverse(b.total_bytes));
    let worst: Vec<_> = sorted.iter().take(5).cloned().collect();
    sorted.sort_by_key(|b| b.total_bytes);
    let best: Vec<_> = sorted.iter().take(5).cloned().collect();

    let overhead = blocks.len() * hdr;
    let block_overhead_pct = if file_bytes > 0 {
        100.0 * overhead as f64 / file_bytes as f64
    } else {
        0.0
    };

    // Stereo hints live in high bits: 0x80=M/S, 0x40=L/S, 0xC0=R/S.
    let stereo_ms = blocks.iter().filter(|b| (b.flag & 0xC0) == 0x80).count();
    let stereo_ls = blocks.iter().filter(|b| (b.flag & 0xC0) == 0x40).count();
    let stereo_rs = blocks.iter().filter(|b| (b.flag & 0xC0) == 0xC0).count();

    let telemetry = encode_telemetry();
    Ok(Mp5lDiagnostics {
        version,
        total_samples,
        channels,
        file_bytes,
        pcm_bytes,
        ratio_vs_pcm: file_bytes as f64 / pcm_bytes.max(1) as f64,
        // Bits per PCM sample (i16), not per channel-frame.
        bits_per_sample: (file_bytes as f64 * 8.0) / total_samples.max(1) as f64,
        block_count: blocks.len(),
        avg_block_samples: total_samples as f64 / blocks.len().max(1) as f64,
        block_overhead_pct,
        silence_blocks: blocks
            .iter()
            .filter(|b| (b.flag & 0x3f) == FLAG_SILENCE)
            .count(),
        const_blocks: blocks
            .iter()
            .filter(|b| (b.flag & 0x3f) == FLAG_CONST)
            .count(),
        rice_blocks: blocks
            .iter()
            .filter(|b| (b.flag & 0x3f) == FLAG_RICE)
            .count(),
        rice_packed_blocks: blocks
            .iter()
            .filter(|b| (b.flag & 0x3f) == FLAG_RICE_PACKED)
            .count(),
        delta_blocks: blocks
            .iter()
            .filter(|b| (b.flag & 0x3f) == FLAG_DELTA)
            .count(),
        raw_blocks: blocks
            .iter()
            .filter(|b| (b.flag & 0x3f) == FLAG_RAW)
            .count(),
        qlp_blocks: blocks
            .iter()
            .filter(|b| (b.flag & 0x3f) == FLAG_QLP)
            .count(),
        i32_pred_blocks: blocks
            .iter()
            .filter(|b| (b.flag & 0x3f) == FLAG_I32_PRED)
            .count(),
        i32_qlp_blocks: blocks
            .iter()
            .filter(|b| (b.flag & 0x3f) == FLAG_I32_QLP)
            .count(),
        qlp_warmup_verbatim_bits,
        qlp_warmup_rice_counterfactual_bits,
        qlp_top4_misses: telemetry.qlp_top4_misses,
        qlp_top4_checks: telemetry.qlp_top4_checks,
        rice_escape_bits_total: telemetry.rice_escape_bits_total,
        rice_escape_events: telemetry.rice_escape_events,
        partition_header_bits_total: telemetry.partition_header_bits_total,
        rice_block_pct: 100.0 * rice_blocks.len() as f64 / blocks.len().max(1) as f64,
        avg_rice_k: avg_k,
        avg_predictor_order: avg_order,
        residual_entropy_bits_per_sample: estimate_entropy_bps(&blocks),
        // Preserve field: count all stereo-decorrelated left blocks (M/S + L/S + R/S).
        stereo_ms_blocks: stereo_ms + stereo_ls + stereo_rs,
        worst_blocks: worst,
        best_blocks: best,
    })
}

fn parse_rice_meta(flag: u8, payload: &[u8]) -> (u8, u8) {
    let flag = flag & 0x3f;
    match flag {
        FLAG_RICE if payload.len() >= 5 => (payload[0], 0),
        FLAG_RICE_PACKED if payload.len() >= 7 => (payload[0], payload[6]),
        FLAG_QLP if payload.len() >= 5 => {
            let order = payload[0] as usize;
            let Some(parts_offset) = order.checked_mul(4).and_then(|bytes| bytes.checked_add(2))
            else {
                return (0, 0);
            };
            let k = payload
                .get(parts_offset)
                .copied()
                .filter(|&parts| parts > 0)
                .and_then(|_| payload.get(parts_offset + 2).copied())
                .map(|packed| packed >> 4)
                .unwrap_or(0);
            (order as u8, k)
        }
        FLAG_I32_RICE if payload.len() >= 3 => (0, payload[2] >> 4),
        FLAG_I32_PRED if payload.len() >= 4 => {
            let order = payload[0] as usize;
            let Some(parts_offset) = order.checked_mul(4).and_then(|bytes| bytes.checked_add(1))
            else {
                return (0, 0);
            };
            let k = payload
                .get(parts_offset)
                .copied()
                .filter(|&parts| parts > 0)
                .and_then(|_| payload.get(parts_offset + 2).copied())
                .map(|packed| packed >> 4)
                .unwrap_or(0);
            (order as u8, k)
        }
        FLAG_I32_QLP if payload.len() >= 5 => {
            let order = payload[0] as usize;
            let Some(parts_offset) = order.checked_mul(6).and_then(|bytes| bytes.checked_add(2))
            else {
                return (0, 0);
            };
            let k = payload
                .get(parts_offset)
                .copied()
                .filter(|&parts| parts > 0)
                .and_then(|_| payload.get(parts_offset + 2).copied())
                .map(|packed| packed >> 4)
                .unwrap_or(0);
            (order as u8, k)
        }
        _ => (0, 0),
    }
}

fn parse_qlp_predictor(payload: &[u8]) -> Option<(u8, Vec<i16>)> {
    let order = *payload.first()? as usize;
    let shift = *payload.get(1)?;
    let coefficients_end = 2usize.checked_add(order.checked_mul(2)?)?;
    let bytes = payload.get(2..coefficients_end)?;
    let coefficients = bytes
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();
    Some((shift, coefficients))
}

fn estimate_entropy_bps(blocks: &[BlockStat]) -> f64 {
    let rice: Vec<_> = blocks
        .iter()
        .filter(|b| {
            let f = b.flag & 0x3f;
            f == FLAG_RICE || f == FLAG_RICE_PACKED
        })
        .collect();
    if rice.is_empty() {
        return 0.0;
    }
    rice.iter().map(|b| b.bits_per_sample).sum::<f64>() / rice.len() as f64
}

/// Estimate residual entropy for a sample block (analysis only).
pub fn residual_entropy_estimate(samples: &[i16], order: u8) -> f64 {
    let res = residuals(samples, order);
    let k = estimate_k(&res);
    rice_estimate_bits(&res, k) as f64 / samples.len().max(1) as f64
}

/// Compare the v3-style Rice cost of QLP warm-up residuals with the v4
/// verbatim warm-up cost. The Rice estimate uses partition choices optimized
/// for the full residual sequence, then measures only its warm-up prefix.
pub fn qlp_warmup_bits(
    samples: &[i16],
    order: u8,
    shift: u8,
    coefficients: &[i16],
) -> (usize, usize) {
    let order = order as usize;
    if order > samples.len()
        || order != coefficients.len()
        || order > super::qlp::MAX_QLP_ORDER
        || shift > 31
    {
        return (0, 0);
    }
    if order == 0 {
        return (0, 0);
    }
    let Some(residuals) = super::qlp::residuals_including_warmups(samples, shift, coefficients)
    else {
        return (0, order.saturating_mul(16));
    };
    let ks = best_partitioned_ks(&residuals, 16);
    (
        rice_estimate_prefix_bits_partitioned_escape(&residuals, &ks, order, 16),
        order.saturating_mul(16),
    )
}

pub fn flag_name(flag: u8) -> &'static str {
    let flag = flag & 0x3f;
    match flag {
        FLAG_SILENCE => "silence",
        FLAG_CONST => "const",
        FLAG_RICE => "lpc+varint",
        FLAG_RICE_PACKED => "lpc+rice",
        FLAG_QLP => "stored-qlp+rice",
        FLAG_I32_RICE => "i32-side+rice",
        FLAG_I32_PRED => "i32-side+fixed+rice",
        FLAG_I32_QLP => "i32-side+qlp+rice",
        FLAG_DELTA => "delta+varint",
        FLAG_RAW => "raw",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qlp_warmup_counterfactual_reports_rice_and_verbatim_bits() {
        let samples = [20_000, -20_000, 100, 101, 102, 103];
        let (rice_bits, verbatim_bits) = qlp_warmup_bits(&samples, 2, 8, &[256, 0]);
        assert_eq!(verbatim_bits, 32);
        assert!(rice_bits > verbatim_bits);
    }

    #[test]
    fn encode_telemetry_counts_escape_width_and_partition_headers() {
        reset_encode_telemetry();
        let residuals = [i16::MIN as i32, i16::MAX as i32];
        let _ = super::super::rice::rice_encode_partitioned_escape(&residuals, &[0], 16);
        let telemetry = encode_telemetry();
        assert_eq!(telemetry.rice_escape_events, 2);
        assert_eq!(telemetry.rice_escape_bits_total, 32);
        assert_eq!(telemetry.partition_header_bits_total, 20);
    }

    #[test]
    fn diagnostics_count_v4_qlp_and_warmup_tax() {
        let samples: Vec<i16> = (0..4096)
            .map(|index| ((index as f64 * 0.014).sin() * 24_000.0) as i16)
            .collect();
        let bitstream = super::super::encode_v4(&samples, 1);
        let diagnostics = analyze_bitstream(&bitstream, 1).unwrap();
        assert!(diagnostics.qlp_blocks > 0);
        assert_eq!(diagnostics.i32_pred_blocks, 0);
        assert!(diagnostics.qlp_warmup_verbatim_bits > 0);
        assert!(diagnostics.qlp_warmup_rice_counterfactual_bits > 0);
        assert!(diagnostics.qlp_top4_checks > 0);
        assert!(diagnostics.qlp_top4_misses <= diagnostics.qlp_top4_checks);
        assert!(diagnostics.partition_header_bits_total > 0);
    }
}
