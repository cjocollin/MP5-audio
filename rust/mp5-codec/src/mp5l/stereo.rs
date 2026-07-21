//! Lossless FLAC-style stereo modes: independent, mid/side, left-side, right-side.

pub fn encode_ms(left: &[i16], right: &[i16]) -> (Vec<i16>, Vec<i16>) {
    let n = left.len().min(right.len());
    let mut mid = Vec::with_capacity(n);
    let mut side = Vec::with_capacity(n);
    for i in 0..n {
        let l = left[i] as i32;
        let r = right[i] as i32;
        mid.push(((l + r) >> 1) as i16);
        side.push((l - r) as i16);
    }
    (mid, side)
}

/// FLAC-compatible lossless mid/side decode: `left = mid + (side>>1)`, `right = left - side`.
pub fn decode_ms(mid: &[i16], side: &[i16]) -> (Vec<i16>, Vec<i16>) {
    let n = mid.len().min(side.len());
    let mut left = Vec::with_capacity(n);
    let mut right = Vec::with_capacity(n);
    for i in 0..n {
        let m = mid[i] as i32;
        let s = side[i] as i32;
        let l = (m + (s >> 1)) as i16;
        let r = (l as i32 - s) as i16;
        left.push(l);
        right.push(r);
    }
    (left, right)
}

/// Left-side: keep left; side = left - right. Reconstruct: right = left - side.
pub fn encode_ls(left: &[i16], right: &[i16]) -> (Vec<i16>, Vec<i16>) {
    let n = left.len().min(right.len());
    let mut side = Vec::with_capacity(n);
    for i in 0..n {
        side.push((left[i] as i32 - right[i] as i32) as i16);
    }
    (left[..n].to_vec(), side)
}

pub fn decode_ls(left: &[i16], side: &[i16]) -> (Vec<i16>, Vec<i16>) {
    let n = left.len().min(side.len());
    let mut right = Vec::with_capacity(n);
    for i in 0..n {
        right.push((left[i] as i32 - side[i] as i32) as i16);
    }
    (left[..n].to_vec(), right)
}

/// Right-side: keep right; side = left - right. Reconstruct: left = right + side.
pub fn encode_rs(left: &[i16], right: &[i16]) -> (Vec<i16>, Vec<i16>) {
    let n = left.len().min(right.len());
    let mut side = Vec::with_capacity(n);
    for i in 0..n {
        side.push((left[i] as i32 - right[i] as i32) as i16);
    }
    (right[..n].to_vec(), side)
}

pub fn decode_rs(right: &[i16], side: &[i16]) -> (Vec<i16>, Vec<i16>) {
    let n = right.len().min(side.len());
    let mut left = Vec::with_capacity(n);
    for i in 0..n {
        left.push((right[i] as i32 + side[i] as i32) as i16);
    }
    (left, right[..n].to_vec())
}

/// Width-safe mid/side transform. The side needs 17 signed bits for i16 PCM.
pub fn encode_ms_i32(left: &[i16], right: &[i16]) -> (Vec<i16>, Vec<i32>) {
    let n = left.len().min(right.len());
    let mut mid = Vec::with_capacity(n);
    let mut side = Vec::with_capacity(n);
    for i in 0..n {
        let l = left[i] as i32;
        let r = right[i] as i32;
        mid.push(((l + r) >> 1) as i16);
        side.push(l - r);
    }
    (mid, side)
}

pub fn encode_side_i32(left: &[i16], right: &[i16]) -> Vec<i32> {
    left.iter()
        .zip(right)
        .map(|(&left, &right)| left as i32 - right as i32)
        .collect()
}

pub fn decode_ms_i32(mid: &[i16], side: &[i32]) -> Result<(Vec<i16>, Vec<i16>), String> {
    let n = mid.len().min(side.len());
    let mut left = Vec::with_capacity(n);
    let mut right = Vec::with_capacity(n);
    for i in 0..n {
        // `(l + r) >> 1` rounds toward negative infinity. The side parity
        // carries the discarded low bit needed to recover the exact left.
        let side_value = side[i] as i64;
        let l = mid[i] as i64 + (side_value >> 1) + (side_value & 1);
        let r = l - side_value;
        if l < i16::MIN as i64 || l > i16::MAX as i64 || r < i16::MIN as i64 || r > i16::MAX as i64
        {
            return Err("mid/side reconstruction exceeds i16".into());
        }
        left.push(l as i16);
        right.push(r as i16);
    }
    Ok((left, right))
}

pub fn encode_ls_i32(left: &[i16], right: &[i16]) -> (Vec<i16>, Vec<i32>) {
    let n = left.len().min(right.len());
    let side = encode_side_i32(&left[..n], &right[..n]);
    (left[..n].to_vec(), side)
}

pub fn decode_ls_i32(left: &[i16], side: &[i32]) -> Result<(Vec<i16>, Vec<i16>), String> {
    let n = left.len().min(side.len());
    let mut right = Vec::with_capacity(n);
    for i in 0..n {
        let r = left[i] as i64 - side[i] as i64;
        if r < i16::MIN as i64 || r > i16::MAX as i64 {
            return Err("left/side reconstruction exceeds i16".into());
        }
        right.push(r as i16);
    }
    Ok((left[..n].to_vec(), right))
}

pub fn encode_rs_i32(left: &[i16], right: &[i16]) -> (Vec<i16>, Vec<i32>) {
    let n = left.len().min(right.len());
    let side = encode_side_i32(&left[..n], &right[..n]);
    (right[..n].to_vec(), side)
}

pub fn decode_rs_i32(right: &[i16], side: &[i32]) -> Result<(Vec<i16>, Vec<i16>), String> {
    let n = right.len().min(side.len());
    let mut left = Vec::with_capacity(n);
    for i in 0..n {
        let l = right[i] as i64 + side[i] as i64;
        if l < i16::MIN as i64 || l > i16::MAX as i64 {
            return Err("right/side reconstruction exceeds i16".into());
        }
        left.push(l as i16);
    }
    Ok((left, right[..n].to_vec()))
}

fn proxy_sample_bits(value: i64) -> usize {
    let magnitude = value.unsigned_abs();
    if magnitude == 0 {
        1
    } else {
        (u64::BITS - magnitude.leading_zeros()) as usize + 1
    }
}

/// Cheap split-ranking proxy. It samples fixed-predictor residual magnitudes
/// for independent L/R and width-safe M/S and returns the lower byte estimate.
///
/// This is deliberately not used for the final stereo mode decision.
pub fn stereo_split_proxy_bytes(left: &[i16], right: &[i16]) -> usize {
    let len = left.len().min(right.len());
    if len == 0 {
        return 0;
    }
    let stride = len.div_ceil(256).max(1);
    let mut independent_bits = 0usize;
    let mut ms_bits = 0usize;
    let mut previous_left = 0i64;
    let mut previous_right = 0i64;
    let mut previous_mid = 0i64;
    let mut previous_side = 0i64;
    let mut sampled = 0usize;
    for index in (0..len).step_by(stride) {
        let left_value = left[index] as i64;
        let right_value = right[index] as i64;
        let mid = (left_value + right_value) >> 1;
        let side = left_value - right_value;
        independent_bits = independent_bits
            .saturating_add(proxy_sample_bits(left_value - previous_left))
            .saturating_add(proxy_sample_bits(right_value - previous_right));
        ms_bits = ms_bits
            .saturating_add(proxy_sample_bits(mid - previous_mid))
            .saturating_add(proxy_sample_bits(side - previous_side));
        previous_left = left_value;
        previous_right = right_value;
        previous_mid = mid;
        previous_side = side;
        sampled += 1;
    }
    independent_bits
        .min(ms_bits)
        .saturating_mul(len)
        .div_ceil(sampled.max(1))
        .div_ceil(8)
}

/// Correlation gate for the expensive mid-channel encode. L/S and R/S remain
/// available because they reuse the already-encoded independent channels.
pub fn should_encode_mid(left: &[i16], right: &[i16]) -> bool {
    let len = left.len().min(right.len());
    if len < 2 {
        return false;
    }
    let stride = len.div_ceil(512).max(1);
    let mut count = 0i128;
    let mut sum_left = 0i128;
    let mut sum_right = 0i128;
    let mut sum_left_sq = 0i128;
    let mut sum_right_sq = 0i128;
    let mut sum_product = 0i128;
    for index in (0..len).step_by(stride) {
        let left_value = left[index] as i128;
        let right_value = right[index] as i128;
        count += 1;
        sum_left += left_value;
        sum_right += right_value;
        sum_left_sq += left_value * left_value;
        sum_right_sq += right_value * right_value;
        sum_product += left_value * right_value;
    }
    let covariance = count * sum_product - sum_left * sum_right;
    let left_energy = count * sum_left_sq - sum_left * sum_left;
    let right_energy = count * sum_right_sq - sum_right * sum_right;
    if left_energy <= 0 || right_energy <= 0 {
        return false;
    }
    // |correlation| >= 0.10 (was 0.20). Audiobook / near-mono speech is usually
    // well above this; the lower bar catches weakly correlated beds without
    // skipping a mid/side try that often wins on size.
    covariance * covariance * 100 >= left_energy * right_energy
}

pub fn ms_worth_try(left: &[i16], right: &[i16]) -> bool {
    let n = left.len().min(right.len());
    if n < 2 {
        return false;
    }
    let (mid, side) = encode_ms(left, right);
    let l_var = variance_i16(left);
    let r_var = variance_i16(right);
    let m_var = variance_i16(&mid);
    let s_var = variance_i16(&side);
    let lr = l_var + r_var;
    if lr == 0 {
        return false;
    }
    let energy_win = m_var + s_var < lr;
    let corr = correlation_i16(left, right);
    let corr_win = corr.abs() >= 0.35 && s_var < (r_var.max(l_var) / 2).max(1);
    energy_win || corr_win
}

fn correlation_i16(a: &[i16], b: &[i16]) -> f64 {
    let n = a.len().min(b.len()) as f64;
    if n < 2.0 {
        return 0.0;
    }
    let mean_a = a.iter().map(|&x| x as f64).sum::<f64>() / n;
    let mean_b = b.iter().map(|&x| x as f64).sum::<f64>() / n;
    let mut num = 0f64;
    let mut da = 0f64;
    let mut db = 0f64;
    for i in 0..a.len().min(b.len()) {
        let xa = a[i] as f64 - mean_a;
        let xb = b[i] as f64 - mean_b;
        num += xa * xb;
        da += xa * xa;
        db += xb * xb;
    }
    let den = (da * db).sqrt();
    if den < 1e-12 {
        0.0
    } else {
        (num / den).clamp(-1.0, 1.0)
    }
}

fn variance_i16(s: &[i16]) -> u64 {
    if s.is_empty() {
        return 0;
    }
    let mean = s.iter().map(|&x| x as i64).sum::<i64>() / s.len() as i64;
    s.iter()
        .map(|&x| {
            let d = x as i64 - mean;
            (d * d) as u64
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ms_lossless_roundtrip() {
        let left: Vec<i16> = (0..512).map(|i| (i * 3 % 4000) as i16 - 2000).collect();
        let right: Vec<i16> = (0..512).map(|i| (i * 7 % 3000) as i16 - 1500).collect();
        let (mid, side) = encode_ms(&left, &right);
        let (l2, r2) = decode_ms(&mid, &side);
        assert_eq!(left, l2);
        assert_eq!(right, r2);
    }

    #[test]
    fn ls_rs_lossless_roundtrip() {
        let left: Vec<i16> = (0..256).map(|i| (i * 5 % 2000) as i16 - 1000).collect();
        let right: Vec<i16> = (0..256).map(|i| (i * 3 % 1800) as i16 - 900).collect();
        let (l, s) = encode_ls(&left, &right);
        let (l2, r2) = decode_ls(&l, &s);
        assert_eq!(left, l2);
        assert_eq!(right, r2);
        let (r, s2) = encode_rs(&left, &right);
        let (l3, r3) = decode_rs(&r, &s2);
        assert_eq!(left, l3);
        assert_eq!(right, r3);
    }

    #[test]
    fn width_safe_stereo_roundtrips_extremes() {
        let left = vec![32767i16, -32768];
        let right = vec![-32768i16, 32767];
        let (mid, side) = encode_ms_i32(&left, &right);
        let (l2, r2) = decode_ms_i32(&mid, &side).unwrap();
        assert_eq!(left, l2);
        assert_eq!(right, r2);

        let (l, side) = encode_ls_i32(&left, &right);
        assert_eq!(
            decode_ls_i32(&l, &side).unwrap(),
            (left.clone(), right.clone())
        );
        let (r, side) = encode_rs_i32(&left, &right);
        assert_eq!(decode_rs_i32(&r, &side).unwrap(), (left, right));
    }

    #[test]
    fn correlation_gate_rejects_unrelated_channels() {
        let left: Vec<i16> = (0..1024)
            .map(|i| ((i as f64 * 0.017).sin() * 20_000.0) as i16)
            .collect();
        let related: Vec<i16> = left
            .iter()
            .map(|&sample| sample.saturating_sub(3))
            .collect();
        let unrelated: Vec<i16> = (0..1024)
            .map(|i| {
                let noise = (i as u32)
                    .wrapping_mul(1_664_525)
                    .wrapping_add(1_013_904_223);
                (noise >> 16) as i16
            })
            .collect();
        assert!(should_encode_mid(&left, &related));
        assert!(!should_encode_mid(&left, &unrelated));
    }
}
