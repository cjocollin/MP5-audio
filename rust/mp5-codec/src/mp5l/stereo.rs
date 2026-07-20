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
    let side = (0..n).map(|i| left[i] as i32 - right[i] as i32).collect();
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
    let side = (0..n).map(|i| left[i] as i32 - right[i] as i32).collect();
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
}
