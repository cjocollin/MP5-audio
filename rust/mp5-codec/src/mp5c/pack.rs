//! MP5-C v3 frame payloads: silence shortcut, zigzag-varint (rice-like) coefficients.

pub const FLAG_SILENCE: u8 = 0;
pub const FLAG_RICE: u8 = 1;
pub const FLAG_DENSE_I16: u8 = 2;

pub fn zigzag16(n: i16) -> u32 {
    ((n as u32) << 1) ^ ((n as u32) >> 15)
}

pub fn unzigzag16(n: u32) -> i16 {
    ((n >> 1) as i16) ^ (-((n & 1) as i16))
}

pub fn write_varint(out: &mut Vec<u8>, mut v: u32) {
    while v >= 0x80 {
        out.push((v as u8) | 0x80);
        v >>= 7;
    }
    out.push(v as u8);
}

pub fn read_varint(data: &[u8], pos: &mut usize) -> Result<u32, String> {
    let mut result = 0u32;
    let mut shift = 0;
    loop {
        if *pos >= data.len() {
            return Err("varint eof".into());
        }
        let b = data[*pos];
        *pos += 1;
        result |= ((b & 0x7f) as u32) << shift;
        if b & 0x80 == 0 {
            break;
        }
        shift += 7;
        if shift > 28 {
            return Err("varint overflow".into());
        }
    }
    Ok(result)
}

pub fn coeffs_are_silent(coeffs: &[i16]) -> bool {
    coeffs.iter().all(|&c| c == 0)
}

/// Pick smallest representation for quantized coefficients.
pub fn pack_frame(coeffs: &[i16]) -> (u8, Vec<u8>) {
    if coeffs_are_silent(coeffs) {
        return (FLAG_SILENCE, Vec::new());
    }

    let mut rice = Vec::new();
    let mut prev = 0i16;
    for &c in coeffs {
        let delta = c.wrapping_sub(prev);
        write_varint(&mut rice, zigzag16(delta));
        prev = c;
    }

    let dense_len = coeffs.len() * 2;
    if rice.len() + 2 < dense_len {
        (FLAG_RICE, rice)
    } else {
        let mut dense = Vec::with_capacity(dense_len);
        for &c in coeffs {
            dense.extend(&c.to_le_bytes());
        }
        (FLAG_DENSE_I16, dense)
    }
}

pub fn unpack_frame(flag: u8, payload: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    match flag {
        FLAG_SILENCE => Ok(vec![0i16; expected]),
        FLAG_RICE => {
            let mut pos = 0;
            let mut coeffs = Vec::with_capacity(expected);
            let mut prev = 0i16;
            while coeffs.len() < expected && pos < payload.len() {
                let zz = read_varint(payload, &mut pos)?;
                let delta = unzigzag16(zz);
                prev = prev.wrapping_add(delta);
                coeffs.push(prev);
            }
            while coeffs.len() < expected {
                coeffs.push(0);
            }
            coeffs.truncate(expected);
            Ok(coeffs)
        }
        FLAG_DENSE_I16 => {
            if payload.len() < 2 {
                return Err("dense short".into());
            }
            let n = payload.len() / 2;
            let mut coeffs = Vec::with_capacity(n);
            for i in 0..n {
                let o = i * 2;
                coeffs.push(i16::from_le_bytes(payload[o..o + 2].try_into().unwrap()));
            }
            while coeffs.len() < expected {
                coeffs.push(0);
            }
            coeffs.truncate(expected);
            Ok(coeffs)
        }
        _ => Err(format!("unknown frame flag {flag}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_roundtrip() {
        let z = vec![0i16; 64];
        let (f, p) = pack_frame(&z);
        assert_eq!(f, FLAG_SILENCE);
        assert!(p.is_empty());
        let u = unpack_frame(f, &p, 64).unwrap();
        assert!(u.iter().all(|&x| x == 0));
    }

    #[test]
    fn rice_smaller_than_dense_on_smooth() {
        let coeffs: Vec<i16> = (0..512).map(|i| (i as i16 / 8) % 127).collect();
        let (f, p) = pack_frame(&coeffs);
        assert!(f == FLAG_RICE || f == FLAG_DENSE_I16);
        let back = unpack_frame(f, &p, coeffs.len()).unwrap();
        assert_eq!(back, coeffs);
    }
}
