//! Rice coding for MP5-L residuals (single-k and partitioned).

use super::bitwriter::{BitReader, BitWriter};

pub const MAX_K: u8 = 14;
pub const PARTITIONS: usize = 4;
/// Partition counts tried by the encoder (decoder accepts any parts ≤ 16).
pub const PARTITION_CANDIDATES: &[usize] = &[1, 2, 4, 8, 16];
const ESCAPE_Q: u32 = 31;

pub fn estimate_k(residuals: &[i32]) -> u8 {
    if residuals.is_empty() {
        return 0;
    }
    let avg = residuals
        .iter()
        .map(|r| r.unsigned_abs() as u64)
        .sum::<u64>()
        / residuals.len() as u64;
    if avg == 0 {
        return 0;
    }
    let mut k = 0u8;
    while (1u64 << (k + 1)) <= avg && k < MAX_K {
        k += 1;
    }
    k
}

/// Number of bits needed for the largest zigzag value, bounded by the v4 wire.
pub fn escape_bits_for_residuals(residuals: &[i32]) -> u8 {
    residuals
        .iter()
        .map(|&value| {
            let zigzag = zigzag32(value);
            (u32::BITS - zigzag.leading_zeros()) as u8
        })
        .max()
        .unwrap_or(0)
        .clamp(8, 32)
}

/// Choose k for escaped Rice by minimizing its exact encoded bit cost.
pub fn best_k_for_residuals(residuals: &[i32], escape_bits: u8) -> u8 {
    if residuals.is_empty() {
        return 0;
    }
    let mut best_k = 0;
    let mut best_bits = usize::MAX;
    for k in 0..=MAX_K {
        let bits = rice_estimate_bits_escape(residuals, k, escape_bits);
        if bits < best_bits {
            best_bits = bits;
            best_k = k;
        }
    }
    best_k
}

pub fn estimate_k_partitioned(residuals: &[i32], parts: usize, escape_bits: u8) -> Vec<u8> {
    if parts <= 1 {
        return vec![best_k_for_residuals(residuals, escape_bits)];
    }
    let chunk = (residuals.len() + parts - 1) / parts;
    (0..parts)
        .map(|p| {
            let start = p * chunk;
            let end = (start + chunk).min(residuals.len());
            if start >= end {
                0
            } else {
                best_k_for_residuals(&residuals[start..end], escape_bits)
            }
        })
        .collect()
}

/// Prefix sums of exact escaped-Rice sample costs for every supported `k`.
///
/// A v4 candidate search can ask for 1/2/4/8/16 partitions without rescanning
/// the residuals for every partition count. Prefix sums also preserve the
/// existing ceil-chunk boundaries for non-power-of-two residual lengths.
struct EscapedRiceCostTable {
    prefix_bits_by_k: Vec<Vec<usize>>,
}

impl EscapedRiceCostTable {
    fn new(residuals: &[i32], escape_bits: u8) -> Self {
        let mut prefix_bits_by_k =
            vec![Vec::with_capacity(residuals.len() + 1); MAX_K as usize + 1];
        for prefix in &mut prefix_bits_by_k {
            prefix.push(0);
        }
        for &value in residuals {
            let zigzag = zigzag32(value);
            for k in 0..=MAX_K {
                let q = if k == 0 { zigzag } else { zigzag >> k };
                let sample_bits = if q >= ESCAPE_Q {
                    ESCAPE_Q as usize + 1 + escape_bits as usize
                } else {
                    q as usize + 1 + k as usize
                };
                let prefix = &mut prefix_bits_by_k[k as usize];
                let next = prefix
                    .last()
                    .copied()
                    .unwrap_or(0usize)
                    .saturating_add(sample_bits);
                prefix.push(next);
            }
        }
        Self { prefix_bits_by_k }
    }

    fn range_bits(&self, start: usize, end: usize, k: u8) -> usize {
        let prefix = &self.prefix_bits_by_k[k.min(MAX_K) as usize];
        prefix[end].saturating_sub(prefix[start])
    }

    fn best_k(&self, start: usize, end: usize) -> (u8, usize) {
        if start >= end {
            return (0, 0);
        }
        let mut best_k = 0u8;
        let mut best_bits = usize::MAX;
        for k in 0..=MAX_K {
            let bits = self.range_bits(start, end, k);
            if bits < best_bits {
                best_bits = bits;
                best_k = k;
            }
        }
        (best_k, best_bits)
    }

    fn partition_ks_and_bits(&self, residual_len: usize, parts: usize) -> (Vec<u8>, usize) {
        let chunk = residual_len.div_ceil(parts);
        let mut ks = Vec::with_capacity(parts);
        let mut bits = 0usize;
        for part in 0..parts {
            let start = part.saturating_mul(chunk);
            let end = (start + chunk).min(residual_len);
            let (k, part_bits) = self.best_k(start, end);
            ks.push(k);
            bits = bits.saturating_add(part_bits);
        }
        (ks, bits)
    }
}

/// Pick partition count + per-partition k minimizing header + escaped Rice bits.
pub fn best_partitioned_ks(residuals: &[i32], escape_bits: u8) -> Vec<u8> {
    let costs = EscapedRiceCostTable::new(residuals, escape_bits);
    let (mut best_ks, initial_bits) = costs.partition_ks_and_bits(residuals.len(), 1);
    let mut best_total = 16 + best_ks.len() * 4 + initial_bits;
    for &parts in PARTITION_CANDIDATES {
        if parts > residuals.len().max(1) {
            continue;
        }
        let (ks, rice_bits) = costs.partition_ks_and_bits(residuals.len(), parts);
        // parts u8 + escape_bits u8 + four bits per partition k.
        let total = 16 + ks.len() * 4 + rice_bits;
        if total < best_total {
            best_total = total;
            best_ks = ks;
        }
    }
    best_ks
}

fn best_k_for_residuals_unescaped(residuals: &[i32]) -> u8 {
    if residuals.is_empty() {
        return 0;
    }
    let estimate = estimate_k(residuals);
    let mut best_k = estimate;
    let mut best_bits = usize::MAX;
    for k in estimate.saturating_sub(1)..=(estimate + 1).min(MAX_K) {
        let bits = rice_estimate_bits(residuals, k);
        if bits < best_bits {
            best_bits = bits;
            best_k = k;
        }
    }
    best_k
}

pub fn estimate_k_partitioned_unescaped(residuals: &[i32], parts: usize) -> Vec<u8> {
    if parts <= 1 {
        return vec![best_k_for_residuals_unescaped(residuals)];
    }
    let chunk = residuals.len().div_ceil(parts);
    (0..parts)
        .map(|part| {
            let start = part * chunk;
            let end = (start + chunk).min(residuals.len());
            if start < end {
                best_k_for_residuals_unescaped(&residuals[start..end])
            } else {
                0
            }
        })
        .collect()
}

/// Preserve the v3 packed-Rice search exactly; v4 escaped Rice uses
/// `best_partitioned_ks` above.
pub fn best_partitioned_ks_unescaped(residuals: &[i32]) -> Vec<u8> {
    const LEGACY_PARTITIONS: &[usize] = &[1, 2, 4, 8];
    let mut best_ks = vec![best_k_for_residuals_unescaped(residuals)];
    let mut best_total = 1 + best_ks.len() + rice_estimate_bits_partitioned(residuals, &best_ks);
    for &parts in LEGACY_PARTITIONS {
        if parts > residuals.len().max(1) {
            continue;
        }
        let ks = estimate_k_partitioned_unescaped(residuals, parts);
        let total = 1 + ks.len() + rice_estimate_bits_partitioned(residuals, &ks);
        if total < best_total {
            best_total = total;
            best_ks = ks;
        }
    }
    best_ks
}

pub fn rice_estimate_bits(residuals: &[i32], k: u8) -> usize {
    let mut bits = 0usize;
    for &r in residuals {
        let u = zigzag32(r);
        let q = if k == 0 { u } else { u >> k };
        let rem_bits = if k == 0 { 0 } else { k as usize };
        bits = bits.saturating_add(q as usize + 1 + rem_bits);
    }
    bits
}

pub fn rice_estimate_bits_partitioned(residuals: &[i32], ks: &[u8]) -> usize {
    if ks.len() <= 1 {
        return rice_estimate_bits(residuals, ks.first().copied().unwrap_or(0));
    }
    let parts = ks.len();
    let chunk = (residuals.len() + parts - 1) / parts;
    let mut total = 0;
    for (p, &k) in ks.iter().enumerate() {
        let start = p * chunk;
        let end = (start + chunk).min(residuals.len());
        if start < end {
            total += rice_estimate_bits(&residuals[start..end], k);
        }
    }
    total
}

pub fn rice_estimate_bits_escape(residuals: &[i32], k: u8, escape_bits: u8) -> usize {
    residuals.iter().fold(0usize, |bits, &value| {
        let u = zigzag32(value);
        let q = if k == 0 { u } else { u >> k };
        let sample_bits = if q >= ESCAPE_Q {
            ESCAPE_Q as usize + 1 + escape_bits as usize
        } else {
            q as usize + 1 + k as usize
        };
        bits.saturating_add(sample_bits)
    })
}

/// Exact payload bit count produced by `rice_encode_partitioned_escape`,
/// excluding final byte padding.
pub fn rice_estimate_bits_partitioned_escape(
    residuals: &[i32],
    ks: &[u8],
    escape_bits: u8,
) -> usize {
    rice_estimate_prefix_bits_partitioned_escape(residuals, ks, residuals.len(), escape_bits)
}

/// Escaped partitioned Rice bit cost for the first `prefix_count` residuals,
/// using the same partition chunking as a full-stream encode of `residuals`.
/// Used for Phase 0 warm-up tax counterfactuals (Rice vs verbatim).
pub fn rice_estimate_prefix_bits_partitioned_escape(
    residuals: &[i32],
    ks: &[u8],
    prefix_count: usize,
    escape_bits: u8,
) -> usize {
    let prefix_count = prefix_count.min(residuals.len());
    if prefix_count == 0 || ks.is_empty() {
        return 0;
    }
    let parts = ks.len().max(1);
    let chunk = (residuals.len() + parts - 1) / parts;
    let mut total = 0usize;
    let mut remaining = prefix_count;
    for part in 0..parts {
        if remaining == 0 {
            break;
        }
        let start = part * chunk;
        let end = (start + chunk).min(residuals.len());
        if start >= end {
            continue;
        }
        let take = remaining.min(end - start);
        let k = ks.get(part).copied().unwrap_or(0).min(MAX_K);
        total = total.saturating_add(rice_estimate_bits_escape(
            &residuals[start..start + take],
            k,
            escape_bits,
        ));
        remaining -= take;
    }
    total
}

/// Standard signed zigzag (arithmetic right-shift). Must match block.rs.
fn zigzag32(n: i32) -> u32 {
    ((n << 1) ^ (n >> 31)) as u32
}

fn unzigzag32(n: u32) -> i32 {
    ((n >> 1) as i32) ^ (-((n & 1) as i32))
}

/// Rice coding with a bounded unary prefix. Values whose quotient is at least
/// `ESCAPE_Q` use the reserved prefix followed by `escape_bits` zigzag bits.
pub fn rice_encode_partitioned_escape(residuals: &[i32], ks: &[u8], escape_bits: u8) -> Vec<u8> {
    debug_assert!((8..=32).contains(&escape_bits));
    let parts = ks.len().max(1);
    let chunk = (residuals.len() + parts - 1) / parts;
    let mut w = BitWriter::new();
    let mut escape_events = 0usize;
    for p in 0..parts {
        let k = ks.get(p).copied().unwrap_or(0).min(MAX_K);
        let start = p * chunk;
        let end = (start + chunk).min(residuals.len());
        if start >= end {
            continue;
        }
        for &value in &residuals[start..end] {
            let u = zigzag32(value);
            let q = if k == 0 { u } else { u >> k };
            if q >= ESCAPE_Q {
                escape_events = escape_events.saturating_add(1);
                for _ in 0..ESCAPE_Q {
                    w.write_bit(1);
                }
                w.write_bit(0);
                w.write_bits(u, escape_bits);
            } else {
                for _ in 0..q {
                    w.write_bit(1);
                }
                w.write_bit(0);
                let rem = if k == 0 { 0 } else { u & ((1u32 << k) - 1) };
                w.write_bits(rem, k);
            }
        }
    }
    let encoded = w.finish();
    super::diag::record_rice_wire(escape_bits, escape_events, parts);
    encoded
}

pub fn rice_decode_partitioned_escape(
    data: &[u8],
    ks: &[u8],
    count: usize,
    escape_bits: u8,
) -> Result<Vec<i32>, String> {
    if ks.is_empty()
        || ks.len() > 16
        || ks.iter().any(|&k| k > MAX_K)
        || !(8..=32).contains(&escape_bits)
    {
        return Err("escaped Rice parameters invalid".into());
    }
    let parts = ks.len();
    let chunk = (count + parts - 1) / parts;
    let mut reader = BitReader::new(data);
    let mut out = Vec::with_capacity(count);
    for (p, &k) in ks.iter().enumerate() {
        let start = p * chunk;
        let end = (start + chunk).min(count);
        for _ in start..end {
            let mut q = 0u32;
            loop {
                match reader.read_bit() {
                    Some(1) => {
                        q += 1;
                        if q > ESCAPE_Q {
                            return Err("escaped Rice unary overflow".into());
                        }
                    }
                    Some(_) => break,
                    None => return Err("escaped Rice truncated".into()),
                }
            }
            let u = if q == ESCAPE_Q {
                reader
                    .read_bits(escape_bits)
                    .ok_or("escaped Rice raw value truncated")?
            } else {
                let rem = if k == 0 {
                    0
                } else {
                    reader
                        .read_bits(k)
                        .ok_or("escaped Rice remainder truncated")?
                };
                (q << k) | rem
            };
            out.push(unzigzag32(u));
        }
    }
    if out.len() != count {
        return Err("escaped Rice count mismatch".into());
    }
    Ok(out)
}

pub fn pack_partition_ks(ks: &[u8]) -> Vec<u8> {
    debug_assert!(ks.iter().all(|&k| k <= MAX_K));
    let mut packed = Vec::with_capacity(ks.len().div_ceil(2));
    for pair in ks.chunks(2) {
        let high = pair[0] & 0x0f;
        let low = pair.get(1).copied().unwrap_or(0) & 0x0f;
        packed.push((high << 4) | low);
    }
    packed
}

pub fn unpack_partition_ks(packed: &[u8], parts: usize) -> Result<Vec<u8>, String> {
    if parts == 0 || parts > 16 || packed.len() < parts.div_ceil(2) {
        return Err("escaped Rice partition ks truncated".into());
    }
    let mut ks = Vec::with_capacity(parts);
    for index in 0..parts {
        let byte = packed[index / 2];
        let k = if index % 2 == 0 {
            byte >> 4
        } else {
            byte & 0x0f
        };
        if k > MAX_K {
            return Err("escaped Rice partition k invalid".into());
        }
        ks.push(k);
    }
    Ok(ks)
}

pub fn rice_encode(residuals: &[i32], k: u8) -> Vec<u8> {
    let mut w = BitWriter::new();
    for &r in residuals {
        write_rice_sample(&mut w, r, k);
    }
    w.finish()
}

pub fn rice_encode_partitioned(residuals: &[i32], ks: &[u8]) -> Vec<u8> {
    if ks.len() <= 1 {
        return rice_encode(residuals, ks.first().copied().unwrap_or(0));
    }
    let parts = ks.len();
    let chunk = (residuals.len() + parts - 1) / parts;
    let mut w = BitWriter::new();
    for (p, &k) in ks.iter().enumerate() {
        let start = p * chunk;
        let end = (start + chunk).min(residuals.len());
        if start >= end {
            continue;
        }
        for &r in &residuals[start..end] {
            write_rice_sample(&mut w, r, k);
        }
    }
    w.finish()
}

fn write_rice_sample(w: &mut BitWriter, r: i32, k: u8) {
    let u = zigzag32(r);
    let q = if k == 0 { u } else { u >> k };
    let rem = if k == 0 { 0 } else { u & ((1u32 << k) - 1) };
    for _ in 0..q {
        w.write_bit(1);
    }
    w.write_bit(0);
    w.write_bits(rem, k);
}

pub fn rice_decode(data: &[u8], k: u8, count: usize) -> Result<Vec<i32>, String> {
    let mut r = BitReader::new(data);
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        let mut q = 0u32;
        loop {
            match r.read_bit() {
                Some(b) if b != 0 => {
                    q += 1;
                    if q > 1_000_000 {
                        return Err("rice unary overflow".into());
                    }
                }
                Some(_) => break,
                None => return Err("rice truncated".into()),
            }
        }
        let rem = if k > 0 {
            r.read_bits(k).ok_or("rice rem truncated")?
        } else {
            0
        };
        let u = (q << k) | rem;
        out.push(unzigzag32(u));
    }
    Ok(out)
}

pub fn rice_decode_partitioned(data: &[u8], ks: &[u8], count: usize) -> Result<Vec<i32>, String> {
    if ks.len() <= 1 {
        return rice_decode(data, ks.first().copied().unwrap_or(0), count);
    }
    let parts = ks.len();
    let chunk = (count + parts - 1) / parts;
    let mut out = Vec::with_capacity(count);
    let mut r = BitReader::new(data);
    // Mirror encode_partitioned start/end bounds so short blocks stay bit-aligned.
    for (p, &k) in ks.iter().enumerate() {
        let start = p * chunk;
        let end = (start + chunk).min(count);
        if start >= end {
            continue;
        }
        for _ in start..end {
            let mut q = 0u32;
            loop {
                match r.read_bit() {
                    Some(b) if b != 0 => {
                        q += 1;
                        if q > 1_000_000 {
                            return Err("rice unary overflow".into());
                        }
                    }
                    Some(_) => break,
                    None => return Err("rice truncated".into()),
                }
            }
            let rem = if k > 0 {
                r.read_bits(k).ok_or("rice rem truncated")?
            } else {
                0
            };
            let u = (q << k) | rem;
            out.push(unzigzag32(u));
        }
    }
    if out.len() != count {
        return Err(format!(
            "rice-partitioned count mismatch: got {} want {count}",
            out.len()
        ));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimate_k_smoke() {
        let res: Vec<i32> = vec![0, 1, -1, 2, -3];
        assert!(estimate_k(&res) <= MAX_K);
    }

    #[test]
    fn zigzag_negatives_are_small() {
        assert_eq!(zigzag32(0), 0);
        assert_eq!(zigzag32(-1), 1);
        assert_eq!(zigzag32(1), 2);
        assert_eq!(zigzag32(-2), 3);
    }

    #[test]
    fn rice_roundtrip_property_varied_residuals() {
        // Deterministic "property" cases covering small/large/signed residuals.
        let cases: Vec<Vec<i32>> = vec![
            vec![],
            vec![0],
            vec![0, 1, -1, 2, -3, 100, -200],
            (0..256).map(|i| ((i * 17) % 63) as i32 - 31).collect(),
            (0..1024)
                .map(|i| {
                    let u = (i as u32).wrapping_mul(1103515245).wrapping_add(12345);
                    ((u >> 16) as i16 as i32) / 4
                })
                .collect(),
        ];
        for res in cases {
            for &parts in &[1usize, PARTITIONS] {
                let ks = if parts <= 1 {
                    vec![estimate_k(&res)]
                } else {
                    estimate_k_partitioned(&res, parts, escape_bits_for_residuals(&res))
                };
                let enc = rice_encode_partitioned(&res, &ks);
                let dec = rice_decode_partitioned(&enc, &ks, res.len()).expect("decode");
                assert_eq!(dec, res, "parts={parts} ks={ks:?}");
            }
        }
    }

    #[test]
    fn garbage_input_never_panics() {
        let garbage: &[&[u8]] = &[
            &[],
            &[0xff, 0xff, 0xff, 0xff],
            &[0x00],
            &[0x01, 0x02, 0x03],
            &[0xff; 64],
            &[0x00; 64],
        ];
        for g in garbage {
            for k in 0..=MAX_K {
                let _ = rice_decode(g, k, 16);
                let ks = vec![k; PARTITIONS];
                let _ = rice_decode_partitioned(g, &ks, 64);
            }
        }
    }

    #[test]
    fn escaped_rice_roundtrips_i32_extremes() {
        let values = vec![0, 1, -1, 65535, -65535, i32::MAX, i32::MIN];
        let ks = vec![4];
        let encoded = rice_encode_partitioned_escape(&values, &ks, 32);
        let decoded = rice_decode_partitioned_escape(&encoded, &ks, values.len(), 32).unwrap();
        assert_eq!(decoded, values);
        assert!(encoded.len() < 128, "escape must bound huge unary runs");
    }

    #[test]
    fn escaped_rice_roundtrips_with_sixteen_bit_payloads() {
        let values = vec![i16::MIN as i32, -123, 0, 123, i16::MAX as i32];
        let ks = vec![0, 2];
        let encoded = rice_encode_partitioned_escape(&values, &ks, 16);
        let decoded = rice_decode_partitioned_escape(&encoded, &ks, values.len(), 16).unwrap();
        assert_eq!(decoded, values);
        assert_eq!(
            encoded.len(),
            rice_estimate_bits_partitioned_escape(&values, &ks, 16).div_ceil(8)
        );
    }

    #[test]
    fn partition_ks_pack_high_nibble_first() {
        let packed = pack_partition_ks(&[1, 2, 3, 14]);
        assert_eq!(packed, vec![0x12, 0x3e]);
        assert_eq!(unpack_partition_ks(&packed, 4).unwrap(), vec![1, 2, 3, 14]);
    }

    #[test]
    fn escaped_cost_matches_encoded_noise_size() {
        let values: Vec<i32> = (0..4096)
            .map(|i| {
                let bits = (i as u32)
                    .wrapping_mul(1_664_525)
                    .wrapping_add(1_013_904_223);
                bits as i32
            })
            .collect();
        let escape_bits = escape_bits_for_residuals(&values);
        let ks = best_partitioned_ks(&values, escape_bits);
        let estimated = rice_estimate_bits_partitioned_escape(&values, &ks, escape_bits);
        let encoded = rice_encode_partitioned_escape(&values, &ks, escape_bits);
        assert_eq!(encoded.len(), estimated.div_ceil(8));
    }

    #[test]
    fn encoder_considers_sixteen_partitions() {
        assert!(PARTITION_CANDIDATES.contains(&16));
    }

    #[test]
    fn partitioned_escape_handles_short_blocks_with_16_parts() {
        let res: Vec<i32> = (0..115).map(|i| (i % 17) as i32 - 8).collect();
        let escape_bits = escape_bits_for_residuals(&res);
        let ks = best_partitioned_ks(&res, escape_bits);
        assert!(!ks.is_empty());
        let enc = rice_encode_partitioned_escape(&res, &ks, escape_bits);
        let dec =
            rice_decode_partitioned_escape(&enc, &ks, res.len(), escape_bits).expect("decode");
        assert_eq!(dec, res);
        let _ = rice_estimate_bits_partitioned_escape(&res, &vec![0u8; 16], escape_bits);
    }

    #[test]
    fn escaped_partition_prefix_cost_matches_full_cost_at_bounds() {
        let residuals = vec![0, 1, -1, 40_000, -40_000, 3, -2, 1];
        let ks = vec![1, 4];
        assert_eq!(
            rice_estimate_prefix_bits_partitioned_escape(&residuals, &ks, 0, 17),
            0
        );
        assert_eq!(
            rice_estimate_prefix_bits_partitioned_escape(&residuals, &ks, residuals.len(), 17),
            rice_estimate_bits_partitioned_escape(&residuals, &ks, 17)
        );
    }
}
