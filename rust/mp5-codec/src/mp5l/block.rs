//! MP5-L block payloads (v3): silence, const, LPC+varint residuals, raw.

use super::predict::{best_order, reconstruct, residuals, MAX_ORDER};

fn delta_residuals(samples: &[i16]) -> Vec<i32> {
    let mut out = Vec::with_capacity(samples.len());
    let mut prev = 0i16;
    for &s in samples {
        out.push(s as i32 - prev as i32);
        prev = s;
    }
    out
}

fn reconstruct_delta(res: &[i32]) -> Vec<i16> {
    let mut out = Vec::with_capacity(res.len());
    let mut prev = 0i32;
    for &r in res {
        prev += r;
        out.push(prev as i16);
    }
    out
}

fn encode_delta_payload(samples: &[i16]) -> Vec<u8> {
    let res = delta_residuals(samples);
    let mut payload = Vec::new();
    payload.extend(&(res.len() as u32).to_le_bytes());
    for &r in &res {
        write_varint(&mut payload, zigzag32(r));
    }
    payload
}

fn decode_delta_payload(payload: &[u8], len: usize) -> Result<Vec<i16>, String> {
    if payload.len() < 4 {
        return Err("delta block short".into());
    }
    let count = u32::from_le_bytes(payload[0..4].try_into().unwrap()) as usize;
    if count != len {
        return Err(format!("delta count {count} != len {len}"));
    }
    let mut pos = 4usize;
    let mut res = Vec::with_capacity(count);
    while res.len() < count {
        let zz = read_varint(payload, &mut pos)?;
        res.push(unzigzag32(zz));
    }
    Ok(reconstruct_delta(&res))
}
use super::varint::{read_varint, write_varint};

pub const FLAG_RAW: u8 = 0;
pub const FLAG_SILENCE: u8 = 1;
pub const FLAG_CONST: u8 = 2;
pub const FLAG_RICE: u8 = 3;
pub const FLAG_DELTA: u8 = 4;
pub const FLAG_STEREO_MS: u8 = 5;

const BLOCK_HDR: usize = 13;

fn zigzag32(n: i32) -> u32 {
    ((n << 1) ^ (n >> 31)) as u32
}

fn unzigzag32(n: u32) -> i32 {
    ((n >> 1) as i32) ^ (-((n & 1) as i32))
}

fn payload_roundtrips(flag: u8, payload: &[u8], samples: &[i16]) -> bool {
    decode_block_payload(flag, payload, samples.len())
        .map(|decoded| decoded == samples)
        .unwrap_or(false)
}

pub fn encode_block_payload(samples: &[i16]) -> (u8, Vec<u8>) {
    if samples.is_empty() {
        return (FLAG_SILENCE, Vec::new());
    }
    if samples.iter().all(|&s| s == 0) {
        return (FLAG_SILENCE, Vec::new());
    }
    if let Some(&v) = samples.first() {
        if samples.iter().all(|&s| s == v) {
            return (FLAG_CONST, v.to_le_bytes().to_vec());
        }
    }

    let mut best_flag = FLAG_RAW;
    let mut best_payload = raw_payload(samples);
    let mut best_len = BLOCK_HDR + best_payload.len();

    let delta_payload = encode_delta_payload(samples);
    let delta_total = BLOCK_HDR + delta_payload.len();
    if delta_total < best_len
        && payload_roundtrips(FLAG_DELTA, &delta_payload, samples)
    {
        best_len = delta_total;
        best_flag = FLAG_DELTA;
        best_payload = delta_payload;
    }

    let order = best_order(samples, MAX_ORDER as u8);
    let res = residuals(samples, order);
    let mut lpc_payload = Vec::new();
    lpc_payload.push(order);
    lpc_payload.extend(&(res.len() as u32).to_le_bytes());
    for &r in &res {
        write_varint(&mut lpc_payload, zigzag32(r));
    }
    let lpc_total = BLOCK_HDR + lpc_payload.len();
    if lpc_total < best_len && payload_roundtrips(FLAG_RICE, &lpc_payload, samples) {
        best_len = lpc_total;
        best_flag = FLAG_RICE;
        best_payload = lpc_payload;
    }

    (best_flag, best_payload)
}

pub fn encode_stereo_ms_payload(mid: &[i16], side: &[i16]) -> Vec<u8> {
    let (f1, p1) = encode_block_payload(mid);
    let (f2, p2) = encode_block_payload(side);
    let mut out = Vec::with_capacity(2 + p1.len() + 2 + p2.len());
    out.push(f1);
    out.extend(&(p1.len() as u32).to_le_bytes());
    out.extend_from_slice(&p1);
    out.push(f2);
    out.extend(&(p2.len() as u32).to_le_bytes());
    out.extend_from_slice(&p2);
    out
}

pub fn decode_stereo_ms_payload(payload: &[u8], len: usize) -> Result<(Vec<i16>, Vec<i16>), String> {
    let mut pos = 0usize;
    let (mid, pos) = read_sub_block(payload, pos, len)?;
    let (side, _pos) = read_sub_block(payload, pos, len)?;
    Ok(super::stereo::decode_ms(&mid, &side))
}

fn read_sub_block(data: &[u8], pos: usize, len: usize) -> Result<(Vec<i16>, usize), String> {
    if pos + 5 > data.len() {
        return Err("stereo sub-block short".into());
    }
    let flag = data[pos];
    let plen = u32::from_le_bytes(data[pos + 1..pos + 5].try_into().unwrap()) as usize;
    let start = pos + 5;
    if start + plen > data.len() {
        return Err("stereo sub payload short".into());
    }
    let samples = decode_block_payload(flag, &data[start..start + plen], len)?;
    Ok((samples, start + plen))
}

pub fn decode_block_payload(flag: u8, payload: &[u8], len: usize) -> Result<Vec<i16>, String> {
    match flag {
        FLAG_SILENCE => Ok(vec![0i16; len]),
        FLAG_CONST => {
            if payload.len() < 2 {
                return Err("const block short".into());
            }
            let v = i16::from_le_bytes(payload[0..2].try_into().unwrap());
            Ok(vec![v; len])
        }
        FLAG_RICE => {
            if payload.len() < 5 {
                return Err("rice block short".into());
            }
            let order = payload[0];
            let count = u32::from_le_bytes(payload[1..5].try_into().unwrap()) as usize;
            if count != len {
                return Err(format!("rice residual count {count} != block len {len}"));
            }
            let mut pos = 5usize;
            let mut res = Vec::with_capacity(count);
            while res.len() < count {
                let zz = read_varint(payload, &mut pos)?;
                res.push(unzigzag32(zz));
            }
            Ok(reconstruct(&res, order))
        }
        FLAG_DELTA => decode_delta_payload(payload, len),
        FLAG_RAW => decode_raw_payload(payload, len),
        FLAG_STEREO_MS => {
            let (left, right) = decode_stereo_ms_payload(payload, len)?;
            let mut interleaved = Vec::with_capacity(left.len() * 2);
            for i in 0..left.len() {
                interleaved.push(left[i]);
                interleaved.push(right.get(i).copied().unwrap_or(0));
            }
            Ok(interleaved)
        }
        _ => Err(format!("unknown MP5-L block flag {flag}")),
    }
}

fn raw_payload(samples: &[i16]) -> Vec<u8> {
    let mut out = Vec::with_capacity(samples.len() * 2);
    for &s in samples {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

fn decode_raw_payload(payload: &[u8], len: usize) -> Result<Vec<i16>, String> {
    if payload.len() < len * 2 {
        return Err("raw block short".into());
    }
    let mut out = Vec::with_capacity(len);
    for i in 0..len {
        out.push(i16::from_le_bytes(payload[i * 2..i * 2 + 2].try_into().unwrap()));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lpc_varint_roundtrip_on_residuals() {
        let samples: Vec<i16> = (0..4096)
            .map(|i| (((i as u32).wrapping_mul(1103515245).wrapping_add(12345)) >> 17) as i16)
            .collect();
        for order in 0..=4u8 {
            let res = residuals(&samples, order);
            assert_eq!(
                reconstruct(&res, order),
                samples,
                "reconstruct order {order}"
            );
            let mut payload = Vec::new();
            payload.push(order);
            payload.extend(&(res.len() as u32).to_le_bytes());
            for &r in &res {
                write_varint(&mut payload, zigzag32(r));
            }
            let mut pos = 5usize;
            for (j, &expect) in res.iter().enumerate() {
                let zz = read_varint(&payload, &mut pos).expect("varint");
                assert_eq!(unzigzag32(zz), expect, "residual {j} order {order}");
            }
            assert_eq!(pos, payload.len(), "trailing bytes order {order}");
            assert!(
                payload_roundtrips(FLAG_RICE, &payload, &samples),
                "payload roundtrip failed order {order}"
            );
        }
    }

    #[test]
    fn silence_and_sine_roundtrip() {
        let silence = vec![0i16; 100];
        let (f, p) = encode_block_payload(&silence);
        assert_eq!(f, FLAG_SILENCE);
        assert_eq!(decode_block_payload(f, &p, silence.len()).unwrap(), silence);

        let sine: Vec<i16> = (0..4096)
            .map(|i| ((i as f32 * 0.02).sin() * 12000.0) as i16)
            .collect();
        let (f2, p2) = encode_block_payload(&sine);
        let back = decode_block_payload(f2, &p2, sine.len()).unwrap();
        assert_eq!(sine, back);
    }
}
