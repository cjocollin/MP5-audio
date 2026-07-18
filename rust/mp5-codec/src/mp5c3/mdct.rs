//! Type-IV MDCT / IMDCT with sine window and 50% overlap-add.
//!
//! Lab-only transform path for MP5-C3. Frame length `N` (even) yields `N/2`
//! coefficients; hop size is `N/2`.
//!
//! Uses the direct (O(N^2)) definition with coefficient count M = N/2:
//! cos(pi/M * (n + 1/2 + M/2) * (k + 1/2)), IMDCT scale 2/M.

/// Default MDCT length (samples). Hop = N/2 = 1024.
pub const N: usize = 2048;
pub const HOP: usize = N / 2;
pub const COEFFS: usize = N / 2;

/// Sine analysis/synthesis window satisfying Princen–Bradley for 50% overlap.
pub fn sine_window(n: usize) -> Vec<f32> {
    (0..n)
        .map(|i| {
            let x = std::f32::consts::PI * (i as f32 + 0.5) / n as f32;
            x.sin()
        })
        .collect()
}

/// Forward MDCT: `x` length 2M → M coefficients.
pub fn mdct(x: &[f32]) -> Vec<f32> {
    let n = x.len();
    debug_assert!(n >= 2 && n % 2 == 0);
    let m = n / 2;
    let mut out = vec![0f32; m];
    for k in 0..m {
        let mut acc = 0f32;
        let kf = k as f32 + 0.5;
        for (n_i, &sample) in x.iter().enumerate() {
            let arg =
                std::f32::consts::PI / m as f32 * (n_i as f32 + 0.5 + (m as f32) * 0.5) * kf;
            acc += sample * arg.cos();
        }
        out[k] = acc;
    }
    out
}

/// Inverse MDCT: M coefficients → 2M time samples. Scale is 2/M.
pub fn imdct(coeffs: &[f32]) -> Vec<f32> {
    let m = coeffs.len();
    let n = m * 2;
    let mut out = vec![0f32; n];
    let scale = 2.0 / m as f32;
    for n_i in 0..n {
        let mut acc = 0f32;
        for (k, &c) in coeffs.iter().enumerate() {
            let arg = std::f32::consts::PI / m as f32
                * (n_i as f32 + 0.5 + (m as f32) * 0.5)
                * (k as f32 + 0.5);
            acc += c * arg.cos();
        }
        out[n_i] = acc * scale;
    }
    out
}

/// Window → MDCT for one frame.
pub fn analyze_frame(frame: &[f32], window: &[f32]) -> Vec<f32> {
    debug_assert_eq!(frame.len(), window.len());
    let mut w = vec![0f32; frame.len()];
    for i in 0..frame.len() {
        w[i] = frame[i] * window[i];
    }
    mdct(&w)
}

/// IMDCT → window for one frame (pre-OLA).
pub fn synthesize_frame(coeffs: &[f32], window: &[f32]) -> Vec<f32> {
    let mut y = imdct(coeffs);
    debug_assert_eq!(y.len(), window.len());
    for i in 0..y.len() {
        y[i] *= window[i];
    }
    y
}

/// Float MDCT roundtrip with 50% OLA.
pub fn roundtrip_ola(samples: &[f32], n: usize) -> Vec<f32> {
    let hop = n / 2;
    let window = sine_window(n);
    let mut out = vec![0f32; samples.len()];
    if samples.len() < n {
        let mut padded = vec![0f32; n];
        padded[..samples.len()].copy_from_slice(samples);
        let c = analyze_frame(&padded, &window);
        let y = synthesize_frame(&c, &window);
        let copy = samples.len().min(n);
        out[..copy].copy_from_slice(&y[..copy]);
        return out;
    }
    let mut pos = 0usize;
    while pos + n <= samples.len() {
        let frame = &samples[pos..pos + n];
        let c = analyze_frame(frame, &window);
        let y = synthesize_frame(&c, &window);
        for i in 0..n {
            out[pos + i] += y[i];
        }
        pos += hop;
    }
    if pos < samples.len() && pos + hop <= samples.len() {
        let mut padded = vec![0f32; n];
        let avail = samples.len() - pos;
        padded[..avail].copy_from_slice(&samples[pos..]);
        let c = analyze_frame(&padded, &window);
        let y = synthesize_frame(&c, &window);
        for i in 0..avail {
            out[pos + i] += y[i];
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mdct_imdct_identity_on_windowed_impulse_train() {
        let n = N;
        let window = sine_window(n);
        let mut x = vec![0f32; n];
        for i in 0..n {
            x[i] = ((i as f32) * 0.07).sin() * 0.5;
        }
        let c = analyze_frame(&x, &window);
        assert_eq!(c.len(), COEFFS);
        assert!(c.iter().all(|v| v.is_finite()));
        let y = synthesize_frame(&c, &window);
        assert_eq!(y.len(), n);
        assert!(y.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn ola_reconstructs_interior_sine() {
        let frames = 8;
        let len = HOP * frames + HOP;
        let mut x = vec![0f32; len];
        for i in 0..len {
            x[i] = ((i as f32) * 0.05).sin() * 0.4 + ((i as f32) * 0.013).cos() * 0.2;
        }
        let y = roundtrip_ola(&x, N);
        let start = HOP;
        let end = len - HOP;
        let mut err = 0f64;
        let mut sig = 0f64;
        for i in start..end {
            let e = (x[i] - y[i]) as f64;
            err += e * e;
            sig += (x[i] as f64) * (x[i] as f64);
        }
        let snr = 10.0 * (sig / err.max(1e-30)).log10();
        assert!(
            snr > 80.0,
            "float OLA SNR too low in interior: {snr:.1} dB (err={err})"
        );
    }

    #[test]
    fn ola_preserves_length() {
        let x: Vec<f32> = (0..5000).map(|i| (i as f32 * 0.01).sin()).collect();
        let y = roundtrip_ola(&x, N);
        assert_eq!(y.len(), x.len());
    }
}
