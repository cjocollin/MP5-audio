//! Fixed and LPC predictors for MP5-L lossless blocks.

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
        _ => lpc_predict(samples, i, order),
    }
}

fn lpc_predict(samples: &[i16], i: usize, order: usize) -> i32 {
    let coeffs = lpc_coefficients(&samples[..i], order.min(i));
    let mut pred = 0i64;
    for (j, &c) in coeffs.iter().enumerate() {
        pred += c as i64 * samples[i - 1 - j] as i64;
    }
    (pred >> 15).clamp(-32768, 32767) as i32
}

/// Levinson-Durbin; coefficients scaled to Q15.
fn lpc_coefficients(history: &[i16], order: usize) -> Vec<i32> {
    if order == 0 || history.is_empty() {
        return vec![];
    }
    let n = history.len();
    let mut r = vec![0i64; order + 1];
    for lag in 0..=order {
        let mut acc = 0i64;
        for i in lag..n {
            acc += history[i] as i64 * history[i - lag] as i64;
        }
        r[lag] = acc;
    }
    if r[0] == 0 {
        return vec![0; order];
    }
    let mut a = vec![0i64; order];
    let mut e = r[0];
    for i in 0..order {
        let mut lambda = 0i64;
        for j in 0..i {
            lambda += a[j] * r[i - j];
        }
        lambda = (r[i + 1] - lambda) * (1i64 << 15) / e.max(1);
        a[i] = lambda;
        for j in 0..i / 2 {
            let tmp = a[j];
            a[j] = a[j] - ((lambda * a[i - 1 - j]) >> 15);
            a[i - 1 - j] = a[i - 1 - j] - ((lambda * tmp) >> 15);
        }
        e = (e * (1i64 << 15) - ((lambda * lambda) >> 15) * e) >> 15;
        e = e.max(1);
    }
    a.iter().map(|&c| c.clamp(-32768, 32767) as i32).collect()
}

pub fn best_order(samples: &[i16], max_order: u8) -> u8 {
    if samples.is_empty() {
        return 0;
    }
    let mut best = 0u8;
    let mut best_bits = usize::MAX;
    let max = max_order.min(MAX_ORDER as u8).min(samples.len().saturating_sub(1) as u8);
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
        for order in 0..=4u8 {
            let res = residuals(&samples, order);
            let back = reconstruct(&res, order);
            assert_eq!(samples, back, "order {order}");
        }
    }
}
