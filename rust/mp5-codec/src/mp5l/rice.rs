//! Rice coding for MP5-L residuals (single-k and partitioned).

use super::bitwriter::{BitReader, BitWriter};

pub const MAX_K: u8 = 14;
pub const PARTITIONS: usize = 4;

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

pub fn estimate_k_partitioned(residuals: &[i32], parts: usize) -> Vec<u8> {
    if parts <= 1 {
        return vec![estimate_k(residuals)];
    }
    let chunk = (residuals.len() + parts - 1) / parts;
    (0..parts)
        .map(|p| {
            let start = p * chunk;
            let end = (start + chunk).min(residuals.len());
            if start >= end {
                0
            } else {
                estimate_k(&residuals[start..end])
            }
        })
        .collect()
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

/// Standard signed zigzag (arithmetic right-shift). Must match block.rs.
fn zigzag32(n: i32) -> u32 {
    ((n << 1) ^ (n >> 31)) as u32
}

fn unzigzag32(n: u32) -> i32 {
    ((n >> 1) as i32) ^ (-((n & 1) as i32))
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
                    estimate_k_partitioned(&res, parts)
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
}
