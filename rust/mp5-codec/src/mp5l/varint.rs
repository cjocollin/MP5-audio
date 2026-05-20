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
        if shift >= 32 {
            return Err("varint overflow".into());
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(v: u32) {
        let mut buf = Vec::new();
        write_varint(&mut buf, v);
        let mut pos = 0;
        assert_eq!(read_varint(&buf, &mut pos).unwrap(), v);
    }

    #[test]
    fn full_u32_range_smoke() {
        for v in [0u32, 127, 128, 16383, 16384, 1_048_575, 1_048_576, u32::MAX] {
            roundtrip(v);
        }
    }
}
