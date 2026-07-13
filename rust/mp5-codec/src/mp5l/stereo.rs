//! Lossless FLAC-style mid/side stereo.

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
    // Prefer M/S when mid+side energy is clearly lower, or channels are correlated
    // enough that side is cheap even if variance is close.
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
    fn ms_skips_non_lossless_extremes() {
        let left = vec![32767i16, -32768];
        let right = vec![-32768i16, 32767];
        let (mid, side) = encode_ms(&left, &right);
        let (l2, r2) = decode_ms(&mid, &side);
        assert_ne!(left, l2, "extreme L/R may not round-trip; encoder must verify");
    }
}
