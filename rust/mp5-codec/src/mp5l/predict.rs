//! Fixed and LPC predictors for MP5-L lossless blocks.

/// Max fixed-predictor order used by the encoder. Higher LPC orders need a
/// sturdier Levinson path; keep at 4 so bit-exact gates stay green.
pub const MAX_ORDER: usize = 4;

pub fn residuals(samples: &[i16], order: u8) -> Vec<i32> {
    let o = order as usize;
    let mut out = Vec::with_capacity(samples.len());
    for i in 0..samples.len() {
        let pred = predict_sample(samples, i, o);
        out.push(samples[i] as i32 - pred);
    }
    out
}

pub fn reconstruct(residuals: &[i32], order: u8) -> Vec<i16> {
    let o = order as usize;
    let mut samples = Vec::with_capacity(residuals.len());
    for (i, &r) in residuals.iter().enumerate() {
        let pred = if i == 0 {
            0i32
        } else {
            predict_sample_from_vec(&samples, i, o)
        };
        samples.push((pred + r) as i16);
    }
    samples
}

fn predict_sample(samples: &[i16], i: usize, order: usize) -> i32 {
    if i == 0 || order == 0 {
        return 0;
    }
    let effective = order.min(i);
    predict_sample_from_slice(samples, i, effective)
}

fn predict_sample_from_vec(samples: &[i16], i: usize, order: usize) -> i32 {
    let effective = order.min(i);
    predict_sample_from_slice(samples, i, effective)
}

fn predict_sample_from_slice(samples: &[i16], i: usize, order: usize) -> i32 {
    match order {
        0 => 0,
        1 => samples[i - 1] as i32,
        2 => {
            let s1 = samples[i - 1] as i32;
            let s2 = samples[i - 2] as i32;
            2 * s1 - s2
        }
        3 => {
            let s1 = samples[i - 1] as i32;
            let s2 = samples[i - 2] as i32;
            let s3 = samples[i - 3] as i32;
            3 * s1 - 3 * s2 + s3
        }
        4 => {
            let s1 = samples[i - 1] as i32;
            let s2 = samples[i - 2] as i32;
            let s3 = samples[i - 3] as i32;
            let s4 = samples[i - 4] as i32;
            4 * s1 - 6 * s2 + 4 * s3 - s4
        }
        _ => unreachable!("fixed predictor order must be 0..=4"),
    }
}

pub fn best_order(samples: &[i16], max_order: u8) -> u8 {
    if samples.is_empty() {
        return 0;
    }
    let mut best = 0u8;
    let mut best_bits = usize::MAX;
    let max = max_order
        .min(MAX_ORDER as u8)
        .min(samples.len().saturating_sub(1) as u8);
    for order in 0..=max {
        let res = residuals(samples, order);
        let bits: usize = res
            .iter()
            .map(|&r| {
                let zz = ((r as u32) << 1) ^ ((r as u32) >> 31);
                varint_len(zz)
            })
            .sum();
        let total = 1 + bits;
        if total < best_bits {
            best_bits = total;
            best = order;
        }
    }
    best
}

/// Choose predictor order by estimated **bit-packed Rice** cost (not varint bytes).
pub fn best_order_rice(samples: &[i16], max_order: u8) -> u8 {
    use super::rice::{best_partitioned_ks_unescaped, rice_estimate_bits_partitioned};

    if samples.is_empty() {
        return 0;
    }
    let mut best = 0u8;
    let mut best_bits = usize::MAX;
    let max = max_order
        .min(MAX_ORDER as u8)
        .min(samples.len().saturating_sub(1) as u8);
    for order in 0..=max {
        let res = residuals(samples, order);
        let ks = best_partitioned_ks_unescaped(&res);
        // 1 byte order + 4 count + 1 parts + ks + rice bits
        let total = 6 + ks.len() + rice_estimate_bits_partitioned(&res, &ks);
        if total < best_bits {
            best_bits = total;
            best = order;
        }
    }
    best
}

fn varint_len(mut v: u32) -> usize {
    let mut n = 1;
    while v >= 0x80 {
        v >>= 7;
        n += 1;
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_orders_roundtrip() {
        let samples: Vec<i16> = (0..512)
            .map(|i| ((i as f32 * 0.03).sin() * 20000.0) as i16)
            .collect();
        for order in 0..=MAX_ORDER as u8 {
            let res = residuals(&samples, order);
            let back = reconstruct(&res, order);
            assert_eq!(samples, back, "order {order}");
        }
    }

    #[test]
    fn best_order_stays_in_range_and_roundtrips() {
        let samples: Vec<i16> = (0..256)
            .map(|i| {
                let t = i as f64 / 256.0;
                ((t * t * t * 12000.0 - t * t * 4000.0) as i16).saturating_add(100)
            })
            .collect();
        let order = best_order(&samples, MAX_ORDER as u8);
        assert!(order <= MAX_ORDER as u8);
        let res = residuals(&samples, order);
        assert_eq!(reconstruct(&res, order), samples);
    }
}
