//! 4-band perfect-reconstruction split (cascaded one-pole lowpass @ 48 kHz nominal).

pub const NUM_BANDS: usize = 4;

/// Split frame into [low, low-mid, high-mid, high]. Sum of bands equals input.
pub fn split_4(frame: &[f32], sample_rate: u32) -> [Vec<f32>; NUM_BANDS] {
    let a0 = alpha_for_cutoff(220.0, sample_rate);
    let a1 = alpha_for_cutoff(900.0, sample_rate);
    let a2 = alpha_for_cutoff(3600.0, sample_rate);

    let low = onepole_lpf(frame, a0);
    let mut rest1: Vec<f32> = frame.iter().zip(low.iter()).map(|(x, l)| x - l).collect();
    let lmid = onepole_lpf(&rest1, a1);
    let mut rest2: Vec<f32> = rest1
        .iter()
        .zip(lmid.iter())
        .map(|(x, l)| x - l)
        .collect();
    let hmid = onepole_lpf(&rest2, a2);
    let high: Vec<f32> = rest2
        .iter()
        .zip(hmid.iter())
        .map(|(x, h)| x - h)
        .collect();
    [low, lmid, hmid, high]
}

pub fn merge_4(bands: &[Vec<f32>; NUM_BANDS]) -> Vec<f32> {
    let n = bands[0].len();
    let mut out = vec![0f32; n];
    for b in bands {
        for i in 0..n {
            out[i] += b.get(i).copied().unwrap_or(0.0);
        }
    }
    out
}

fn alpha_for_cutoff(hz: f32, sample_rate: u32) -> f32 {
    let sr = sample_rate.max(8000) as f32;
    let x = 2.0 * std::f32::consts::PI * hz / sr;
    (1.0 - (-x).exp()).clamp(0.001, 0.999)
}

fn onepole_lpf(x: &[f32], alpha: f32) -> Vec<f32> {
    let mut y = Vec::with_capacity(x.len());
    let mut s = 0f32;
    for &v in x {
        s = alpha * v + (1.0 - alpha) * s;
        y.push(s);
    }
    y
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_merge_identity() {
        let frame: Vec<f32> = (0..2048)
            .map(|i| (i as f32 * 0.01).sin() * 0.5 + ((i as f32 * 0.1).cos() * 0.2))
            .collect();
        let bands = split_4(&frame, 48000);
        let back = merge_4(&bands);
        for (a, b) in frame.iter().zip(back.iter()) {
            assert!((a - b).abs() < 1e-5, "drift {}", (a - b).abs());
        }
    }
}
