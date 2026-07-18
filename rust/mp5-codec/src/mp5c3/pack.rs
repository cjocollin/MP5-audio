//! Lightweight entropy for MP5-C3 MDCT coefficients (lab-only).
//! Does not depend on or modify MP5-C v5.1 packers.

use crate::mp5l::rice::{estimate_k, rice_decode, rice_encode, MAX_K};

const FLAG_DENSE: u8 = 0;
const FLAG_RICE: u8 = 1;
const FLAG_ZERO: u8 = 2;

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

pub fn unpack_coeffs(data: &[u8]) -> Result<Vec<i16>, String> {
    if data.is_empty() {
        return Err("empty mp5c3 coeff pack".into());
    }
    let flag = data[0];
    match flag {
        FLAG_ZERO => {
            if data.len() < 5 {
                return Err("truncated zero pack".into());
            }
            let n = u32::from_le_bytes(data[1..5].try_into().unwrap()) as usize;
            Ok(vec![0i16; n])
        }
        FLAG_DENSE => {
            if data.len() < 5 {
                return Err("truncated dense pack".into());
            }
            let n = u32::from_le_bytes(data[1..5].try_into().unwrap()) as usize;
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
            let n = u32::from_le_bytes(data[2..6].try_into().unwrap()) as usize;
            let body_len = u32::from_le_bytes(data[6..10].try_into().unwrap()) as usize;
            if data.len() < 10 + body_len {
                return Err("truncated rice body".into());
            }
            let body = &data[10..10 + body_len];
            let vals = rice_decode(body, k, n)?;
            Ok(vals
                .into_iter()
                .map(|v| v.clamp(i16::MIN as i32, i16::MAX as i32) as i16)
                .collect())
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
        let back = unpack_coeffs(&packed).unwrap();
        assert_eq!(back, coeffs);
    }

    #[test]
    fn pack_zeros() {
        let coeffs = vec![0i16; 128];
        let packed = pack_coeffs(&coeffs);
        assert_eq!(packed[0], FLAG_ZERO);
        assert_eq!(unpack_coeffs(&packed).unwrap(), coeffs);
    }
}
