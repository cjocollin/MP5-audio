//! MP5-L compression diagnostics.

use super::block::{FLAG_CONST, FLAG_DELTA, FLAG_RAW, FLAG_RICE, FLAG_SILENCE};
use super::predict::residuals;
use super::rice::{estimate_k, rice_estimate_bits, PARTITIONS};

pub const VERSION_V2: u8 = 2;
pub const VERSION_V3: u8 = 3;

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
    pub delta_blocks: usize,
    pub raw_blocks: usize,
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
    let mut blocks: Vec<BlockStat> = Vec::new();
    let mut idx = 0usize;
    let mut total_samples = 0usize;

    for _c in 0..ch {
        for _ in 0..frames_per_ch {
            if pos + 13 > data.len() {
                break;
            }
            let len = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
            let flag = data[pos + 4];
            let ms_hint = flag & 0x80 != 0;
            let flag = flag & 0x7f;
            let enc_len = u32::from_le_bytes(data[pos + 9..pos + 13].try_into().unwrap()) as usize;
            let total = 13 + enc_len;
            let (order, rice_k) = parse_rice_meta(flag, &data[pos + 13..pos + total]);
            let bps = if len > 0 {
                (enc_len as f64 * 8.0) / len as f64
            } else {
                0.0
            };
            blocks.push(BlockStat {
                index: idx,
                samples: len,
                flag: if ms_hint { flag | 0x80 } else { flag },
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
    }

    let pcm_bytes = total_samples * ch * 2;
    let file_bytes = data.len();
    let rice_blocks: Vec<_> = blocks.iter().filter(|b| b.flag == FLAG_RICE).collect();
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

    let overhead = blocks.len() * 13;
    let block_overhead_pct = if file_bytes > 0 {
        100.0 * overhead as f64 / file_bytes as f64
    } else {
        0.0
    };

    Ok(Mp5lDiagnostics {
        version,
        total_samples,
        channels,
        file_bytes,
        pcm_bytes,
        ratio_vs_pcm: file_bytes as f64 / pcm_bytes.max(1) as f64,
        bits_per_sample: (file_bytes as f64 * 8.0) / total_samples.max(1) as f64 / ch.max(1) as f64,
        block_count: blocks.len(),
        avg_block_samples: total_samples as f64 / blocks.len().max(1) as f64,
        block_overhead_pct,
        silence_blocks: blocks.iter().filter(|b| b.flag == FLAG_SILENCE).count(),
        const_blocks: blocks.iter().filter(|b| b.flag == FLAG_CONST).count(),
        rice_blocks: blocks.iter().filter(|b| b.flag == FLAG_RICE).count(),
        delta_blocks: blocks.iter().filter(|b| b.flag == FLAG_DELTA).count(),
        raw_blocks: blocks.iter().filter(|b| b.flag == FLAG_RAW).count(),
        rice_block_pct: 100.0 * rice_blocks.len() as f64 / blocks.len().max(1) as f64,
        avg_rice_k: avg_k,
        avg_predictor_order: avg_order,
        residual_entropy_bits_per_sample: estimate_entropy_bps(&blocks),
        stereo_ms_blocks: blocks.iter().filter(|b| b.flag & 0x80 != 0).count(),
        worst_blocks: worst,
        best_blocks: best,
    })
}

fn parse_rice_meta(flag: u8, payload: &[u8]) -> (u8, u8) {
    if flag != FLAG_RICE || payload.len() < 5 {
        return (0, 0);
    }
    let order = payload[0];
    (order, 0)
}

fn estimate_entropy_bps(blocks: &[BlockStat]) -> f64 {
    let rice: Vec<_> = blocks.iter().filter(|b| b.flag == FLAG_RICE).collect();
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

pub fn flag_name(flag: u8) -> &'static str {
    let flag = flag & 0x7f;
    match flag {
        FLAG_SILENCE => "silence",
        FLAG_CONST => "const",
        FLAG_RICE => "lpc+varint",
        FLAG_DELTA => "delta+varint",
        FLAG_RAW => "raw",
        _ => "unknown",
    }
}
