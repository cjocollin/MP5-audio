#[repr(u8)]
#[derive(Debug, Copy, Clone)]
pub enum Preset {
    Low = 0,
    Standard = 1,
    High = 2,
    Extreme = 3,
}

impl Preset {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(Preset::Low),
            1 => Some(Preset::Standard),
            2 => Some(Preset::High),
            3 => Some(Preset::Extreme),
            _ => None,
        }
    }
}

/// Base quantizer step (v4+ tuned for real music).
/// High retuned after hiss investigation: finer step + stronger quiet scaling (see `HISS_INVESTIGATION.md`).
pub fn step_for_preset(p: Preset) -> f32 {
    match p {
        Preset::Low => 0.10,
        Preset::Standard => 0.028,
        Preset::High => 0.014,
        Preset::Extreme => 0.012,
    }
}

/// Legacy v3 steps (decode-only for old exports).
pub fn step_for_preset_v3(p: Preset) -> f32 {
    match p {
        Preset::Low => 0.10,
        Preset::Standard => 0.05,
        Preset::High => 0.025,
        Preset::Extreme => 0.012,
    }
}

pub fn frame_rms(frame: &[f32]) -> f32 {
    if frame.is_empty() {
        return 0.0;
    }
    let s: f32 = frame.iter().map(|&x| x * x).sum();
    (s / frame.len() as f32).sqrt()
}

/// HF energy ratio (simple 1-zero diff) — high values = cymbals/transients.
pub fn frame_hf_ratio(frame: &[f32]) -> f32 {
    if frame.len() < 4 {
        return 0.0;
    }
    let mut lf = 0.0f32;
    let mut hf = 0.0f32;
    let mut prev = frame[0];
    for &x in &frame[1..] {
        let d = x - prev;
        hf += d * d;
        lf += x * x;
        prev = x;
    }
    let total = lf + hf + 1e-12;
    hf / total
}

/// Per-frame step scale: quieter frames get finer quantization (less hiss in gaps/reverb tails).
pub fn adaptive_step_scale(rms: f32, hf_ratio: f32) -> f32 {
    let quiet = (0.14 - rms).max(0.0) / 0.14;
    let quiet_factor = 1.0 - quiet * 0.58;
    let hf_factor = 1.0 - hf_ratio.min(0.5) * 0.12;
    (quiet_factor * hf_factor).clamp(0.32, 1.0)
}

pub fn step_scale_to_u8(scale: f32) -> u8 {
    let s = scale.clamp(0.25, 1.0);
    (((s - 0.25) / 0.75) * 255.0).round() as u8
}

pub fn step_scale_from_u8(v: u8) -> f32 {
    0.25 + (v as f32 / 255.0) * 0.75
}

pub fn quantize(spec: &[f32], step: f32) -> Vec<i16> {
    spec.iter()
        .map(|&x| (x / step).round().clamp(-32768.0, 32767.0) as i16)
        .collect()
}

pub fn dequantize(coeffs: &[i16], step: f32) -> Vec<f32> {
    coeffs.iter().map(|&q| q as f32 * step).collect()
}

/// Per-band step multiplier vs frame base step (v5.1). HF bands may be coarser.
pub fn band_step_multipliers(p: Preset, is_ms_side: bool) -> [f32; 4] {
    let side = if is_ms_side { 1.06 } else { 1.0 };
    match p {
        Preset::Low => [1.0, 1.08, 1.35 * side, 1.65 * side],
        Preset::Standard => [1.0, 1.02, 1.22 * side, 1.48 * side],
        Preset::High => [1.0, 1.0, 1.10 * side, 1.28 * side],
        Preset::Extreme => [1.0, 1.0, 1.06 * side, 1.14 * side],
    }
}

/// Extra per-band scale from band energy (quieter band → slightly coarser, capped).
pub fn band_adaptive_scale(band: &[f32]) -> f32 {
    let rms = frame_rms(band);
    let quiet = (0.008 - rms).max(0.0) / 0.008;
    (1.0 + quiet * 0.18).clamp(0.85, 1.35)
}

pub fn band_scale_to_u8(scale: f32) -> u8 {
    let s = scale.clamp(0.75, 1.35);
    (((s - 0.75) / 0.60) * 255.0).round() as u8
}

pub fn band_scale_from_u8(v: u8) -> f32 {
    0.75 + (v as f32 / 255.0) * 0.60
}

#[allow(dead_code)]
pub fn pack_coeffs(coeffs: &[i16]) -> Vec<u8> {
    let mut out = Vec::with_capacity(4 + coeffs.len() * 2);
    out.extend(&(coeffs.len() as u32).to_le_bytes());
    for &c in coeffs {
        out.extend(&c.to_le_bytes());
    }
    out
}

pub fn unpack_coeffs(data: &[u8], expected: usize) -> Result<Vec<i16>, String> {
    if data.len() < 4 {
        return Err("coeff pack short".into());
    }
    let n = u32::from_le_bytes(data[0..4].try_into().unwrap()) as usize;
    if data.len() < 4 + n * 2 {
        return Err("coeff truncated".into());
    }
    let mut coeffs = Vec::with_capacity(n);
    for i in 0..n {
        let o = 4 + i * 2;
        coeffs.push(i16::from_le_bytes(data[o..o + 2].try_into().unwrap()));
    }
    while coeffs.len() < expected {
        coeffs.push(0);
    }
    coeffs.truncate(expected);
    Ok(coeffs)
}
