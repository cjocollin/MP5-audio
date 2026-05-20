pub mod pcm;
pub mod mp5l;
pub mod mp5c;
pub mod mp5h;

use mp5c::Preset;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn encode_mp5l(samples: &[i16], channels: u8) -> Vec<u8> {
    mp5l::encode(samples, channels)
}

#[wasm_bindgen]
pub fn decode_mp5l(data: &[u8]) -> Result<Vec<i16>, JsValue> {
    mp5l::decode(data).map_err(|e| JsValue::from_str(&e))
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

#[wasm_bindgen]
pub fn encode_mp5h(samples: &[i16], channels: u8, preset: u8) -> Vec<u8> {
    let p = Preset::from_u8(preset).unwrap_or(Preset::Standard);
    let (base, corr) = mp5h::encode(samples, channels, p);
    let mut out = vec![0x48, 0x01];
    out.extend(&(base.len() as u32).to_le_bytes());
    out.extend(&base);
    out.extend(&(corr.len() as u32).to_le_bytes());
    out.extend(&corr);
    out
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

#[wasm_bindgen]
pub fn snr_db_wasm(original: &[i16], decoded: &[i16]) -> f64 {
    let o = pcm::i16_to_f32(original);
    let d = pcm::i16_to_f32(decoded);
    pcm::snr_db(&o, &d)
}
