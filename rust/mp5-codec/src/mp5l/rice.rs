//! Rice coding for MP5-L residuals (single-k and partitioned).

use super::bitwriter::{BitReader, BitWriter};

pub const MAX_K: u8 = 14;
pub const PARTITIONS: usize = 4;

pub fn estimate_k(residuals: &[i32]) -> u8 {
    if residuals.is_empty() {
        return 0;
    }
    let avg = residuals.iter().map(|r| r.unsigned_abs()).sum::<u32>() / residuals.len() as u32;
    if avg == 0 {
        return 0;
    }
    let mut k = 0u8;
    while (1u32 << (k + 1)) <= avg && k < MAX_K {
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
        let u = zigzag32(r) as u32;
        let q = if k == 0 { u } else { u >> k };
        let rem_bits = if k == 0 { 0 } else { k as usize };
        bits += q as usize + 1 + rem_bits;
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

fn zigzag32(n: i32) -> u32 {
    ((n as u32) << 1) ^ ((n as u32) >> 31)
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
        for &r in &residuals[start..end] {
            write_rice_sample(&mut w, r, k);
        }
    }
    w.finish()
}

fn write_rice_sample(w: &mut BitWriter, r: i32, k: u8) {
    let u = zigzag32(r) as u32;
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
    for (p, &k) in ks.iter().enumerate() {
        let n = if p + 1 == parts {
            count - out.len()
        } else {
            chunk
        };
        for _ in 0..n {
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
    while out.len() < count {
        out.push(0);
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
}
