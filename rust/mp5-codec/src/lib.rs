pub mod mp5c;
pub mod mp5c2;
pub mod mp5c3;
pub mod mp5c6;
pub mod mp5h;
pub mod mp5l;
pub mod pcm;

use mp5c::Preset;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn encode_mp5l(samples: &[i16], channels: u8) -> Vec<u8> {
    mp5l::encode(samples, channels)
}

/// Experimental MP5-L v4 framing with seek table, stored QLP, and width-safe stereo.
#[wasm_bindgen]
pub fn encode_mp5l_v4(samples: &[i16], channels: u8) -> Vec<u8> {
    mp5l::encode_v4(samples, channels)
}

/// Progressive v4 encoder (bit-identical to [`encode_mp5l_v4`]).
#[wasm_bindgen]
pub struct Mp5lV4StreamEncoder {
    inner: mp5l::Mp5lV4StreamEncoder,
}

#[wasm_bindgen]
impl Mp5lV4StreamEncoder {
    #[wasm_bindgen(constructor)]
    pub fn new(samples: &[i16], channels: u8) -> Mp5lV4StreamEncoder {
        Self {
            inner: mp5l::Mp5lV4StreamEncoder::new(samples, channels),
        }
    }

    #[wasm_bindgen(js_name = frameCount)]
    pub fn frame_count(&self) -> u32 {
        self.inner.frame_count() as u32
    }

    #[wasm_bindgen(js_name = framesDone)]
    pub fn frames_done(&self) -> u32 {
        self.inner.frames_done() as u32
    }

    /// Encode one planned frame. Returns false when finished.
    #[wasm_bindgen(js_name = encodeNextFrame)]
    pub fn encode_next_frame(&mut self) -> bool {
        self.inner.encode_next_frame()
    }

    pub fn finish(self) -> Vec<u8> {
        self.inner.finish()
    }
}

/// Flat `[start0, end0, start1, end1, …]` sample ranges for multi-worker frame encode.
#[wasm_bindgen]
pub fn plan_mp5l_v4_boundaries(samples: &[i16], channels: u8) -> Vec<u32> {
    mp5l::plan_mp5l_v4_frame_ranges(samples, channels)
        .into_iter()
        .flat_map(|(s, e)| [s, e])
        .collect()
}

/// Encode one v4 frame payload for `[start, end)` (sample index on channel 0).
#[wasm_bindgen]
pub fn encode_mp5l_v4_frame(samples: &[i16], channels: u8, start: u32, end: u32) -> Vec<u8> {
    mp5l::encode_mp5l_v4_frame_range(samples, channels, start, end).1
}

/// Assemble ordered frame payloads into a full v4 bitstream (bit-identical when
/// frames match serial encode order from [`plan_mp5l_v4_boundaries`]).
#[wasm_bindgen]
pub fn assemble_mp5l_v4(channels: u8, sample_offsets: &[u32], frames_concat: &[u8], frame_lengths: &[u32]) -> Vec<u8> {
    let mut payloads = Vec::with_capacity(frame_lengths.len());
    let mut cursor = 0usize;
    for &len in frame_lengths {
        let end = cursor + len as usize;
        payloads.push(frames_concat[cursor..end].to_vec());
        cursor = end;
    }
    let offsets: Vec<u64> = sample_offsets.iter().map(|&o| o as u64).collect();
    mp5l::assemble_mp5l_v4_frames(channels, &offsets, &payloads)
}

#[wasm_bindgen]
pub fn decode_mp5l(data: &[u8]) -> Result<Vec<i16>, JsValue> {
    mp5l::decode(data).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub struct Mp5lStreamDecoder {
    inner: mp5l::StreamDecoder,
}

#[wasm_bindgen]
impl Mp5lStreamDecoder {
    #[wasm_bindgen(constructor)]
    pub fn new(data_prefix: &[u8]) -> Result<Mp5lStreamDecoder, JsValue> {
        Ok(Self {
            inner: mp5l::StreamDecoder::new(data_prefix)
                .map_err(|error| JsValue::from_str(&error))?,
        })
    }

    pub fn push(&mut self, data: &[u8]) -> Result<Vec<i16>, JsValue> {
        self.inner
            .push(data)
            .map_err(|error| JsValue::from_str(&error))
    }

    /// Decode until `max_channel_samples` channel-frames are emitted (or EOF).
    pub fn push_until(
        &mut self,
        data: &[u8],
        max_channel_samples: usize,
    ) -> Result<Vec<i16>, JsValue> {
        self.inner
            .push_until(data, Some(max_channel_samples))
            .map_err(|error| JsValue::from_str(&error))
    }

    pub fn seek_frame(&mut self, sample_index: usize) -> Result<(), JsValue> {
        self.inner
            .seek_frame(sample_index)
            .map_err(|error| JsValue::from_str(&error))
    }
}

#[wasm_bindgen]
pub fn encode_mp5c(samples: &[i16], channels: u8, preset: u8) -> Vec<u8> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::Standard);
    mp5c::encode(samples, channels, p)
}

#[wasm_bindgen]
pub fn decode_mp5c(data: &[u8]) -> Result<Vec<i16>, JsValue> {
    mp5c::decode(data).map_err(|e| JsValue::from_str(&e))
}

fn wrap_mp5h_layers(base: &[u8], corr: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(10 + base.len() + corr.len());
    out.extend_from_slice(&[0x48, 0x01]);
    out.extend(&(base.len() as u32).to_le_bytes());
    out.extend_from_slice(base);
    out.extend(&(corr.len() as u32).to_le_bytes());
    out.extend_from_slice(corr);
    out
}

#[wasm_bindgen]
pub fn encode_mp5h(samples: &[i16], channels: u8, preset: u8) -> Vec<u8> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::Standard);
    let (base, corr) = mp5h::encode(samples, channels, p);
    wrap_mp5h_layers(&base, &corr)
}

/// Encode MP5-H trying presets ≥ `min_preset`; keep smallest bit-exact base+CORR.
#[wasm_bindgen]
pub fn encode_mp5h_min(samples: &[i16], channels: u8, min_preset: u8) -> Vec<u8> {
    let p = Preset::from_u8(min_preset).unwrap_or(Preset::Standard);
    let (base, corr, _) = mp5h::encode_min_size(samples, channels, p);
    wrap_mp5h_layers(&base, &corr)
}

#[wasm_bindgen]
pub fn decode_mp5h(data: &[u8], enhanced: bool) -> Result<Vec<i16>, JsValue> {
    if data.len() < 6 || data[0] != 0x48 {
        return Err(JsValue::from_str("invalid MP5-H wrapper"));
    }
    let base_len = u32::from_le_bytes(data[2..6].try_into().unwrap()) as usize;
    if data.len() < 6 + base_len + 4 {
        return Err(JsValue::from_str("truncated MP5-H"));
    }
    let base = &data[6..6 + base_len];
    let corr_off = 6 + base_len;
    let corr_len = u32::from_le_bytes(data[corr_off..corr_off + 4].try_into().unwrap()) as usize;
    let corr = if corr_off + 4 + corr_len <= data.len() {
        Some(&data[corr_off + 4..corr_off + 4 + corr_len])
    } else {
        None
    };
    let mode = if enhanced {
        mp5h::DecodeMode::Enhanced
    } else {
        mp5h::DecodeMode::BaseOnly
    };
    mp5h::decode(base, corr, mode).map_err(|e| JsValue::from_str(&e))
}

/// MP5-C2 / vNext encode (protect 1.5, signal-relative loud path). Assumes 44.1 kHz.
/// Prefer [`encode_mp5c_vnext_at`] when sample rate is known.
#[wasm_bindgen]
pub fn encode_mp5c_vnext(samples: &[i16], channels: u8, preset: u8) -> Vec<u8> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    mp5c2::encode(samples, channels, p)
}

/// MP5-C2 encode with explicit sample rate (Hz) for HF / protect timing.
#[wasm_bindgen]
pub fn encode_mp5c_vnext_at(
    samples: &[i16],
    channels: u8,
    preset: u8,
    sample_rate: u32,
) -> Vec<u8> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    mp5c2::encode_at_rate(samples, channels, p, sample_rate)
}

/// Lab: encode vNext with widened quiet/tail protection (`protect_scale` ≥ 1.0).
#[wasm_bindgen]
pub fn encode_mp5c_vnext_protect(
    samples: &[i16],
    channels: u8,
    preset: u8,
    protect_scale: f64,
) -> Vec<u8> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    let protect = mp5c2::ProtectParams::widened(protect_scale);
    mp5c2::encode_with_protect(samples, channels, p, protect)
}

/// Lab: same as protect encode but with sample rate.
#[wasm_bindgen]
pub fn encode_mp5c_vnext_protect_at(
    samples: &[i16],
    channels: u8,
    preset: u8,
    protect_scale: f64,
    sample_rate: u32,
) -> Vec<u8> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    let protect = mp5c2::ProtectParams::widened(protect_scale);
    mp5c2::encode_with_protect_at_rate_public(samples, channels, p, protect, sample_rate)
}

/// MP5-C2 with MDCT loud path (lab-only). Quiet/fragile/tail stay MP5-L.
#[wasm_bindgen]
pub fn encode_mp5c_vnext_mdct(samples: &[i16], channels: u8, preset: u8) -> Vec<u8> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    mp5c2::encode_mdct(samples, channels, p)
}

/// Lab/test: force legacy TAG_LOSSY loud path (classic MP5-C) for metric A/B.
#[wasm_bindgen]
pub fn encode_mp5c_vnext_legacy_loud(samples: &[i16], channels: u8, preset: u8) -> Vec<u8> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    mp5c2::encode_legacy_lossy_loud(samples, channels, p, mp5c2::ProtectParams::widened(1.5))
}

#[wasm_bindgen]
pub fn decode_mp5c_vnext(data: &[u8]) -> Result<Vec<i16>, JsValue> {
    mp5c2::decode(data).map_err(|e| JsValue::from_str(&e))
}

/// MP5-C3 MDCT lab spike (experimental). Distinct magic 0x4D 0x33. Not a public
/// stream and not written into normal `.mp5` exports — audio quality lab only.
#[wasm_bindgen]
pub fn encode_mp5c3(samples: &[i16], channels: u8, preset: u8) -> Vec<u8> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    mp5c3::encode(samples, channels, p)
}

#[wasm_bindgen]
pub fn decode_mp5c3(data: &[u8]) -> Result<Vec<i16>, JsValue> {
    mp5c3::decode(data).map_err(|e| JsValue::from_str(&e))
}

/// MP5-C (CodecId 6) encode: MDCT loud path, bit-exact protect islands.
/// Experimental lossy stream — see `docs/MP5C_NEXT_SPEC.md`.
#[wasm_bindgen]
pub fn encode_mp5c6(
    samples: &[i16],
    channels: u8,
    preset: u8,
    sample_rate: u32,
) -> Result<Vec<u8>, JsValue> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    mp5c6::encode(samples, channels, p, sample_rate).map_err(|e| JsValue::from_str(&e))
}

/// MP5-C (CodecId 6) decode. Fails closed on bad magic, CRC, bounds or frame counts.
#[wasm_bindgen]
pub fn decode_mp5c6(data: &[u8]) -> Result<Vec<i16>, JsValue> {
    mp5c6::decode(data).map_err(|e| JsValue::from_str(&e))
}

/// MP5-C (CodecId 6) seek decode (Phase 5.4): decode only the units covering
/// `[start_frame, start_frame + num_frames)`. Same fail-closed validation as
/// `decode_mp5c6`; units are indexable and need no preroll.
#[wasm_bindgen]
pub fn decode_mp5c6_range(
    data: &[u8],
    start_frame: u32,
    num_frames: u32,
) -> Result<Vec<i16>, JsValue> {
    mp5c6::decode_range(data, start_frame, num_frames).map_err(|e| JsValue::from_str(&e))
}

/// MP5-C (CodecId 6) encode with a deterministic rate target (Phase 4.3).
/// `rate_mode`: 0 = unconstrained (ignores `target_kbps`), 1 = ABR, 2 = CBR.
/// ABR/CBR hit the target within ±3% track-average; protect islands consume
/// budget ahead of the MDCT pool and are disclosed via `inspect_unit_mix`.
#[wasm_bindgen]
pub fn encode_mp5c6_at(
    samples: &[i16],
    channels: u8,
    preset: u8,
    sample_rate: u32,
    target_kbps: u16,
    rate_mode: u8,
) -> Result<Vec<u8>, JsValue> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    let mode = match rate_mode {
        0 => mp5c6::RateMode::Off,
        1 => mp5c6::RateMode::Abr {
            kbps: target_kbps as u32,
        },
        2 => mp5c6::RateMode::Cbr {
            kbps: target_kbps as u32,
        },
        other => return Err(JsValue::from_str(&format!("unknown rate_mode {other} (0=off, 1=ABR, 2=CBR)"))),
    };
    mp5c6::encode_with_rate(samples, channels, p, sample_rate, mode).map_err(|e| JsValue::from_str(&e))
}

/// MP5-C (CodecId 6) VBR encode: `qi` is a quality index in 1/4-log2 step-grid
/// units (positive = finer/larger, negative = coarser/smaller). No rate target.
#[wasm_bindgen]
pub fn encode_mp5c6_vbr(
    samples: &[i16],
    channels: u8,
    preset: u8,
    sample_rate: u32,
    qi: i32,
) -> Result<Vec<u8>, JsValue> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    mp5c6::encode_with_rate(samples, channels, p, sample_rate, mp5c6::RateMode::Vbr { qi })
        .map_err(|e| JsValue::from_str(&e))
}

/// MP5-C (CodecId 6) with full options: rate target plus Phase 5 features.
/// `rate_mode`: 0 = unconstrained, 1 = ABR, 2 = CBR. `joint_stereo` enables
/// the Phase 5.1 per-band M/S coding; `window_switching` enables the Phase
/// 5.2 long/start/short/stop block sequence; `psycho` enables the Phase 5.3
/// psychoacoustic step allocation (all profile 3).
#[wasm_bindgen]
pub fn encode_mp5c6_opt(
    samples: &[i16],
    channels: u8,
    preset: u8,
    sample_rate: u32,
    target_kbps: u16,
    rate_mode: u8,
    joint_stereo: bool,
    window_switching: bool,
    psycho: bool,
) -> Result<Vec<u8>, JsValue> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::High);
    let mode = match rate_mode {
        0 => mp5c6::RateMode::Off,
        1 => mp5c6::RateMode::Abr {
            kbps: target_kbps as u32,
        },
        2 => mp5c6::RateMode::Cbr {
            kbps: target_kbps as u32,
        },
        other => {
            return Err(JsValue::from_str(&format!(
                "unknown rate_mode {other} (0=off, 1=ABR, 2=CBR)"
            )))
        }
    };
    let options = mp5c6::EncodeOptions {
        profile_id: if joint_stereo || window_switching || psycho {
            mp5c6::PROFILE_PHASE5
        } else {
            mp5c6::DEFAULT_PROFILE
        },
        joint_stereo,
        window_switching,
        psycho,
    };
    mp5c6::encode_with_options(
        samples,
        channels,
        p,
        mp5c2::ProtectParams::widened(mp5c6::PROTECT_SCALE),
        sample_rate,
        mode,
        options,
    )
    .map_err(|e| JsValue::from_str(&e))
}

/// Walk a CodecId 6 (or CodecId 5) codec stream and report its unit mix as JSON.
/// Shape is documented in `docs/MP5C_NEXT_SPEC.md` sec. 4.4.
#[wasm_bindgen]
pub fn inspect_unit_mix(data: &[u8]) -> Result<String, JsValue> {
    mp5c6::inspect_unit_mix(data)
        .map(|m| m.to_json())
        .map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn snr_db_wasm(original: &[i16], decoded: &[i16]) -> f64 {
    let o = pcm::i16_to_f32(original);
    let d = pcm::i16_to_f32(decoded);
    pcm::snr_db(&o, &d)
}

/// NMR reject-filter screen (Phase 5.3, spec §5): per-band noise vs masking
/// threshold of the source. JSON: {maxNmrDb, meanNmrDb, frames, channels}.
/// Reject filter only — never a transparency proof.
#[wasm_bindgen]
pub fn nmr_screen_wasm(
    original: &[i16],
    decoded: &[i16],
    channels: u8,
    sample_rate: u32,
) -> Result<String, JsValue> {
    let r = mp5c3::nmr_screen(original, decoded, channels, sample_rate)
        .map_err(|e| JsValue::from_str(&e))?;
    Ok(format!(
        "{{\"maxNmrDb\":{:.3},\"meanNmrDb\":{:.3},\"frames\":{},\"channels\":{}}}",
        r.max_nmr_db, r.mean_nmr_db, r.frames, r.channels
    ))
}
