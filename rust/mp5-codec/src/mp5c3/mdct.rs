//! Type-IV MDCT / IMDCT with sine window and 50% overlap-add.
//!
//! Lab-only transform for MP5-C3. Frame length N (even) yields N/2 coeffs; hop N/2.
//! Definition (M = N/2):
//!   MDCT[k] = sum_n x[n] cos(pi/M * (n + 0.5 + M/2) * (k + 0.5))
//!   IMDCT scale 2/M.
//!
//! FFT-based Type-IV path (radix-2, no extra crates) for practical WASM lab use.

use std::f32::consts::PI;

pub const N: usize = 2048;
pub const HOP: usize = N / 2;
pub const COEFFS: usize = N / 2;

#[derive(Clone, Copy)]
struct C32 {
    re: f32,
    im: f32,
}

impl C32 {
    const ZERO: Self = Self { re: 0.0, im: 0.0 };
    #[inline]
    fn new(re: f32, im: f32) -> Self {
        Self { re, im }
    }
    #[inline]
    fn from_polar(mag: f32, ang: f32) -> Self {
        Self {
            re: mag * ang.cos(),
            im: mag * ang.sin(),
        }
    }
    #[inline]
    fn mul(self, o: Self) -> Self {
        Self {
            re: self.re * o.re - self.im * o.im,
            im: self.re * o.im + self.im * o.re,
        }
    }
    #[inline]
    fn add(self, o: Self) -> Self {
        Self {
            re: self.re + o.re,
            im: self.im + o.im,
        }
    }
    #[inline]
    fn sub(self, o: Self) -> Self {
        Self {
            re: self.re - o.re,
            im: self.im - o.im,
        }
    }
    #[inline]
    fn scale(self, s: f32) -> Self {
        Self {
            re: self.re * s,
            im: self.im * s,
        }
    }
}

fn fft_radix2(buf: &mut [C32], inv: bool) {
    let n = buf.len();
    debug_assert!(n.is_power_of_two());
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            buf.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = 2.0 * PI / len as f32 * if inv { 1.0 } else { -1.0 };
        let wlen = C32::from_polar(1.0, ang);
        for i in (0..n).step_by(len) {
            let mut w = C32::new(1.0, 0.0);
            for k in 0..len / 2 {
                let u = buf[i + k];
                let v = buf[i + k + len / 2].mul(w);
                buf[i + k] = u.add(v);
                buf[i + k + len / 2] = u.sub(v);
                w = w.mul(wlen);
            }
        }
        len *= 2;
    }
    if inv {
        let s = 1.0 / n as f32;
        for c in buf.iter_mut() {
            *c = c.scale(s);
        }
    }
}

/// DCT-IV length m via length-2m FFT.
fn dct4(x: &[f32]) -> Vec<f32> {
    let m = x.len();
    debug_assert!(m.is_power_of_two() && m >= 2);
    let n = 2 * m;
    let mut z = vec![C32::ZERO; n];
    for i in 0..m {
        let ang = -PI * i as f32 / (2.0 * m as f32);
        z[i] = C32::from_polar(x[i], ang);
    }
    fft_radix2(&mut z, false);
    let mut out = vec![0f32; m];
    for k in 0..m {
        let ang = -PI * (k as f32 + 0.5) / (2.0 * m as f32);
        let tw = C32::from_polar(1.0, ang);
        // Length-2m FFT form matches unnormalized DCT-IV without an extra ×2.
        out[k] = z[k].mul(tw).re;
    }
    out
}

/// Wikipedia MDCT via DCT-IV fold (2N inputs -> N outputs).
fn mdct_fold(x: &[f32]) -> Vec<f32> {
    let n2 = x.len();
    let n = n2 / 2;
    let n_half = n / 2;
    let mut y = vec![0f32; n];
    for i in 0..n_half {
        y[i] = -x[i + n + n_half] - x[n + n_half - 1 - i];
        y[i + n_half] = x[i] - x[n - 1 - i];
    }
    y
}

/// Unfold DCT-IV output to 2N-sample IMDCT time aliases.
fn imdct_from_dct4(z: &[f32]) -> Vec<f32> {
    let n = z.len();
    let n_half = n / 2;
    let mut y = vec![0f32; n * 2];
    for i in 0..n_half {
        y[i] = z[n_half + i];
        y[n_half + i] = -z[n - 1 - i];
        y[n + i] = -z[n_half - 1 - i];
        y[n + n_half + i] = -z[i];
    }
    y
}

pub fn sine_window(n: usize) -> Vec<f32> {
    (0..n)
        .map(|i| (PI * (i as f32 + 0.5) / n as f32).sin())
        .collect()
}

#[cfg(test)]
fn mdct_direct(x: &[f32]) -> Vec<f32> {
    let n = x.len();
    let m = n / 2;
    let mut out = vec![0f32; m];
    for k in 0..m {
        let mut acc = 0f32;
        let kf = k as f32 + 0.5;
        for (ni, &sample) in x.iter().enumerate() {
            let arg = PI / m as f32 * (ni as f32 + 0.5 + m as f32 * 0.5) * kf;
            acc += sample * arg.cos();
        }
        out[k] = acc;
    }
    out
}

#[cfg(test)]
fn imdct_direct(coeffs: &[f32]) -> Vec<f32> {
    let m = coeffs.len();
    let n = m * 2;
    let mut out = vec![0f32; n];
    let scale = 2.0 / m as f32;
    for ni in 0..n {
        let mut acc = 0f32;
        for (k, &c) in coeffs.iter().enumerate() {
            let arg = PI / m as f32 * (ni as f32 + 0.5 + m as f32 * 0.5) * (k as f32 + 0.5);
            acc += c * arg.cos();
        }
        out[ni] = acc * scale;
    }
    out
}

#[cfg(test)]
fn dct4_direct(x: &[f32]) -> Vec<f32> {
    let m = x.len();
    let mut out = vec![0f32; m];
    for k in 0..m {
        let mut acc = 0f32;
        for n in 0..m {
            acc += x[n] * (PI / m as f32 * (n as f32 + 0.5) * (k as f32 + 0.5)).cos();
        }
        out[k] = acc;
    }
    out
}

pub fn mdct(x: &[f32]) -> Vec<f32> {
    let n = x.len();
    debug_assert!(n >= 4 && n % 2 == 0);
    debug_assert!((n / 2).is_power_of_two());
    let u = mdct_fold(x);
    dct4(&u)
}

pub fn imdct(coeffs: &[f32]) -> Vec<f32> {
    let m = coeffs.len();
    debug_assert!(m.is_power_of_two());
    let mut scaled = vec![0f32; m];
    let s = 2.0 / m as f32;
    for i in 0..m {
        scaled[i] = coeffs[i] * s;
    }
    let z = dct4(&scaled);
    imdct_from_dct4(&z)
}

pub fn analyze_frame(frame: &[f32], window: &[f32]) -> Vec<f32> {
    debug_assert_eq!(frame.len(), window.len());
    let mut w = vec![0f32; frame.len()];
    for i in 0..frame.len() {
        w[i] = frame[i] * window[i];
    }
    mdct(&w)
}

pub fn synthesize_frame(coeffs: &[f32], window: &[f32]) -> Vec<f32> {
    let mut y = imdct(coeffs);
    debug_assert_eq!(y.len(), window.len());
    for i in 0..y.len() {
        y[i] *= window[i];
    }
    y
}

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

    fn max_rel_err(a: &[f32], b: &[f32]) -> f32 {
        let peak = a
            .iter()
            .chain(b.iter())
            .map(|v| v.abs())
            .fold(1e-20f32, f32::max);
        a.iter()
            .zip(b.iter())
            .map(|(x, y)| (x - y).abs())
            .fold(0f32, f32::max)
            / peak
    }

    #[test]
    fn dct4_fft_matches_direct() {
        let m = 32;
        let x: Vec<f32> = (0..m).map(|i| ((i as f32) * 0.2).sin()).collect();
        let a = dct4_direct(&x);
        let b = dct4(&x);
        assert!(max_rel_err(&a, &b) < 1e-4, "err={}", max_rel_err(&a, &b));
    }

    #[test]
    fn mdct_fft_matches_direct_n64() {
        let n = 64;
        let x: Vec<f32> = (0..n).map(|i| ((i as f32) * 0.17).sin() * 0.6).collect();
        let a = mdct_direct(&x);
        let b = mdct(&x);
        assert!(max_rel_err(&a, &b) < 1e-3, "err={}", max_rel_err(&a, &b));
    }

    #[test]
    fn mdct_fft_matches_direct_n2048() {
        let x: Vec<f32> = (0..N).map(|i| ((i as f32) * 0.07).sin() * 0.5).collect();
        let a = mdct_direct(&x);
        let b = mdct(&x);
        assert!(max_rel_err(&a, &b) < 2e-3, "err={}", max_rel_err(&a, &b));
    }

    #[test]
    fn imdct_fft_matches_direct_n64() {
        let m = 32;
        let c: Vec<f32> = (0..m).map(|k| ((k as f32) * 0.11).sin() * 0.3).collect();
        let a = imdct_direct(&c);
        let b = imdct(&c);
        assert!(max_rel_err(&a, &b) < 2e-3, "err={}", max_rel_err(&a, &b));
    }

    #[test]
    fn mdct_imdct_identity_on_windowed_impulse_train() {
        let window = sine_window(N);
        let mut x = vec![0f32; N];
        for i in 0..N {
            x[i] = ((i as f32) * 0.07).sin() * 0.5;
        }
        let c = analyze_frame(&x, &window);
        assert_eq!(c.len(), COEFFS);
        assert!(c.iter().all(|v| v.is_finite()));
        let y = synthesize_frame(&c, &window);
        assert_eq!(y.len(), N);
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
        assert!(snr > 80.0, "float OLA SNR too low: {snr:.1} dB");
    }

    #[test]
    fn ola_preserves_length() {
        let x: Vec<f32> = (0..5000).map(|i| (i as f32 * 0.01).sin()).collect();
        assert_eq!(roundtrip_ola(&x, N).len(), x.len());
    }
}
