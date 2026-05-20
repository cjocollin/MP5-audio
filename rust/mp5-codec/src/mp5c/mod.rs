mod artifact;
pub mod blocker;
mod bands;
mod diag;
mod frame_v51;
mod pack;
#[cfg(feature = "bench_tools")]
pub mod pack_v5;
#[cfg(not(feature = "bench_tools"))]
mod pack_v5;
mod quant;

#[cfg(test)]
pub mod fixtures;

#[cfg(test)]
mod bench;

pub use artifact::{analyze_slice, hiss_score, sections_for_duration, ArtifactMetrics};
pub use blocker::{run_blocker_suite, BlockerReport, FixtureResult};
pub use diag::{
    analyze_bitstream, analyze_bitstream_with_dense, analyze_v51_artifact_report, build_report,
    BitstreamDiag, CodecDiagReport, DenseFrameDetail, V51ArtifactReport,
};
pub use quant::Preset;

/// v2 frame length (legacy).
pub const FRAME_SIZE_V2: usize = 1152;
/// v3/v4 frame length.
pub const FRAME_SIZE_V3: usize = 2048;

const VERSION_V2: u8 = 2;
const VERSION_V3: u8 = 3;
const VERSION_V4: u8 = 4;
const VERSION_V5: u8 = 5;
const VERSION_V51: u8 = 6;

const ENCODE_VERSION: u8 = VERSION_V51;
const SAMPLE_RATE_NOMINAL: u32 = 48000;
const FRAME_HDR_V3: usize = 3;
const FRAME_HDR_V4: usize = 4;

pub fn encode(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    encode_v51(samples, channels, preset)
}

/// Reference v5 encoder for v5.1 A/B benchmarks (bench only).
#[cfg(feature = "bench_tools")]
pub fn encode_v5_reference(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    encode_v5(samples, channels, preset)
}

/// Reference v4 encoder for v5 A/B benchmarks (bench only).
#[cfg(feature = "bench_tools")]
pub fn encode_v4_reference(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    encode_v4(samples, channels, preset)
}

/// Reference v3 encoder for A/B listening exports (bench only).
#[cfg(feature = "bench_tools")]
pub fn encode_v3_reference(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    let ch = channels.max(1) as usize;
    let mut per_ch = deinterleave(samples, ch);
    if ch == 2 {
        per_ch = to_mid_side(&per_ch);
    }
    let frame_size = FRAME_SIZE_V3;
    let frames_per_ch = per_ch
        .iter()
        .map(|c| (c.len() + frame_size - 1) / frame_size)
        .max()
        .unwrap_or(0) as u32;
    let mut out = vec![0x43, VERSION_V3];
    out.push(ch as u8);
    out.push(preset as u8);
    out.extend(&frames_per_ch.to_le_bytes());
    let step = quant::step_for_preset_v3(preset);
    for channel in &per_ch {
        let mut i = 0;
        while i < channel.len() {
            let end = (i + frame_size).min(channel.len());
            let mut frame: Vec<f32> = channel[i..end]
                .iter()
                .map(|&s| s as f32 / 32768.0)
                .collect();
            frame.resize(frame_size, 0.0);
            let q = quant::quantize(&frame, step);
            let (flag, payload) = pack::pack_frame(&q);
            out.push(flag);
            let len = payload.len().min(0xffff) as u16;
            out.extend(&len.to_le_bytes());
            out.extend(&payload[..len as usize]);
            i += frame_size;
        }
    }
    out
}

pub fn decode(data: &[u8]) -> Result<Vec<i16>, String> {
    if data.len() < 4 || data[0] != 0x43 {
        return Err("invalid MP5-C stream".into());
    }
    match data[1] {
        VERSION_V2 => decode_v2(data),
        VERSION_V3 => decode_v3(data),
        VERSION_V4 => decode_v4(data),
        VERSION_V5 => decode_v5(data),
        VERSION_V51 => decode_v51(data),
        v => Err(format!(
            "unsupported MP5-C version {v} (re-export with current converter)"
        )),
    }
}

fn to_mid_side(per_ch: &[Vec<i16>]) -> Vec<Vec<i16>> {
    if per_ch.len() != 2 {
        return per_ch.to_vec();
    }
    let n = per_ch[0].len().min(per_ch[1].len());
    let mut mid = Vec::with_capacity(n);
    let mut side = Vec::with_capacity(n);
    for i in 0..n {
        let l = per_ch[0][i] as i32;
        let r = per_ch[1][i] as i32;
        mid.push(((l + r) / 2) as i16);
        side.push(((l - r) / 2) as i16);
    }
    vec![mid, side]
}

fn from_mid_side(ms: &[Vec<i16>]) -> Vec<Vec<i16>> {
    if ms.len() != 2 {
        return ms.to_vec();
    }
    let n = ms[0].len().min(ms[1].len());
    let mut l = Vec::with_capacity(n);
    let mut r = Vec::with_capacity(n);
    for i in 0..n {
        let m = ms[0][i] as i32;
        let s = ms[1][i] as i32;
        l.push((m + s).clamp(-32768, 32767) as i16);
        r.push((m - s).clamp(-32768, 32767) as i16);
    }
    vec![l, r]
}

fn deinterleave(samples: &[i16], ch: usize) -> Vec<Vec<i16>> {
    if ch == 1 {
        vec![samples.to_vec()]
    } else {
        crate::pcm::deinterleave_i16(samples, ch)
    }
}

fn write_v51_frame(out: &mut Vec<u8>, enc: &frame_v51::EncodedChannelFrame) {
    out.push(enc.flag);
    out.push(enc.step_scale);
    if enc.flag >= frame_v51::FLAG_BAND_LR {
        out.extend_from_slice(&enc.band_scales);
    }
    let len = enc.payload.len().min(0xffff) as u16;
    out.extend_from_slice(&len.to_le_bytes());
    out.extend(&enc.payload[..len as usize]);
}

fn encode_v51(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    let ch = channels.max(1) as usize;
    let per_ch = deinterleave(samples, ch);
    let frame_size = FRAME_SIZE_V3;
    let frames_per_ch = per_ch
        .iter()
        .map(|c| (c.len() + frame_size - 1) / frame_size)
        .max()
        .unwrap_or(0);
    let base_step = quant::step_for_preset(preset);
    let sr = SAMPLE_RATE_NOMINAL;

    let mut encoded: Vec<Vec<frame_v51::EncodedChannelFrame>> = vec![vec![]; ch];

    if ch == 2 {
        let n = per_ch[0].len().min(per_ch[1].len());
        let mut fi = 0usize;
        while fi * frame_size < n {
            let i0 = fi * frame_size;
            let i1 = (i0 + frame_size).min(n);
            let mut l: Vec<f32> = per_ch[0][i0..i1]
                .iter()
                .map(|&s| s as f32 / 32768.0)
                .collect();
            let mut r: Vec<f32> = per_ch[1][i0..i1]
                .iter()
                .map(|&s| s as f32 / 32768.0)
                .collect();
            l.resize(frame_size, 0.0);
            r.resize(frame_size, 0.0);
            let choice = frame_v51::encode_stereo_frame_pair(&l, &r, sr, base_step, preset);
            encoded[0].push(choice.mid);
            encoded[1].push(choice.side);
            fi += 1;
        }
    } else {
        for channel in &per_ch {
            let mut i = 0;
            while i < channel.len() {
                let end = (i + frame_size).min(channel.len());
                let mut frame: Vec<f32> = channel[i..end]
                    .iter()
                    .map(|&s| s as f32 / 32768.0)
                    .collect();
                frame.resize(frame_size, 0.0);
                encoded[0].push(frame_v51::encode_channel_frame(
                    &frame, sr, base_step, preset, false,
                ));
                i += frame_size;
            }
        }
    }

    let mut out = vec![0x43, VERSION_V51];
    out.push(ch as u8);
    out.push(preset as u8);
    out.extend(&(frames_per_ch as u32).to_le_bytes());
    for c in 0..ch {
        for enc in &encoded[c] {
            write_v51_frame(&mut out, enc);
        }
    }
    out
}

fn decode_v51(data: &[u8]) -> Result<Vec<i16>, String> {
    if data.len() < 8 {
        return Err("MP5-C v5.1 header short".into());
    }
    let ch = data[2].max(1) as usize;
    let preset = Preset::from_u8(data[3]).ok_or("bad preset")?;
    let frames_per_ch = u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize;
    let base_step = quant::step_for_preset(preset);
    let frame_size = FRAME_SIZE_V3;
    let mut pos = 8usize;

    if ch == 2 {
        let mut left = Vec::new();
        let mut right = Vec::new();
        let mut ch0_frames: Vec<(u8, u8, [u8; 4], Vec<u8>)> = Vec::new();
        let mut ch1_frames: Vec<(u8, u8, [u8; 4], Vec<u8>)> = Vec::new();

        for c in 0..2 {
            let store = if c == 0 {
                &mut ch0_frames
            } else {
                &mut ch1_frames
            };
            for _ in 0..frames_per_ch {
                let (flag, step_u8, band_scales, payload) = read_v51_frame(data, &mut pos)?;
                store.push((flag, step_u8, band_scales, payload));
            }
        }

        for fi in 0..frames_per_ch {
            let (f0, s0, b0, p0) = &ch0_frames[fi];
            let (f1, s1, b1, p1) = &ch1_frames[fi];
            let scale0 = quant::step_scale_from_u8(*s0);
            let scale1 = quant::step_scale_from_u8(*s1);
            let spec0 = frame_v51::decode_channel_frame(
                *f0, p0, frame_size, base_step, scale0, b0, preset, false,
            )?;
            let spec1 = frame_v51::decode_channel_frame(
                *f1,
                p1,
                frame_size,
                base_step,
                scale1,
                b1,
                preset,
                *f1 == frame_v51::FLAG_BAND_MS,
            )?;
            let (lf, rf) = if *f0 == frame_v51::FLAG_BAND_MS {
                frame_v51::from_mid_side_f32(&spec0, &spec1)
            } else {
                (spec0, spec1)
            };
            left.extend(f32_to_i16(&lf));
            right.extend(f32_to_i16(&rf));
        }
        Ok(crate::pcm::interleave_i16(&[left, right]))
    } else {
        let mut channels: Vec<Vec<i16>> = vec![vec![]; ch];
        for c in 0..ch {
            for _ in 0..frames_per_ch {
                let (flag, step_u8, band_scales, payload) = read_v51_frame(data, &mut pos)?;
                let scale = quant::step_scale_from_u8(step_u8);
                let spec = frame_v51::decode_channel_frame(
                    flag,
                    &payload,
                    frame_size,
                    base_step,
                    scale,
                    &band_scales,
                    preset,
                    false,
                )?;
                channels[c].extend(f32_to_i16(&spec));
            }
        }
        if ch == 1 {
            Ok(channels[0].clone())
        } else {
            Ok(crate::pcm::interleave_i16(&channels))
        }
    }
}

fn read_v51_frame(
    data: &[u8],
    pos: &mut usize,
) -> Result<(u8, u8, [u8; 4], Vec<u8>), String> {
    if *pos >= data.len() {
        return Err("truncated v5.1 frame".into());
    }
    let flag = data[*pos];
    *pos += 1;
    if *pos >= data.len() {
        return Err("truncated v5.1 step".into());
    }
    let step_u8 = data[*pos];
    *pos += 1;
    let band_scales = if flag >= frame_v51::FLAG_BAND_LR {
        if *pos + 4 > data.len() {
            return Err("truncated v5.1 band scales".into());
        }
        let b = [
            data[*pos],
            data[*pos + 1],
            data[*pos + 2],
            data[*pos + 3],
        ];
        *pos += 4;
        b
    } else {
        [128; 4]
    };
    if *pos + 2 > data.len() {
        return Err("truncated v5.1 len".into());
    }
    let len = u16::from_le_bytes(data[*pos..*pos + 2].try_into().unwrap()) as usize;
    *pos += 2;
    if *pos + len > data.len() {
        return Err("truncated v5.1 payload".into());
    }
    let payload = data[*pos..*pos + len].to_vec();
    *pos += len;
    Ok((flag, step_u8, band_scales, payload))
}

fn f32_to_i16(spec: &[f32]) -> Vec<i16> {
    spec.iter()
        .map(|&x| (x.clamp(-1.0, 1.0) * 32767.0).round() as i16)
        .collect()
}

fn encode_v5(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    let ch = channels.max(1) as usize;
    let per_ch = deinterleave(samples, ch);

    let frame_size = FRAME_SIZE_V3;
    let frames_per_ch = per_ch
        .iter()
        .map(|c| (c.len() + frame_size - 1) / frame_size)
        .max()
        .unwrap_or(0) as u32;

    let mut out = vec![0x43, VERSION_V5];
    out.push(ch as u8);
    out.push(preset as u8);
    out.extend(&frames_per_ch.to_le_bytes());

    let base_step = quant::step_for_preset(preset);

    for channel in &per_ch {
        let mut i = 0;
        while i < channel.len() {
            let end = (i + frame_size).min(channel.len());
            let mut frame: Vec<f32> = channel[i..end]
                .iter()
                .map(|&s| s as f32 / 32768.0)
                .collect();
            frame.resize(frame_size, 0.0);
            let rms = quant::frame_rms(&frame);
            let hf = quant::frame_hf_ratio(&frame);
            let scale = quant::adaptive_step_scale(rms, hf);
            let step = base_step * scale;
            let q = quant::quantize(&frame, step);
            let (flag, payload) = pack_v5::pack_frame(&q);
            out.push(flag);
            out.push(quant::step_scale_to_u8(scale));
            let len = payload.len().min(0xffff) as u16;
            out.extend(&len.to_le_bytes());
            out.extend(&payload[..len as usize]);
            i += frame_size;
        }
    }

    out
}

fn decode_v5(data: &[u8]) -> Result<Vec<i16>, String> {
    if data.len() < 8 {
        return Err("MP5-C v5 header short".into());
    }
    let ch = data[2].max(1) as usize;
    let preset = Preset::from_u8(data[3]).ok_or("bad preset")?;
    let frames_per_ch = u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize;
    let base_step = quant::step_for_preset(preset);
    decode_v5_frames(data, ch, frames_per_ch, base_step)
}

fn decode_v5_frames(
    data: &[u8],
    ch: usize,
    frames_per_ch: usize,
    base_step: f32,
) -> Result<Vec<i16>, String> {
    let frame_size = FRAME_SIZE_V3;
    let mut pos = 8;
    let mut channels: Vec<Vec<i16>> = vec![vec![]; ch];

    for c in 0..ch {
        for _ in 0..frames_per_ch {
            if pos >= data.len() {
                break;
            }
            let flag = data[pos];
            pos += 1;
            if pos >= data.len() {
                return Err("truncated v5 step scale".into());
            }
            let scale = quant::step_scale_from_u8(data[pos]);
            pos += 1;
            if pos + 2 > data.len() {
                return Err("truncated frame header".into());
            }
            let len = u16::from_le_bytes(data[pos..pos + 2].try_into().unwrap()) as usize;
            pos += 2;
            if pos + len > data.len() {
                return Err("truncated MP5-C frame".into());
            }
            let payload = &data[pos..pos + len];
            pos += len;
            let step = base_step * scale;
            let coeffs = pack_v5::unpack_frame(flag, payload, frame_size)?;
            let spec = quant::dequantize(&coeffs, step);
            let pcm: Vec<i16> = spec
                .iter()
                .map(|&x| (x.clamp(-1.0, 1.0) * 32767.0).round() as i16)
                .collect();
            channels[c].extend(pcm);
        }
    }

    if ch == 1 {
        Ok(channels[0].clone())
    } else {
        Ok(crate::pcm::interleave_i16(&channels))
    }
}

fn encode_v4(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    let ch = channels.max(1) as usize;
    let per_ch = deinterleave(samples, ch);

    let frame_size = FRAME_SIZE_V3;
    let frames_per_ch = per_ch
        .iter()
        .map(|c| (c.len() + frame_size - 1) / frame_size)
        .max()
        .unwrap_or(0) as u32;

    let mut out = vec![0x43, VERSION_V4];
    out.push(ch as u8);
    out.push(preset as u8);
    out.extend(&frames_per_ch.to_le_bytes());

    let base_step = quant::step_for_preset(preset);

    for channel in &per_ch {
        let mut i = 0;
        while i < channel.len() {
            let end = (i + frame_size).min(channel.len());
            let mut frame: Vec<f32> = channel[i..end]
                .iter()
                .map(|&s| s as f32 / 32768.0)
                .collect();
            frame.resize(frame_size, 0.0);
            let rms = quant::frame_rms(&frame);
            let hf = quant::frame_hf_ratio(&frame);
            let scale = quant::adaptive_step_scale(rms, hf);
            let step = base_step * scale;
            let q = quant::quantize(&frame, step);
            let (flag, payload) = pack::pack_frame(&q);
            out.push(flag);
            out.push(quant::step_scale_to_u8(scale));
            let len = payload.len().min(0xffff) as u16;
            out.extend(&len.to_le_bytes());
            out.extend(&payload[..len as usize]);
            i += frame_size;
        }
    }

    out
}

fn decode_v3(data: &[u8]) -> Result<Vec<i16>, String> {
    if data.len() < 8 {
        return Err("MP5-C v3 header short".into());
    }
    let ch = data[2].max(1) as usize;
    let preset = Preset::from_u8(data[3]).ok_or("bad preset")?;
    let frames_per_ch = u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize;
    let base_step = quant::step_for_preset_v3(preset);
    decode_v3_frames(data, ch, frames_per_ch, base_step, FRAME_HDR_V3, true)
}

fn decode_v4(data: &[u8]) -> Result<Vec<i16>, String> {
    if data.len() < 8 {
        return Err("MP5-C v4 header short".into());
    }
    let ch = data[2].max(1) as usize;
    let preset = Preset::from_u8(data[3]).ok_or("bad preset")?;
    let frames_per_ch = u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize;
    let base_step = quant::step_for_preset(preset);
    decode_v3_frames(data, ch, frames_per_ch, base_step, FRAME_HDR_V4, false)
}

fn decode_v3_frames(
    data: &[u8],
    ch: usize,
    frames_per_ch: usize,
    base_step: f32,
    hdr_len: usize,
    mid_side: bool,
) -> Result<Vec<i16>, String> {
    let frame_size = FRAME_SIZE_V3;
    let mut pos = 8;
    let mut channels: Vec<Vec<i16>> = vec![vec![]; ch];

    for c in 0..ch {
        for _ in 0..frames_per_ch {
            if pos >= data.len() {
                break;
            }
            let flag = data[pos];
            pos += 1;
            let step = if hdr_len >= FRAME_HDR_V4 {
                if pos >= data.len() {
                    return Err("truncated v4 step scale".into());
                }
                let scale = quant::step_scale_from_u8(data[pos]);
                pos += 1;
                base_step * scale
            } else {
                base_step
            };
            if pos + 2 > data.len() {
                return Err("truncated frame header".into());
            }
            let len = u16::from_le_bytes(data[pos..pos + 2].try_into().unwrap()) as usize;
            pos += 2;
            if pos + len > data.len() {
                return Err("truncated MP5-C frame".into());
            }
            let payload = &data[pos..pos + len];
            pos += len;
            let coeffs = pack::unpack_frame(flag, payload, frame_size)?;
            let spec = quant::dequantize(&coeffs, step);
            let pcm: Vec<i16> = spec
                .iter()
                .map(|&x| (x.clamp(-1.0, 1.0) * 32767.0).round() as i16)
                .collect();
            channels[c].extend(pcm);
        }
    }

    if mid_side && ch == 2 {
        channels = from_mid_side(&channels);
    }

    if ch == 1 {
        Ok(channels[0].clone())
    } else {
        Ok(crate::pcm::interleave_i16(&channels))
    }
}

fn decode_v2(data: &[u8]) -> Result<Vec<i16>, String> {
    let ch = data[2].max(1) as usize;
    let preset = Preset::from_u8(data[3]).ok_or("bad preset")?;
    let frames_per_ch = u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize;
    let step = quant::step_for_preset(preset);
    let frame_size = FRAME_SIZE_V2;
    let mut pos = 8;
    let mut channels: Vec<Vec<i16>> = vec![vec![]; ch];

    for c in 0..ch {
        for _ in 0..frames_per_ch {
            if pos + 8 > data.len() {
                break;
            }
            let _local_idx = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap());
            let len = u32::from_le_bytes(data[pos + 4..pos + 8].try_into().unwrap()) as usize;
            pos += 8;
            if pos + len > data.len() {
                return Err("truncated MP5-C frame".into());
            }
            let coeffs = quant::unpack_coeffs(&data[pos..pos + len], frame_size)?;
            pos += len;
            let spec = quant::dequantize(&coeffs, step);
            let pcm: Vec<i16> = spec
                .iter()
                .map(|&x| (x.clamp(-1.0, 1.0) * 32767.0).round() as i16)
                .collect();
            channels[c].extend(pcm);
        }
    }

    if ch == 1 {
        Ok(channels[0].clone())
    } else {
        Ok(crate::pcm::interleave_i16(&channels))
    }
}

pub fn peak_error(original: &[i16], decoded: &[i16]) -> f32 {
    let n = original.len().min(decoded.len());
    let mut max = 0f32;
    for i in 0..n {
        let e = (original[i] as f32 - decoded[i] as f32).abs() / 32768.0;
        if e > max {
            max = e;
        }
    }
    max
}

pub fn rms_error(original: &[i16], decoded: &[i16]) -> f32 {
    let n = original.len().min(decoded.len());
    if n == 0 {
        return 0.0;
    }
    let mut sum = 0f64;
    for i in 0..n {
        let e = (original[i] as f64 - decoded[i] as f64) / 32768.0;
        sum += e * e;
    }
    (sum / n as f64).sqrt() as f32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pcm::{i16_to_f32, snr_db};

    #[test]
    fn roundtrip_snr_standard() {
        let samples: Vec<i16> = (0..FRAME_SIZE_V3 * 4)
            .map(|i| ((i as f32 * 0.02).sin() * 16000.0) as i16)
            .collect();
        let enc = encode(&samples, 1, Preset::Standard);
        assert_eq!(enc[1], VERSION_V51);
        let dec = decode(&enc).unwrap();
        let n = samples.len();
        let snr = snr_db(&i16_to_f32(&samples), &i16_to_f32(&dec[..n]));
        assert!(snr > 28.0, "SNR too low: {snr}");
    }

    #[test]
    fn extreme_preset_roundtrip() {
        let samples: Vec<i16> = (0..FRAME_SIZE_V3 * 4)
            .map(|i| ((i as f32 * 0.02).sin() * 16000.0) as i16)
            .collect();
        let enc = encode(&samples, 1, Preset::Extreme);
        let dec = decode(&enc).unwrap();
        let snr = snr_db(&i16_to_f32(&samples), &i16_to_f32(&dec[..samples.len()]));
        assert!(snr > 22.0, "Extreme SNR too low: {snr}");
    }

    #[test]
    fn stereo_roundtrip() {
        let n = FRAME_SIZE_V3 * 2;
        let mut samples = vec![0i16; n * 2];
        for i in 0..n {
            samples[i * 2] = ((i as f32 * 0.01).sin() * 12000.0) as i16;
            samples[i * 2 + 1] = ((i as f32 * 0.013).cos() * 12000.0) as i16;
        }
        let enc = encode(&samples, 2, Preset::Standard);
        let dec = decode(&enc).unwrap();
        let snr = snr_db(&i16_to_f32(&samples), &i16_to_f32(&dec[..samples.len()]));
        assert!(snr > 20.0, "stereo SNR: {snr}");
    }

    #[test]
    fn silence_compresses_smaller_than_pcm() {
        let samples = vec![0i16; FRAME_SIZE_V3 * 8];
        let enc = encode(&samples, 2, Preset::Standard);
        let pcm_bytes = samples.len() * 2;
        assert!(
            enc.len() < pcm_bytes / 4,
            "silence: enc {} pcm {}",
            enc.len(),
            pcm_bytes
        );
    }

    #[test]
    fn mp5c_silence_decodes_exact() {
        let report = blocker::run_blocker_suite(48000, 2).expect("blocker suite");
        assert!(
            report.silence_tests.iter().all(|t| t.passes_silence_gate),
            "silence must decode bit-exact; got {:?}",
            report
                .silence_tests
                .iter()
                .map(|t| (t.preset.clone(), t.max_abs_decoded, t.non_zero_samples))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn mp5c_transparency_gate_fails_until_redesign() {
        let report = blocker::run_blocker_suite(48000, 2).expect("blocker suite");
        assert!(
            !report.transparency_gate_pass,
            "gate should fail until quiet listening is clean: {}",
            report.verdict
        );
    }

    #[test]
    fn music_like_beats_pcm_at_standard() {
        let sr = 44100usize;
        let n = sr * 30;
        let mut samples = vec![0i16; n * 2];
        for i in 0..n {
            let t = i as f32 / sr as f32;
            let kick = ((t * 2.0).sin() * 32767.0 * 0.4) as i16;
            let hat = (((t * 40.0).sin() * 0.1) * 32767.0) as i16;
            let bass = ((t * 110.0 * std::f32::consts::TAU).sin() * 20000.0) as i16;
            let melody = ((t * 440.0 * std::f32::consts::TAU).sin() * 8000.0) as i16;
            let v = kick / 3 + hat / 3 + bass / 3 + melody / 3;
            samples[i * 2] = v;
            samples[i * 2 + 1] = ((v as f32 * 0.95) as i16);
        }
        let enc = encode(&samples, 2, Preset::Standard);
        let pcm_bytes = samples.len() * 2;
        let ratio = enc.len() as f64 / pcm_bytes as f64;
        assert!(
            ratio < 0.92,
            "30s music-like Standard should beat PCM, ratio {ratio:.4}"
        );
    }

    #[test]
    fn v2_legacy_decode_still_works() {
        let samples: Vec<i16> = (0..FRAME_SIZE_V2 * 2)
            .map(|i| ((i as f32 * 0.02).sin() * 16000.0) as i16)
            .collect();
        let enc = encode_v2_legacy(&samples, 1, Preset::Standard);
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), samples.len());
    }

    fn encode_v2_legacy(samples: &[i16], channels: u8, preset: Preset) -> Vec<u8> {
    let ch = channels.max(1) as usize;
    let per_ch = if ch == 1 {
        vec![samples.to_vec()]
    } else {
        crate::pcm::deinterleave_i16(samples, ch)
    };
    let frame_size = FRAME_SIZE_V2;
    let frames_per_ch = per_ch
        .iter()
        .map(|c| (c.len() + frame_size - 1) / frame_size)
        .max()
        .unwrap_or(0) as u32;
    let mut out = vec![0x43, VERSION_V2];
    out.push(ch as u8);
    out.push(preset as u8);
    out.extend(&frames_per_ch.to_le_bytes());
    let step = quant::step_for_preset(preset);
    for channel in &per_ch {
        let mut i = 0;
        let mut local_idx = 0u32;
        while i < channel.len() {
            let end = (i + frame_size).min(channel.len());
            let mut frame: Vec<f32> = channel[i..end]
                .iter()
                .map(|&s| s as f32 / 32768.0)
                .collect();
            frame.resize(frame_size, 0.0);
            let q = quant::quantize(&frame, step);
            let payload = quant::pack_coeffs(&q);
            out.extend(&local_idx.to_le_bytes());
            out.extend(&(payload.len() as u32).to_le_bytes());
            out.extend(&payload);
            local_idx += 1;
            i += frame_size;
        }
    }
    out
    }
}
