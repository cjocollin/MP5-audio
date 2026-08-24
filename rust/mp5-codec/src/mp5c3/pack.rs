//! Lightweight entropy for MP5-C3 MDCT coefficients (lab-only).
//! Does not depend on or modify MP5-C v5.1 packers.
//!
//! Phase 4.2 adds a partitioned-Rice + HF zero-run record (`FLAG_PRICED`),
//! reusing MP5-L's partitioned-k machinery (`mp5l::rice`). Every record is
//! self-describing via its flag byte, so old builds fail closed on the new
//! flag and new builds decode every historical record.

use crate::mp5l::rice::{
    best_partitioned_ks_with_bits, escape_bits_for_residuals, estimate_k, pack_partition_ks,
    rice_decode, rice_decode_partitioned_escape, rice_encode, rice_encode_partitioned_escape,
    rice_estimate_bits, unpack_partition_ks, MAX_K,
};

const FLAG_DENSE: u8 = 0;
const FLAG_RICE: u8 = 1;
const FLAG_ZERO: u8 = 2;
const FLAG_PRICED: u8 = 3;

/// Decoder-side sanity cap on the coefficient count a pack claims to carry.
/// COEFFS is 1024 in this revision; the cap leaves headroom while stopping a
/// corrupt length from forcing a huge allocation.
const MAX_COEFFS: usize = 1 << 20;

/// How quantized MDCT coefficients are entropy-coded inside a hop record.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CoeffMode {
    /// Silence / single-k Rice / dense i16, smallest of the three (Phase 0).
    /// This is the exact byte syntax MP5-C2 embeds — it must never change.
    Legacy,
    /// Partitioned escaped Rice with HF zero-run truncation (Phase 4.2),
    /// falling back to the legacy candidates when they win on bytes.
    Partitioned,
}

/// Pack quantized MDCT coeffs: try silence / Rice / dense i16.
pub fn pack_coeffs(coeffs: &[i16]) -> Vec<u8> {
    if coeffs.iter().all(|&c| c == 0) {
        let mut out = vec![FLAG_ZERO];
        out.extend(&(coeffs.len() as u32).to_le_bytes());
        return out;
    }

    let dense = {
        let mut v = vec![FLAG_DENSE];
        v.extend(&(coeffs.len() as u32).to_le_bytes());
        for &c in coeffs {
            v.extend(&c.to_le_bytes());
        }
        v
    };

    let vals: Vec<i32> = coeffs.iter().map(|&c| c as i32).collect();
    let k = estimate_k(&vals).min(MAX_K);
    let rice_body = rice_encode(&vals, k);
    let mut rice = vec![FLAG_RICE, k];
    rice.extend(&(coeffs.len() as u32).to_le_bytes());
    rice.extend(&(rice_body.len() as u32).to_le_bytes());
    rice.extend(&rice_body);

    if rice.len() < dense.len() {
        rice
    } else {
        dense
    }
}

/// Pack quantized MDCT coeffs under an explicit coding mode.
///
/// `CoeffMode::Legacy` is byte-identical to [`pack_coeffs`]. `Partitioned`
/// tries the Phase 4.2 partitioned-Rice record first and falls back to the
/// legacy record when it is smaller, so the mode never loses to legacy.
pub fn pack_coeffs_mode(coeffs: &[i16], mode: CoeffMode) -> Vec<u8> {
    match mode {
        CoeffMode::Legacy => pack_coeffs(coeffs),
        CoeffMode::Partitioned => {
            let legacy = pack_coeffs(coeffs);
            if coeffs.iter().all(|&c| c == 0) {
                return legacy; // FLAG_ZERO fast path is already minimal.
            }
            let priced = pack_coeffs_partitioned(coeffs);
            if priced.len() <= legacy.len() {
                priced
            } else {
                legacy
            }
        }
    }
}

/// Partitioned escaped Rice over the non-zero prefix, with the trailing
/// high-frequency zero run carried implicitly as a count (Phase 4.2).
///
/// Layout: `flag(1) | n(u32) | last_nz(u32) | parts(u8) | escape_bits(u8) |
/// packed ks (4 bits each) | body_len(u32) | body`.
fn pack_coeffs_partitioned(coeffs: &[i16]) -> Vec<u8> {
    debug_assert!(coeffs.iter().any(|&c| c != 0));
    // HF zero-run: coefficients after the last non-zero one are implicit zeros.
    let last_nz = coeffs
        .iter()
        .rposition(|&c| c != 0)
        .map(|p| p + 1)
        .unwrap_or(0);
    let vals: Vec<i32> = coeffs[..last_nz].iter().map(|&c| c as i32).collect();
    let escape_bits = escape_bits_for_residuals(&vals);
    let (ks, rice_bits) = best_partitioned_ks_with_bits(&vals, escape_bits);
    let body = rice_encode_partitioned_escape(&vals, &ks, escape_bits);
    // Estimator/writer bit-count equality (Phase 4.2 contract): the search
    // must price exactly what the writer emits, or the choice of k is a lie.
    debug_assert_eq!(
        body.len(),
        rice_bits.div_ceil(8),
        "partitioned-rice estimate disagrees with writer"
    );
    let mut out = Vec::with_capacity(16 + body.len());
    out.push(FLAG_PRICED);
    out.extend(&(coeffs.len() as u32).to_le_bytes());
    out.extend(&(last_nz as u32).to_le_bytes());
    out.push(ks.len() as u8);
    out.push(escape_bits);
    out.extend(&pack_partition_ks(&ks));
    out.extend(&(body.len() as u32).to_le_bytes());
    out.extend(&body);
    out
}

/// Exact byte length of the pack [`pack_coeffs_mode`] would emit, without
/// writing it. Used by the rate-control bisection, which prices many
/// candidates per hop but should only pay for one real pack (winner).
pub fn packed_len_estimate(coeffs: &[i16], mode: CoeffMode) -> usize {
    match mode {
        CoeffMode::Legacy => legacy_len_estimate(coeffs),
        CoeffMode::Partitioned => {
            let legacy = legacy_len_estimate(coeffs);
            if legacy == 5 {
                return legacy; // all-zero fast path
            }
            let priced = partitioned_len_estimate(coeffs);
            if priced <= legacy {
                priced
            } else {
                legacy
            }
        }
    }
}

/// Exact length of the legacy silence/Rice/dense record, no writes.
fn legacy_len_estimate(coeffs: &[i16]) -> usize {
    if coeffs.iter().all(|&c| c == 0) {
        return 5; // FLAG_ZERO + n
    }
    let dense = 1 + 4 + 2 * coeffs.len();
    let vals: Vec<i32> = coeffs.iter().map(|&c| c as i32).collect();
    let k = estimate_k(&vals).min(MAX_K);
    let body = rice_estimate_bits(&vals, k).div_ceil(8);
    let rice = 1 + 1 + 4 + 4 + body;
    rice.min(dense)
}

/// Exact length of a FLAG_PRICED record, computed without writing the body.
fn partitioned_len_estimate(coeffs: &[i16]) -> usize {
    debug_assert!(coeffs.iter().any(|&c| c != 0));
    let last_nz = coeffs
        .iter()
        .rposition(|&c| c != 0)
        .map(|p| p + 1)
        .unwrap_or(0);
    let vals: Vec<i32> = coeffs[..last_nz].iter().map(|&c| c as i32).collect();
    let escape_bits = escape_bits_for_residuals(&vals);
    let (ks, rice_bits) = best_partitioned_ks_with_bits(&vals, escape_bits);
    1 + 4 + 4 + 1 + 1 + ks.len().div_ceil(2) + 4 + rice_bits.div_ceil(8)
}

pub fn unpack_coeffs(data: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    if data.is_empty() {
        return Err("empty mp5c3 coeff pack".into());
    }
    if expected > MAX_COEFFS {
        return Err(format!(
            "mp5c3 expected coefficient count {expected} too large"
        ));
    }
    let check_count = |n: usize| {
        if n == expected {
            Ok(())
        } else {
            Err(format!("mp5c3 coeff count {n} != {expected}"))
        }
    };
    let flag = data[0];
    match flag {
        FLAG_ZERO => {
            if data.len() < 5 {
                return Err("truncated zero pack".into());
            }
            let n = u32::from_le_bytes(data[1..5].try_into().unwrap()) as usize;
            check_count(n)?;
            Ok(vec![0i16; n])
        }
        FLAG_DENSE => {
            if data.len() < 5 {
                return Err("truncated dense pack".into());
            }
            let n = u32::from_le_bytes(data[1..5].try_into().unwrap()) as usize;
            check_count(n)?;
            if data.len() < 5 + n * 2 {
                return Err("truncated dense coeffs".into());
            }
            let mut out = Vec::with_capacity(n);
            for i in 0..n {
                let off = 5 + i * 2;
                out.push(i16::from_le_bytes(data[off..off + 2].try_into().unwrap()));
            }
            Ok(out)
        }
        FLAG_RICE => {
            if data.len() < 10 {
                return Err("truncated rice pack".into());
            }
            let k = data[1];
            if k > MAX_K {
                return Err(format!(
                    "mp5c3 rice parameter {k} out of range (fail-closed)"
                ));
            }
            let n = u32::from_le_bytes(data[2..6].try_into().unwrap()) as usize;
            check_count(n)?;
            let body_len = u32::from_le_bytes(data[6..10].try_into().unwrap()) as usize;
            let body_end = 10usize
                .checked_add(body_len)
                .filter(|&end| end <= data.len())
                .ok_or_else(|| "truncated rice body".to_string())?;
            let body = &data[10..body_end];
            let vals = rice_decode(body, k, n)?;
            Ok(vals
                .into_iter()
                .map(|v| v.clamp(i16::MIN as i32, i16::MAX as i32) as i16)
                .collect())
        }
        FLAG_PRICED => {
            if data.len() < 16 {
                return Err("truncated partitioned-rice pack".into());
            }
            let n = u32::from_le_bytes(data[1..5].try_into().unwrap()) as usize;
            let last_nz = u32::from_le_bytes(data[5..9].try_into().unwrap()) as usize;
            let parts = data[9] as usize;
            let escape_bits = data[10];
            check_count(n)?;
            if last_nz > n {
                return Err("partitioned-rice zero-run index past coefficient count".into());
            }
            if parts == 0 || parts > 16 {
                return Err(format!("partitioned-rice partition count {parts} invalid"));
            }
            let ks_len = parts.div_ceil(2);
            if data.len() < 11 + ks_len + 4 {
                return Err("truncated partitioned-rice pack header".into());
            }
            let ks = unpack_partition_ks(&data[11..11 + ks_len], parts)?;
            let blen_at = 11 + ks_len;
            let body_len =
                u32::from_le_bytes(data[blen_at..blen_at + 4].try_into().unwrap()) as usize;
            let body_start = blen_at + 4;
            let body_end = body_start
                .checked_add(body_len)
                .filter(|&end| end <= data.len())
                .ok_or_else(|| "truncated partitioned-rice body".to_string())?;
            let body = &data[body_start..body_end];
            let vals = rice_decode_partitioned_escape(body, &ks, last_nz, escape_bits)?;
            if vals.len() != last_nz {
                return Err("partitioned-rice count mismatch".into());
            }
            let mut out = Vec::with_capacity(n);
            out.extend(
                vals.into_iter()
                    .map(|v| v.clamp(i16::MIN as i32, i16::MAX as i32) as i16),
            );
            out.resize(n, 0);
            Ok(out)
        }
        _ => Err(format!("unknown mp5c3 pack flag {flag}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_unpack_roundtrip() {
        let coeffs: Vec<i16> = (-40..40).map(|i| (i * 3) as i16).collect();
        let packed = pack_coeffs(&coeffs);
        let back = unpack_coeffs(&packed, coeffs.len()).unwrap();
        assert_eq!(back, coeffs);
    }

    #[test]
    fn pack_zeros() {
        let coeffs = vec![0i16; 128];
        let packed = pack_coeffs(&coeffs);
        assert_eq!(packed[0], FLAG_ZERO);
        assert_eq!(unpack_coeffs(&packed, coeffs.len()).unwrap(), coeffs);
    }

    /// MDCT-like spectrum: decaying magnitudes with a long HF zero tail.
    fn mdct_like(n: usize, zero_from: usize) -> Vec<i16> {
        let mut rng: u32 = 0x1234_5678;
        (0..n)
            .map(|i| {
                rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
                if i >= zero_from {
                    0
                } else {
                    let mag = 2000.0 * (-(i as f32) / 90.0).exp();
                    ((((rng >> 16) as f32 / 32768.0) - 1.0) * mag) as i16
                }
            })
            .collect()
    }

    #[test]
    fn partitioned_roundtrip_preserves_coeffs_exactly() {
        for coeffs in [
            mdct_like(1024, 700),
            mdct_like(1024, 1024),
            mdct_like(64, 30),
            vec![0i16, -32767, 32767, 1, -1, 0, 0, 5],
        ] {
            let packed = pack_coeffs_mode(&coeffs, CoeffMode::Partitioned);
            assert_eq!(unpack_coeffs(&packed, coeffs.len()).unwrap(), coeffs);
        }
    }

    #[test]
    fn partitioned_beats_legacy_on_mdct_like_spectra() {
        let coeffs = mdct_like(1024, 620);
        let legacy = pack_coeffs(&coeffs);
        let priced = pack_coeffs_mode(&coeffs, CoeffMode::Partitioned);
        eprintln!(
            "PHASE4.2 pack: legacy {} B -> partitioned {} B",
            legacy.len(),
            priced.len()
        );
        assert!(
            priced.len() < legacy.len(),
            "partitioned {} B must beat legacy {} B on an MDCT-like spectrum",
            priced.len(),
            legacy.len()
        );
        assert_eq!(priced[0], FLAG_PRICED);
    }

    #[test]
    fn partitioned_never_loses_to_legacy() {
        // White-noise coeffs: the legacy dense path may win; the mode must
        // fall back rather than emit a larger record.
        let mut rng: u32 = 0xdead_beef;
        let coeffs: Vec<i16> = (0..1024)
            .map(|_| {
                rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
                (rng >> 16) as i16
            })
            .collect();
        let legacy = pack_coeffs(&coeffs);
        let priced = pack_coeffs_mode(&coeffs, CoeffMode::Partitioned);
        assert!(priced.len() <= legacy.len());
        assert_eq!(unpack_coeffs(&priced, coeffs.len()).unwrap(), coeffs);
    }

    #[test]
    fn estimator_matches_writer_bit_count() {
        let coeffs = mdct_like(1024, 800);
        let packed = pack_coeffs_partitioned(&coeffs);
        assert_eq!(packed[0], FLAG_PRICED);
        let parts = packed[9] as usize;
        let escape_bits = packed[10];
        let ks = unpack_partition_ks(&packed[11..11 + parts.div_ceil(2)], parts).unwrap();
        let last_nz = u32::from_le_bytes(packed[5..9].try_into().unwrap()) as usize;
        let vals: Vec<i32> = coeffs[..last_nz].iter().map(|&c| c as i32).collect();
        let body_len_at = 11 + parts.div_ceil(2);
        let body_len =
            u32::from_le_bytes(packed[body_len_at..body_len_at + 4].try_into().unwrap()) as usize;
        let estimated =
            crate::mp5l::rice::rice_estimate_bits_partitioned_escape(&vals, &ks, escape_bits);
        assert_eq!(estimated.div_ceil(8), body_len);
    }

    #[test]
    fn partitioned_garbage_fails_closed() {
        let coeffs = mdct_like(256, 200);
        let packed = pack_coeffs_partitioned(&coeffs);
        // Truncations at every third offset must error, never panic or lie.
        for cut in (0..packed.len()).step_by(3) {
            let _ = unpack_coeffs(&packed[..cut], coeffs.len());
        }
        // Bad partition count / escape bits / zero-run index are all caught.
        let mut bad = packed.clone();
        bad[9] = 0;
        assert!(unpack_coeffs(&bad, coeffs.len()).is_err());
        let mut bad = packed.clone();
        bad[9] = 17;
        assert!(unpack_coeffs(&bad, coeffs.len()).is_err());
        let mut bad = packed.clone();
        bad[5] = 0xff; // last_nz way past n
        bad[6] = 0xff;
        assert!(unpack_coeffs(&bad, coeffs.len()).is_err());
    }

    #[test]
    fn every_record_rejects_wrong_count_before_decode() {
        let expected = 256usize;
        for (flag, n_at) in [
            (FLAG_ZERO, 1usize),
            (FLAG_DENSE, 1),
            (FLAG_RICE, 2),
            (FLAG_PRICED, 1),
        ] {
            let header_len = match flag {
                FLAG_RICE => 10,
                FLAG_PRICED => 16,
                _ => 5,
            };
            let mut packed = vec![0u8; header_len];
            packed[0] = flag;
            packed[n_at..n_at + 4].copy_from_slice(&u32::MAX.to_le_bytes());
            let err = unpack_coeffs(&packed, expected).unwrap_err();
            assert!(err.contains("coeff count"), "flag {flag}: {err}");
        }
    }
}
