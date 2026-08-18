//! Coded scalefactors for the MDCT loud path (Phase 4.1).
//!
//! The transitional lab syntax stores one raw `f32` quant step per band per
//! frame per channel (32 bands → 129 bytes/frame/ch including the count byte).
//! At `HOP = 1024` / 44.1 kHz stereo that is ~88 kbps of pure side info —
//! roughly 39% of a dense-music bitstream and the measurement blocker in front
//! of any honest LAME ladder claim.
//!
//! This module replaces those raw floats with:
//!
//! 1. a **log-domain global gain** — the band-0 step as an index on a
//!    `1/4`-log2 grid (≈1.505 dB per step), and
//! 2. **integer band deltas** against the previous band, zigzag mapped and
//!    Rice coded with a per-frame `k` chosen by exhaustive cost search.
//!
//! Both sides reconstruct the step from the index, so the encoder quantizes
//! coefficients with exactly the step the decoder will use. The only quality
//! cost is the grid itself (±0.75 dB on a band step), never an encoder/decoder
//! mismatch.
//!
//! Streams using this syntax carry mp5c3 magic `0x4D 0x34` ("M4"); the raw
//! `f32` syntax keeps `0x4D 0x33` ("M3") and stays decodable forever.

use crate::mp5l::bitwriter::{BitReader, BitWriter};

/// Grid resolution: index units per log2. 4 → 1/4 log2 ≈ 1.505 dB per step.
pub const GRID_UNITS_PER_LOG2: f32 = 4.0;

/// Smallest representable step; guards `log2` against zero/denormal input.
const STEP_FLOOR: f32 = 1e-12;

/// Index clamp. Covers steps from ~2^-128 to ~2^127, far beyond anything the
/// quantizer produces, while keeping the gain inside `i16`.
const INDEX_MIN: i32 = -512;
const INDEX_MAX: i32 = 511;

/// Largest Rice parameter considered by the encoder's cost search.
const MAX_K: u8 = 7;

/// Unary run cap for the decoder. The encoder's cost search never emits a
/// quotient anywhere near this; a longer run means a corrupt stream.
const MAX_UNARY: u32 = 64;

/// Maximum band count accepted from a stream (raw syntax uses a `u8` count).
pub const MAX_BANDS: usize = 255;

/// Map a quant step onto the log2 grid.
pub fn quantize_index(step: f32) -> i32 {
    let s = if step.is_finite() && step > STEP_FLOOR {
        step
    } else {
        STEP_FLOOR
    };
    let idx = (s.log2() * GRID_UNITS_PER_LOG2).round() as i32;
    idx.clamp(INDEX_MIN, INDEX_MAX)
}

/// Rebuild the step a grid index stands for. Decoder-side truth.
pub fn reconstruct_step(index: i32) -> f32 {
    let i = index.clamp(INDEX_MIN, INDEX_MAX);
    (i as f32 / GRID_UNITS_PER_LOG2).exp2()
}

/// Snap every step onto the grid, returning `(indices, reconstructed steps)`.
///
/// The encoder **must** quantize coefficients against the reconstructed steps
/// so encoder and decoder agree bit-for-bit on the dequantization scale.
pub fn snap_steps(steps: &[f32]) -> (Vec<i32>, Vec<f32>) {
    let idx: Vec<i32> = steps.iter().map(|&s| quantize_index(s)).collect();
    let rec: Vec<f32> = idx.iter().map(|&i| reconstruct_step(i)).collect();
    (idx, rec)
}

fn zigzag(v: i32) -> u32 {
    ((v << 1) ^ (v >> 31)) as u32
}

fn unzigzag(v: u32) -> i32 {
    ((v >> 1) as i32) ^ -((v & 1) as i32)
}

fn rice_bits(v: u32, k: u8) -> usize {
    ((v >> k) as usize) + 1 + k as usize
}

/// Pick the Rice parameter that minimises total delta cost. Exhaustive over
/// `0..=MAX_K`, so encoding is deterministic and re-encode is byte-identical.
fn choose_k(deltas: &[u32]) -> u8 {
    let mut best_k = 0u8;
    let mut best = usize::MAX;
    for k in 0..=MAX_K {
        let cost: usize = deltas.iter().map(|&v| rice_bits(v, k)).sum();
        if cost < best {
            best = cost;
            best_k = k;
        }
    }
    best_k
}

/// Encode grid indices into the coded-scalefactor bit blob.
///
/// Layout: `k` (3 bits), then `indices.len() - 1` Rice-coded zigzag deltas.
/// The global gain (`indices[0]`) is carried outside the blob by the record
/// header so a skipping parser never has to enter the bitstream.
pub fn encode_deltas(indices: &[i32]) -> Vec<u8> {
    if indices.len() <= 1 {
        return Vec::new();
    }
    let deltas: Vec<u32> = indices
        .windows(2)
        .map(|w| zigzag(w[1] - w[0]))
        .collect();
    let k = choose_k(&deltas);
    let mut w = BitWriter::new();
    w.write_bits(k as u32, 3);
    for &v in &deltas {
        let q = v >> k;
        for _ in 0..q {
            w.write_bit(1);
        }
        w.write_bit(0);
        if k > 0 {
            w.write_bits(v & ((1u32 << k) - 1), k);
        }
    }
    w.finish()
}

/// Decode `nb` grid indices from `gain` plus the Rice blob.
///
/// Fails closed on a truncated blob or an implausible unary run rather than
/// returning a short/garbage scalefactor set.
pub fn decode_deltas(gain: i32, nb: usize, blob: &[u8]) -> Result<Vec<i32>, String> {
    if nb == 0 {
        return Err("mp5c3 coded scalefactors: zero band count".into());
    }
    if nb > MAX_BANDS {
        return Err(format!("mp5c3 coded scalefactors: band count {nb} too large"));
    }
    let mut out = Vec::with_capacity(nb);
    out.push(gain.clamp(INDEX_MIN, INDEX_MAX));
    if nb == 1 {
        return Ok(out);
    }
    let mut r = BitReader::new(blob);
    let k = r
        .read_bits(3)
        .ok_or_else(|| "mp5c3 coded scalefactors: truncated rice parameter".to_string())?
        as u8;
    for _ in 1..nb {
        let mut q = 0u32;
        loop {
            let bit = r
                .read_bit()
                .ok_or_else(|| "mp5c3 coded scalefactors: truncated unary run".to_string())?;
            if bit == 0 {
                break;
            }
            q += 1;
            if q > MAX_UNARY {
                return Err("mp5c3 coded scalefactors: unary run overflow".into());
            }
        }
        let rem = if k > 0 {
            r.read_bits(k)
                .ok_or_else(|| "mp5c3 coded scalefactors: truncated remainder".to_string())?
        } else {
            0
        };
        let v = (q << k) | rem;
        let prev = *out.last().unwrap();
        let next = prev
            .checked_add(unzigzag(v))
            .ok_or_else(|| "mp5c3 coded scalefactors: index overflow".to_string())?;
        if !(INDEX_MIN..=INDEX_MAX).contains(&next) {
            return Err(format!(
                "mp5c3 coded scalefactors: index {next} outside [{INDEX_MIN}, {INDEX_MAX}]"
            ));
        }
        out.push(next);
    }
    Ok(out)
}

/// Reconstruct steps directly from `gain` + blob.
pub fn decode_steps(gain: i32, nb: usize, blob: &[u8]) -> Result<Vec<f32>, String> {
    Ok(decode_deltas(gain, nb, blob)?
        .into_iter()
        .map(reconstruct_step)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grid_step_is_about_1_5_db() {
        let a = reconstruct_step(0);
        let b = reconstruct_step(1);
        let db = 20.0 * (b / a).log10();
        assert!(
            (db - 1.505).abs() < 0.01,
            "grid step {db} dB should be ~1.505 dB"
        );
    }

    #[test]
    fn snap_then_reconstruct_stays_within_half_grid() {
        let steps: Vec<f32> = (0..64).map(|i| 0.001 * 1.13f32.powi(i)).collect();
        let (_, rec) = snap_steps(&steps);
        for (orig, got) in steps.iter().zip(rec.iter()) {
            let db = 20.0 * (got / orig).log10();
            assert!(
                db.abs() <= 0.76,
                "step {orig} → {got} moved {db} dB, over half a grid step"
            );
        }
    }

    #[test]
    fn deltas_roundtrip_exactly() {
        let steps: Vec<f32> = vec![
            0.0035, 0.0041, 0.0038, 0.012, 0.05, 0.049, 0.0035, 0.0035, 0.09, 0.0011,
        ];
        let (idx, _) = snap_steps(&steps);
        let blob = encode_deltas(&idx);
        let back = decode_deltas(idx[0], idx.len(), &blob).expect("decode");
        assert_eq!(idx, back);
    }

    #[test]
    fn realistic_band_set_fits_the_side_info_budget() {
        // 32 bands with a plausible spectral tilt. Record overhead in the
        // coded syntax is nb(1) + gain(2) + blob_len(2) = 5 bytes.
        let steps: Vec<f32> = (0..32)
            .map(|i| 0.0035 * (1.0 + i as f32 * 0.35))
            .collect();
        let (idx, _) = snap_steps(&steps);
        let blob = encode_deltas(&idx);
        let record = 5 + blob.len();
        assert!(
            record < 30,
            "coded scalefactor record {record} B should be far under the 129 B raw form"
        );
    }

    #[test]
    fn encoding_is_deterministic() {
        let steps: Vec<f32> = (0..32).map(|i| 0.002 * (1.0 + i as f32 * 0.2)).collect();
        let (idx, _) = snap_steps(&steps);
        assert_eq!(encode_deltas(&idx), encode_deltas(&idx));
    }

    #[test]
    fn truncated_blob_fails_closed() {
        let steps: Vec<f32> = (0..32).map(|i| 0.002 * (1.0 + i as f32 * 0.9)).collect();
        let (idx, _) = snap_steps(&steps);
        let blob = encode_deltas(&idx);
        assert!(decode_deltas(idx[0], idx.len(), &blob[..blob.len() / 2]).is_err());
        assert!(decode_deltas(idx[0], idx.len(), &[]).is_err());
    }

    #[test]
    fn garbage_blob_never_panics() {
        for seed in 0..64u32 {
            let blob: Vec<u8> = (0..24u32)
                .map(|i| ((seed.wrapping_mul(2654435761).wrapping_add(i)) >> 3) as u8)
                .collect();
            let _ = decode_deltas(-40, 32, &blob);
        }
    }

    #[test]
    fn zero_and_negative_steps_are_floored_not_nan() {
        for bad in [0.0f32, -1.0, f32::NAN, f32::INFINITY] {
            let idx = quantize_index(bad);
            assert!((INDEX_MIN..=INDEX_MAX).contains(&idx));
            assert!(reconstruct_step(idx).is_finite());
            assert!(reconstruct_step(idx) > 0.0);
        }
    }
}
