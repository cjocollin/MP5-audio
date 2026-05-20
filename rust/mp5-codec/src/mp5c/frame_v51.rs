//! MP5-C v5.1 per-frame encoding: band-aware quant + safe M/S + quality gates.

use super::bands::{self, NUM_BANDS};
use super::pack_v5;
use super::quant::{self, Preset};

pub const FLAG_BAND_LR: u8 = 8;
pub const FLAG_BAND_MS: u8 = 9;

pub const FRAME_HDR_V51_FLAT: usize = 4;
pub const FRAME_HDR_V51_BAND: usize = 8;

#[derive(Clone)]
pub struct EncodedChannelFrame {
    pub flag: u8,
    pub step_scale: u8,
    pub band_scales: [u8; NUM_BANDS],
    pub payload: Vec<u8>,
    pub peak_err: f32,
}

#[derive(Clone)]
pub struct StereoFrameChoice {
    pub mid: EncodedChannelFrame,
    pub side: EncodedChannelFrame,
    pub used_ms: bool,
}

pub fn peak_err_limit(preset: Preset) -> f32 {
    match preset {
        Preset::Low => 0.024,
        Preset::Standard => 0.017,
        Preset::High => 0.013,
        Preset::Extreme => 0.011,
    }
}

pub fn encode_channel_frame(
    frame: &[f32],
    sample_rate: u32,
    base_step: f32,
    preset: Preset,
    is_ms_side: bool,
) -> EncodedChannelFrame {
    let rms = quant::frame_rms(frame);
    let hf = quant::frame_hf_ratio(frame);
    let frame_scale = quant::adaptive_step_scale(rms, hf);
    let limit = peak_err_limit(preset);

    let flat = encode_flat(frame, base_step, frame_scale);
    let dense_bytes = frame.len() * 2;
    let try_band = flat.payload.len() + 48 >= dense_bytes.saturating_sub(256) || rms < 0.11;

    let mut best = flat;
    if try_band {
        let band = encode_bands(
            frame,
            sample_rate,
            base_step,
            frame_scale,
            preset,
            is_ms_side,
            FLAG_BAND_LR,
        );
        if band.payload.len() + 8 < best.payload.len() && band.peak_err <= limit {
            best = band;
        } else if band.peak_err <= limit && band.peak_err < best.peak_err {
            best = band;
        } else if best.peak_err > limit && band.peak_err < best.peak_err {
            best = band;
        }
    }

    if best.peak_err > limit {
        let conservative = encode_flat(frame, base_step, frame_scale.min(0.88));
        if conservative.peak_err <= best.peak_err {
            best = conservative;
        }
    }
    best
}

pub fn encode_stereo_frame_pair(
    left: &[f32],
    right: &[f32],
    sample_rate: u32,
    base_step: f32,
    preset: Preset,
) -> StereoFrameChoice {
    let lr_mid = encode_channel_frame(left, sample_rate, base_step, preset, false);
    let lr_side = encode_channel_frame(right, sample_rate, base_step, preset, false);
    let lr_bytes = lr_mid.payload.len() + lr_side.payload.len();
    let lr_peak = lr_mid.peak_err.max(lr_side.peak_err);

    let mut best = StereoFrameChoice {
        mid: lr_mid,
        side: lr_side,
        used_ms: false,
    };
    let limit = peak_err_limit(preset);

    if lr_bytes > 6000 && stereo_ms_safe(left, right) {
        let (m, s) = to_mid_side_f32(left, right);
        let m_scale = quant::adaptive_step_scale(quant::frame_rms(&m), quant::frame_hf_ratio(&m));
        let s_scale = quant::adaptive_step_scale(quant::frame_rms(&s), quant::frame_hf_ratio(&s));
        let mid_enc = encode_bands(&m, sample_rate, base_step, m_scale, preset, false, FLAG_BAND_MS);
        let side_enc = encode_bands(&s, sample_rate, base_step, s_scale, preset, true, FLAG_BAND_MS);
        let ms_peak = mid_enc.peak_err.max(side_enc.peak_err);
        let ms_bytes = mid_enc.payload.len() + side_enc.payload.len();
        if ms_peak <= limit && ms_bytes + 40 < lr_bytes {
            best = StereoFrameChoice {
                mid: mid_enc,
                side: side_enc,
                used_ms: true,
            };
        }
    }
    best
}

pub fn decode_channel_frame(
    flag: u8,
    payload: &[u8],
    frame_len: usize,
    base_step: f32,
    step_scale: f32,
    band_scales: &[u8; NUM_BANDS],
    preset: Preset,
    is_ms_side: bool,
) -> Result<Vec<f32>, String> {
    if flag == FLAG_BAND_LR || flag == FLAG_BAND_MS {
        decode_bands(payload, frame_len, base_step, step_scale, band_scales, preset, is_ms_side)
    } else {
        let step = base_step * step_scale;
        let coeffs = pack_v5::unpack_frame(flag, payload, frame_len)?;
        Ok(quant::dequantize(&coeffs, step))
    }
}

fn encode_flat(frame: &[f32], base_step: f32, frame_scale: f32) -> EncodedChannelFrame {
    let step = base_step * frame_scale;
    let q = quant::quantize(frame, step);
    let (flag, payload) = pack_v5::pack_frame(&q);
    let recon = quant::dequantize(&q, step);
    EncodedChannelFrame {
        flag,
        step_scale: quant::step_scale_to_u8(frame_scale),
        band_scales: [128; NUM_BANDS],
        payload,
        peak_err: peak_error(frame, &recon),
    }
}

fn encode_bands(
    frame: &[f32],
    sample_rate: u32,
    base_step: f32,
    frame_scale: f32,
    preset: Preset,
    is_ms_side: bool,
    flag: u8,
) -> EncodedChannelFrame {
    let band_parts = bands::split_4(frame, sample_rate);
    let mults = quant::band_step_multipliers(preset, is_ms_side);
    let mut band_scales = [128u8; NUM_BANDS];
    let mut payload = Vec::new();
    let mut recon = vec![0f32; frame.len()];

    for (i, band) in band_parts.iter().enumerate() {
        let bscale = quant::band_adaptive_scale(band);
        band_scales[i] = quant::band_scale_to_u8(bscale);
        let step = base_step * frame_scale * mults[i] * quant::band_scale_from_u8(band_scales[i]);
        let q = quant::quantize(band, step);
        let (sub_flag, sub_payload) = pack_v5::pack_frame_band(&q);
        payload.push(sub_flag);
        payload.extend(&(sub_payload.len() as u16).to_le_bytes());
        payload.extend(&sub_payload);
        let part = quant::dequantize(&q, step);
        for (j, &v) in part.iter().enumerate() {
            if j < recon.len() {
                recon[j] += v;
            }
        }
    }

    EncodedChannelFrame {
        flag,
        step_scale: quant::step_scale_to_u8(frame_scale),
        band_scales,
        payload,
        peak_err: peak_error(frame, &recon),
    }
}

fn decode_bands(
    payload: &[u8],
    frame_len: usize,
    base_step: f32,
    frame_scale: f32,
    band_scales: &[u8; NUM_BANDS],
    preset: Preset,
    is_ms_side: bool,
) -> Result<Vec<f32>, String> {
    let mults = quant::band_step_multipliers(preset, is_ms_side);
    let mut pos = 0usize;
    let mut band_signals: Vec<Vec<f32>> = vec![Vec::new(); NUM_BANDS];
    for i in 0..NUM_BANDS {
        if pos >= payload.len() {
            return Err("band payload short".into());
        }
        let sub_flag = payload[pos];
        pos += 1;
        if pos + 2 > payload.len() {
            return Err("band len short".into());
        }
        let sub_len = u16::from_le_bytes(payload[pos..pos + 2].try_into().unwrap()) as usize;
        pos += 2;
        if pos + sub_len > payload.len() {
            return Err("band truncated".into());
        }
        let sub = &payload[pos..pos + sub_len];
        pos += sub_len;
        let step = base_step
            * frame_scale
            * mults[i]
            * quant::band_scale_from_u8(band_scales[i]);
        let coeffs = pack_v5::unpack_frame(sub_flag, sub, frame_len)?;
        band_signals[i] = quant::dequantize(&coeffs, step);
    }
    let merged: [Vec<f32>; NUM_BANDS] = band_signals
        .try_into()
        .map_err(|_| "band merge")?;
    Ok(bands::merge_4(&merged))
}

fn peak_error(orig: &[f32], recon: &[f32]) -> f32 {
    let n = orig.len().min(recon.len());
    let mut max = 0f32;
    for i in 0..n {
        let e = (orig[i] - recon[i]).abs();
        if e > max {
            max = e;
        }
    }
    max
}

pub fn stereo_ms_safe(left: &[f32], right: &[f32]) -> bool {
    let n = left.len().min(right.len());
    if n < 64 {
        return false;
    }
    let step = (n / 64).max(1);
    let mut ll = 0f64;
    let mut rr = 0f64;
    let mut lr = 0f64;
    let mut mid_e = 0f64;
    let mut side_e = 0f64;
    let mut count = 0usize;
    for i in (0..n).step_by(step) {
        let l = left[i] as f64;
        let r = right[i] as f64;
        ll += l * l;
        rr += r * r;
        lr += l * r;
        let m = (l + r) * 0.5;
        let s = (l - r) * 0.5;
        mid_e += m * m;
        side_e += s * s;
        count += 1;
    }
    let cf = count as f64;
    let denom = (ll * rr).sqrt() + 1e-12;
    let corr = (lr / denom) as f32;
    let mid_rms = (mid_e / cf).sqrt() as f32;
    let side_rms = (side_e / cf).sqrt() as f32;
    corr > 0.87 && side_rms < mid_rms * 0.42 && mid_rms > 1e-5
}

fn to_mid_side_f32(left: &[f32], right: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let n = left.len().min(right.len());
    let mut mid = Vec::with_capacity(n);
    let mut side = Vec::with_capacity(n);
    for i in 0..n {
        mid.push((left[i] + right[i]) * 0.5);
        side.push((left[i] - right[i]) * 0.5);
    }
    (mid, side)
}

pub fn from_mid_side_f32(mid: &[f32], side: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let n = mid.len().min(side.len());
    let mut left = Vec::with_capacity(n);
    let mut right = Vec::with_capacity(n);
    for i in 0..n {
        let m = mid[i];
        let s = side[i];
        left.push((m + s).clamp(-1.0, 1.0));
        right.push((m - s).clamp(-1.0, 1.0));
    }
    (left, right)
}
