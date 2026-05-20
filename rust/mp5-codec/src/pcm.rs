pub fn interleave_i16(channels: &[Vec<i16>]) -> Vec<i16> {
    if channels.is_empty() {
        return vec![];
    }
    let len = channels[0].len();
    let ch = channels.len();
    let mut out = Vec::with_capacity(len * ch);
    for i in 0..len {
        for c in 0..ch {
            out.push(channels[c][i]);
        }
    }
    out
}

pub fn deinterleave_i16(interleaved: &[i16], channels: usize) -> Vec<Vec<i16>> {
    if channels == 0 {
        return vec![];
    }
    let frames = interleaved.len() / channels;
    let mut out: Vec<Vec<i16>> = (0..channels).map(|_| Vec::with_capacity(frames)).collect();
    for i in 0..frames {
        for c in 0..channels {
            out[c].push(interleaved[i * channels + c]);
        }
    }
    out
}

pub fn i16_to_f32(samples: &[i16]) -> Vec<f32> {
    samples.iter().map(|&s| s as f32 / 32768.0).collect()
}

pub fn f32_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0).round() as i16)
        .collect()
}

pub fn snr_db(original: &[f32], decoded: &[f32]) -> f64 {
    let n = original.len().min(decoded.len());
    if n == 0 {
        return 0.0;
    }
    let mut signal = 0.0f64;
    let mut noise = 0.0f64;
    for i in 0..n {
        let o = original[i] as f64;
        let d = decoded[i] as f64;
        signal += o * o;
        let e = o - d;
        noise += e * e;
    }
    if noise < 1e-20 {
        return 120.0;
    }
    10.0 * (signal / noise).log10()
}
