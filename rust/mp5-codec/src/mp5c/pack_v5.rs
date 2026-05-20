//! MP5-C v5 frame payloads — multi-mode entropy without changing quantization.

use super::pack::{
    coeffs_are_silent, read_varint, unzigzag16, write_varint, zigzag16, FLAG_DENSE_I16,
    FLAG_RICE, FLAG_SILENCE,
};

pub const FLAG_PRED2: u8 = 3;
pub const FLAG_BITPACK: u8 = 4;
pub const FLAG_GOLOMB: u8 = 5;
pub const FLAG_RLE_ZERO: u8 = 6;
pub const FLAG_SPLIT4: u8 = 7;

const SPLIT_CHUNK: usize = 512;
/// Must not collide with single-byte zigzag varints (0x00 = delta 0).
const RLE_ESC: u8 = 0xFE;

#[derive(Debug, Clone, Copy)]
pub struct PackCandidate {
    pub flag: u8,
    pub size: usize,
}

#[derive(Debug, Clone)]
pub struct FramePackAnalysis {
    pub chosen_flag: u8,
    pub chosen_size: usize,
    pub dense_size: usize,
    pub rice_size: usize,
    pub best_alt_flag: u8,
    pub best_alt_size: usize,
    pub savings_vs_dense: usize,
    pub would_dense_win: bool,
}

/// Pick smallest lossless representation for quantized coefficients (v5).
/// Fast encoder path — tries key modes; defers split4 unless near-dense size.
pub fn pack_frame(coeffs: &[i16]) -> (u8, Vec<u8>) {
    if coeffs_are_silent(coeffs) {
        return (FLAG_SILENCE, Vec::new());
    }
    let dense_size = coeffs.len() * 2;
    let mut best_flag = FLAG_DENSE_I16;
    let mut best = encode_dense(coeffs);
    let mut best_len = dense_size;

    for (flag, payload) in candidates_for_frame(coeffs) {
        if payload.len() < best_len {
            best_len = payload.len();
            best_flag = flag;
            best = payload;
        }
    }

    // Split only when no single-block mode beat dense (outlier-heavy frames).
    if coeffs.len() > SPLIT_CHUNK && best_len >= dense_size {
        let split = encode_split4(coeffs);
        if split.len() < best_len {
            best_flag = FLAG_SPLIT4;
            best = split;
        }
    }

    (best_flag, best)
}

/// Fast pack for v5.1 band sub-frames (no golomb/split4 — bands are smoother).
pub fn pack_frame_band(coeffs: &[i16]) -> (u8, Vec<u8>) {
    if coeffs_are_silent(coeffs) {
        return (FLAG_SILENCE, Vec::new());
    }
    let dense_size = coeffs.len() * 2;
    let mut best_flag = FLAG_DENSE_I16;
    let mut best = encode_dense(coeffs);
    let mut best_len = dense_size;

    let rice = encode_rice(coeffs);
    if rice.len() < best_len {
        best_len = rice.len();
        best_flag = FLAG_RICE;
        best = rice;
    }
    let pred2 = encode_pred2(coeffs);
    if pred2.len() < best_len {
        best_len = pred2.len();
        best_flag = FLAG_PRED2;
        best = pred2;
    }
    let rle = encode_rle_zero(coeffs);
    if rle.len() < best_len {
        best_flag = FLAG_RLE_ZERO;
        best = rle;
    }
    if let Some(bp) = encode_bitpack(coeffs) {
        if bp.len() < best_len {
            best_flag = FLAG_BITPACK;
            best = bp;
        }
    }
    (best_flag, best)
}

fn max_zigzag_delta(coeffs: &[i16]) -> u32 {
    let mut prev = 0i16;
    let mut m = 0u32;
    for &c in coeffs {
        m = m.max(zigzag16(c.wrapping_sub(prev)));
        prev = c;
    }
    m
}

fn golomb_ks_to_try(max_delta: u32) -> Vec<u8> {
    if max_delta == 0 {
        return vec![0];
    }
    if max_delta > 2_048 {
        return vec![];
    }
    let mut ks = vec![4u8, 8];
    if max_delta < 256 {
        ks.push(2);
    }
    if max_delta < 32 {
        ks.push(0);
    }
    ks
}

fn candidates_for_frame(coeffs: &[i16]) -> Vec<(u8, Vec<u8>)> {
    let dense_size = coeffs.len() * 2;
    let mut out = Vec::new();
    let rice = encode_rice(coeffs);
    if rice.len() < dense_size {
        out.push((FLAG_RICE, rice));
    }
    let pred2 = encode_pred2(coeffs);
    if pred2.len() < dense_size {
        out.push((FLAG_PRED2, pred2));
    }
  // Golomb only when residuals are small (avoids huge unary runs on dense masters).
    for k in golomb_ks_to_try(max_zigzag_delta(coeffs)) {
        let body = encode_golomb(coeffs, k);
        if body.len() + 1 < dense_size {
            let mut p = vec![k];
            p.extend(body);
            out.push((FLAG_GOLOMB, p));
        }
    }
    if let Some(bp) = encode_bitpack(coeffs) {
        if bp.len() < dense_size {
            out.push((FLAG_BITPACK, bp));
        }
    }
    let rle = encode_rle_zero(coeffs);
    if rle.len() < dense_size {
        out.push((FLAG_RLE_ZERO, rle));
    }
    out
}

pub fn pack_frame_with_flag(coeffs: &[i16], flag: u8) -> (u8, Vec<u8>) {
    if coeffs_are_silent(coeffs) {
        return (FLAG_SILENCE, Vec::new());
    }
    match flag {
        FLAG_SILENCE => (FLAG_SILENCE, Vec::new()),
        FLAG_RICE => (FLAG_RICE, encode_rice(coeffs)),
        FLAG_PRED2 => (FLAG_PRED2, encode_pred2(coeffs)),
        FLAG_BITPACK => (FLAG_BITPACK, encode_bitpack(coeffs).unwrap_or_else(|| encode_dense(coeffs))),
        FLAG_GOLOMB => {
            let (k, body) = encode_golomb_best(coeffs);
            let mut p = vec![k];
            p.extend(body);
            (FLAG_GOLOMB, p)
        }
        FLAG_RLE_ZERO => (FLAG_RLE_ZERO, encode_rle_zero(coeffs)),
        FLAG_SPLIT4 => (FLAG_SPLIT4, encode_split4(coeffs)),
        FLAG_DENSE_I16 | _ => {
            let p = encode_dense(coeffs);
            (FLAG_DENSE_I16, p)
        }
    }
}

pub fn analyze_frame(coeffs: &[i16]) -> FramePackAnalysis {
    analyze_frame_impl(coeffs, true)
}

/// Fast analysis for benchmarks (rice/pred2/dense only — no split/golomb sweep).
pub fn analyze_frame_quick(coeffs: &[i16]) -> FramePackAnalysis {
    let dense_size = coeffs.len() * 2;
    let rice_size = encode_rice(coeffs).len();
    let pred2_len = encode_pred2(coeffs).len();
    let mut candidates = [
        (FLAG_RICE, rice_size),
        (FLAG_PRED2, pred2_len),
        (FLAG_DENSE_I16, dense_size),
    ];
    candidates.sort_by_key(|(_, s)| *s);
    let (chosen_flag, chosen_size) = candidates[0];
    let (best_alt_flag, best_alt_size) = candidates
        .iter()
        .find(|(f, _)| *f != FLAG_DENSE_I16)
        .copied()
        .unwrap_or((FLAG_DENSE_I16, dense_size));
    FramePackAnalysis {
        chosen_flag,
        chosen_size,
        dense_size,
        rice_size,
        best_alt_flag,
        best_alt_size,
        savings_vs_dense: dense_size.saturating_sub(chosen_size),
        would_dense_win: chosen_flag == FLAG_DENSE_I16,
    }
}

fn analyze_frame_impl(coeffs: &[i16], allow_split: bool) -> FramePackAnalysis {
    let dense_size = coeffs.len() * 2;
    let rice_size = encode_rice(coeffs).len();
    let pred2_len = encode_pred2(coeffs).len();
    let golomb = encode_golomb_best(coeffs);
    let bitpack = encode_bitpack(coeffs);
    let rle_len = encode_rle_zero(coeffs).len();

    let mut candidates: Vec<(u8, usize)> = vec![
        (FLAG_RICE, rice_size),
        (FLAG_PRED2, pred2_len),
        (FLAG_GOLOMB, golomb.1.len() + 1),
        (FLAG_RLE_ZERO, rle_len),
        (FLAG_DENSE_I16, dense_size),
    ];
    if let Some(bp) = &bitpack {
        candidates.push((FLAG_BITPACK, bp.len() + 1));
    }
    let best_non_split = candidates.iter().map(|(_, s)| *s).min().unwrap_or(dense_size);
    if allow_split && coeffs.len() > SPLIT_CHUNK && best_non_split > dense_size * 95 / 100 {
        let split = encode_split4(coeffs);
        candidates.push((FLAG_SPLIT4, split.len()));
    }

    candidates.sort_by_key(|(_, s)| *s);
    let (chosen_flag, chosen_size) = candidates[0];
    let (best_alt_flag, best_alt_size) = candidates
        .iter()
        .find(|(f, _)| *f != FLAG_DENSE_I16)
        .copied()
        .unwrap_or((FLAG_DENSE_I16, dense_size));

    FramePackAnalysis {
        chosen_flag,
        chosen_size,
        dense_size,
        rice_size,
        best_alt_flag,
        best_alt_size,
        savings_vs_dense: dense_size.saturating_sub(chosen_size),
        would_dense_win: chosen_flag == FLAG_DENSE_I16,
    }
}

pub fn unpack_frame(flag: u8, payload: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    match flag {
        FLAG_SILENCE => Ok(vec![0i16; expected]),
        FLAG_RICE => decode_rice(payload, expected),
        FLAG_DENSE_I16 => decode_dense(payload, expected),
        FLAG_PRED2 => decode_pred2(payload, expected),
        FLAG_BITPACK => decode_bitpack(payload, expected),
        FLAG_GOLOMB => decode_golomb(payload, expected),
        FLAG_RLE_ZERO => decode_rle_zero(payload, expected),
        FLAG_SPLIT4 => decode_split4(payload, expected),
        f => Err(format!("unknown v5 frame flag {f}")),
    }
}

fn encode_rice(coeffs: &[i16]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut prev = 0i16;
    for &c in coeffs {
        write_varint(&mut out, zigzag16(c.wrapping_sub(prev)));
        prev = c;
    }
    out
}

fn decode_rice(payload: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    let mut pos = 0;
    let mut coeffs = Vec::with_capacity(expected);
    let mut prev = 0i16;
    while coeffs.len() < expected && pos < payload.len() {
        let zz = read_varint(payload, &mut pos)?;
        prev = prev.wrapping_add(unzigzag16(zz));
        coeffs.push(prev);
    }
    pad_coeffs(&mut coeffs, expected);
    Ok(coeffs)
}

fn encode_pred2(coeffs: &[i16]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut prev = 0i16;
    let mut prev2 = 0i16;
    for &c in coeffs {
        let pred = prev.wrapping_add(prev).wrapping_sub(prev2);
        write_varint(&mut out, zigzag16(c.wrapping_sub(pred)));
        prev2 = prev;
        prev = c;
    }
    out
}

fn decode_pred2(payload: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    let mut pos = 0;
    let mut coeffs = Vec::with_capacity(expected);
    let mut prev = 0i16;
    let mut prev2 = 0i16;
    while coeffs.len() < expected && pos < payload.len() {
        let zz = read_varint(payload, &mut pos)?;
        let pred = prev.wrapping_add(prev).wrapping_sub(prev2);
        let c = pred.wrapping_add(unzigzag16(zz));
        coeffs.push(c);
        prev2 = prev;
        prev = c;
    }
    pad_coeffs(&mut coeffs, expected);
    Ok(coeffs)
}

fn bits_needed(coeffs: &[i16]) -> Option<u8> {
    let max_abs = coeffs.iter().map(|c| c.unsigned_abs()).max().unwrap_or(0);
    if max_abs == 0 {
        return Some(0);
    }
    let mag = 32 - max_abs.leading_zeros();
    let with_sign = mag + 1;
    if with_sign >= 16 {
        return None;
    }
    Some(with_sign as u8)
}

fn coeffs_fit_bits(coeffs: &[i16], bits: u8) -> bool {
    let max_mag = ((1i32 << (bits - 1)) - 1) as i16;
    coeffs.iter().all(|&c| c.abs() <= max_mag)
}

fn encode_bitpack(coeffs: &[i16]) -> Option<Vec<u8>> {
    let bits = bits_needed(coeffs)?;
    if bits == 0 {
        return Some(Vec::new());
    }
    if bits >= 16 || !coeffs_fit_bits(coeffs, bits) {
        return None;
    }
    let mut out = vec![bits];
    let mut acc: u32 = 0;
    let mut nbits: u32 = 0;
    let mask = (1u32 << bits) - 1;
    for &c in coeffs {
        let v = encode_signed_bits(c, bits);
        acc = (acc << bits) | (v & mask);
        nbits += bits as u32;
        while nbits >= 8 {
            nbits -= 8;
            let shift = nbits;
            out.push((acc >> shift) as u8);
            acc &= (1 << shift) - 1;
        }
    }
    if nbits > 0 {
        out.push((acc << (8 - nbits)) as u8);
    }
    Some(out)
}

fn encode_signed_bits(c: i16, bits: u8) -> u32 {
    let max_mag = ((1i32 << (bits - 1)) - 1) as i16;
    let v = c.clamp(-max_mag, max_mag) as i32;
    if v >= 0 {
        (v as u32) << 1
    } else {
        ((-v) as u32) << 1 | 1
    }
}

fn decode_signed_bits(v: u32, bits: u8) -> i16 {
    let sign = (v & 1) != 0;
    let mag = (v >> 1) as i16;
    if sign {
        -mag
    } else {
        mag
    }
}

fn decode_bitpack(payload: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    if payload.is_empty() {
        return Ok(vec![0i16; expected]);
    }
    let bits = payload[0];
    if bits == 0 {
        return Ok(vec![0i16; expected]);
    }
    let mut coeffs = Vec::with_capacity(expected);
    let mut acc: u32 = 0;
    let mut nbits: u32 = 0;
    let mut pos = 1usize;
    let mask = (1u32 << bits) - 1;
    while coeffs.len() < expected {
        while nbits < bits as u32 && pos < payload.len() {
            acc = (acc << 8) | payload[pos] as u32;
            nbits += 8;
            pos += 1;
        }
        if nbits < bits as u32 {
            break;
        }
        nbits -= bits as u32;
        let v = (acc >> nbits) & mask;
        acc &= (1 << nbits) - 1;
        coeffs.push(decode_signed_bits(v, bits));
    }
    pad_coeffs(&mut coeffs, expected);
    Ok(coeffs)
}

fn encode_golomb_best(coeffs: &[i16]) -> (u8, Vec<u8>) {
    let ks = golomb_ks_to_try(max_zigzag_delta(coeffs));
    let mut best_k = 4u8;
    let mut best = encode_golomb(coeffs, 4);
    for k in ks {
        let g = encode_golomb(coeffs, k);
        if g.len() < best.len() {
            best = g;
            best_k = k;
        }
    }
    (best_k, best)
}

fn encode_golomb(coeffs: &[i16], k: u8) -> Vec<u8> {
    if max_zigzag_delta(coeffs) > 4096 {
        return vec![0xff; coeffs.len() * 2];
    }
    let limit = coeffs.len() * 2;
    let mut bits = BitWriter::new();
    let mut prev = 0i16;
    for &c in coeffs {
        let u = zigzag16(c.wrapping_sub(prev));
        prev = c;
        write_golomb_u(&mut bits, u, k);
        if bits.bytes.len() > limit {
            return vec![0xff; limit];
        }
    }
    bits.finish()
}

fn decode_golomb(payload: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    if payload.is_empty() {
        return Err("golomb empty".into());
    }
    let k = payload[0];
    let mut reader = BitReader::new(&payload[1..]);
    let mut coeffs = Vec::with_capacity(expected);
    let mut prev = 0i16;
    while coeffs.len() < expected {
        let u = read_golomb_u(&mut reader, k)?;
        prev = prev.wrapping_add(unzigzag16(u));
        coeffs.push(prev);
    }
    pad_coeffs(&mut coeffs, expected);
    Ok(coeffs)
}

fn write_golomb_u(bits: &mut BitWriter, v: u32, k: u8) {
    let mask = if k == 0 { 0 } else { (1u32 << k) - 1 };
    let q = v >> k;
    let r = v & mask;
    for _ in 0..q {
        bits.write_bit(true);
    }
    bits.write_bit(false);
    if k > 0 {
        bits.write_bits(r, k);
    }
}

fn read_golomb_u(reader: &mut BitReader, k: u8) -> Result<u32, String> {
    let mut q = 0u32;
    while reader.read_bit()? {
        q += 1;
        if q > 1_000_000 {
            return Err("golomb runaway".into());
        }
    }
    let r = if k == 0 {
        0
    } else {
        reader.read_bits(k)?
    };
    Ok((q << k) + r)
}

fn encode_rle_zero(coeffs: &[i16]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut prev = 0i16;
    let mut i = 0;
    while i < coeffs.len() {
        let d = coeffs[i].wrapping_sub(prev);
        if d == 0 {
            let mut run = 1usize;
            let mut j = i + 1;
            let mut p = coeffs[i];
            while j < coeffs.len() {
                let dj = coeffs[j].wrapping_sub(p);
                if dj != 0 {
                    break;
                }
                run += 1;
                p = coeffs[j];
                j += 1;
            }
            if run >= 3 {
                out.push(RLE_ESC);
                write_varint(&mut out, run as u32);
                i += run;
                prev = coeffs[i.saturating_sub(1)];
                continue;
            }
        }
        write_varint(&mut out, zigzag16(d));
        prev = coeffs[i];
        i += 1;
    }
    out
}

fn decode_rle_zero(payload: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    let mut pos = 0;
    let mut coeffs = Vec::with_capacity(expected);
    let mut prev = 0i16;
    while coeffs.len() < expected && pos < payload.len() {
        if payload[pos] == RLE_ESC {
            pos += 1;
            let run = read_varint(payload, &mut pos)? as usize;
            for _ in 0..run {
                coeffs.push(prev);
            }
            continue;
        }
        let zz = read_varint(payload, &mut pos)?;
        prev = prev.wrapping_add(unzigzag16(zz));
        coeffs.push(prev);
    }
    pad_coeffs(&mut coeffs, expected);
    Ok(coeffs)
}

fn encode_split4(coeffs: &[i16]) -> Vec<u8> {
    let mut out = Vec::new();
    for chunk in coeffs.chunks(SPLIT_CHUNK) {
        let (f, p) = pack_frame_inner(chunk);
        out.push(f);
        out.extend(&(p.len() as u16).to_le_bytes());
        out.extend(&p);
    }
    out
}

fn decode_split4(payload: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    let mut pos = 0;
    let mut coeffs = Vec::new();
    while pos < payload.len() && coeffs.len() < expected {
        if pos >= payload.len() {
            break;
        }
        let flag = payload[pos];
        pos += 1;
        if pos + 2 > payload.len() {
            return Err("split4 short header".into());
        }
        let len = u16::from_le_bytes(payload[pos..pos + 2].try_into().unwrap()) as usize;
        pos += 2;
        if pos + len > payload.len() {
            return Err("split4 truncated".into());
        }
        let sub = unpack_frame(flag, &payload[pos..pos + len], SPLIT_CHUNK.min(expected - coeffs.len()))?;
        pos += len;
        coeffs.extend(sub);
    }
    pad_coeffs(&mut coeffs, expected);
    Ok(coeffs)
}

/// Inner pack without SPLIT4 (used by split chunks).
fn pack_frame_inner(coeffs: &[i16]) -> (u8, Vec<u8>) {
    if coeffs_are_silent(coeffs) {
        return (FLAG_SILENCE, Vec::new());
    }
    let a = analyze_frame_impl(coeffs, false);
    pack_frame_with_flag(coeffs, a.chosen_flag)
}

fn encode_dense(coeffs: &[i16]) -> Vec<u8> {
    let mut dense = Vec::with_capacity(coeffs.len() * 2);
    for &c in coeffs {
        dense.extend(&c.to_le_bytes());
    }
    dense
}

fn decode_dense(payload: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    let n = payload.len() / 2;
    let mut coeffs = Vec::with_capacity(n);
    for i in 0..n {
        let o = i * 2;
        coeffs.push(i16::from_le_bytes(payload[o..o + 2].try_into().unwrap()));
    }
    pad_coeffs(&mut coeffs, expected);
    Ok(coeffs)
}

fn pad_coeffs(coeffs: &mut Vec<i16>, expected: usize) {
    while coeffs.len() < expected {
        coeffs.push(0);
    }
    coeffs.truncate(expected);
}

struct BitWriter {
    bytes: Vec<u8>,
    acc: u32,
    nbits: u32,
}

impl BitWriter {
    fn new() -> Self {
        Self {
            bytes: Vec::new(),
            acc: 0,
            nbits: 0,
        }
    }

    fn write_bit(&mut self, bit: bool) {
        self.acc = (self.acc << 1) | (bit as u32);
        self.nbits += 1;
        if self.nbits == 8 {
            self.bytes.push(self.acc as u8);
            self.acc = 0;
            self.nbits = 0;
        }
    }

    fn write_bits(&mut self, v: u32, k: u8) {
        for i in (0..k).rev() {
            self.write_bit(((v >> i) & 1) != 0);
        }
    }

    fn finish(mut self) -> Vec<u8> {
        if self.nbits > 0 {
            self.bytes.push((self.acc << (8 - self.nbits)) as u8);
        }
        self.bytes
    }
}

struct BitReader<'a> {
    data: &'a [u8],
    pos: usize,
    acc: u32,
    nbits: u32,
}

impl<'a> BitReader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self {
            data,
            pos: 0,
            acc: 0,
            nbits: 0,
        }
    }

    fn read_bit(&mut self) -> Result<bool, String> {
        if self.nbits == 0 {
            if self.pos >= self.data.len() {
                return Err("bit eof".into());
            }
            self.acc = self.data[self.pos] as u32;
            self.pos += 1;
            self.nbits = 8;
        }
        self.nbits -= 1;
        Ok(((self.acc >> self.nbits) & 1) != 0)
    }

    fn read_bits(&mut self, k: u8) -> Result<u32, String> {
        let mut v = 0u32;
        for _ in 0..k {
            v = (v << 1) | (self.read_bit()? as u32);
        }
        Ok(v)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(coeffs: &[i16]) {
        let (f, p) = pack_frame(coeffs);
        let back = unpack_frame(f, &p, coeffs.len()).unwrap();
        assert_eq!(back, coeffs, "flag {f}");
    }

    #[test]
    fn v5_modes_roundtrip() {
        let smooth: Vec<i16> = (0..2048).map(|i| (i as i16 / 16) % 200 - 100).collect();
        roundtrip(&smooth);
        let noisy: Vec<i16> = (0..2048).map(|i| ((i * 1103515245 + 12345) % 4096) as i16 - 2048).collect();
        roundtrip(&noisy);
        let sparse = vec![0i16; 2048];
        roundtrip(&sparse);
    }

    #[test]
    fn v5_beats_dense_on_smooth() {
        let coeffs: Vec<i16> = (0..2048).map(|i| (i as i16 / 32) % 64).collect();
        let a = analyze_frame(&coeffs);
        assert_ne!(a.chosen_flag, FLAG_DENSE_I16);
    }
}
