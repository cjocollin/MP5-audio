pub mod validate;

use crate::mp5c::{self, Preset};
use crate::mp5l;

pub enum DecodeMode {
    BaseOnly,
    Enhanced,
}

/// Build residual for CORR. Returns `None` if any difference exceeds i16 range.
fn residual_i16_exact(samples: &[i16], decoded: &[i16]) -> Option<Vec<i16>> {
    let mut residual: Vec<i16> = Vec::with_capacity(samples.len());
    for (i, &s) in samples.iter().enumerate() {
        let d = decoded.get(i).copied().unwrap_or(0);
        let diff = s as i32 - d as i32;
        if diff < i16::MIN as i32 || diff > i16::MAX as i32 {
            return None;
        }
        residual.push(diff as i16);
    }
    Some(residual)
}

/// Encode MP5-H: MP5-C base + MP5-L CORR. Enhanced decode is bit-exact when CORR
/// is present. If residual would clamp past i16, falls back to a zero base so the
/// full signal fits in CORR (still sample-exact; size may grow).
pub fn encode(samples: &[i16], channels: u8, preset: Preset) -> (Vec<u8>, Vec<u8>) {
    let base = mp5c::encode(samples, channels, preset);
    let decoded = mp5c::decode(&base).unwrap_or_default();
    if let Some(residual) = residual_i16_exact(samples, &decoded) {
        let corr = mp5l::encode(&residual, channels);
        return (base, corr);
    }
    // Residual overflow: store silence base + full PCM in CORR (bit-exact escape).
    let silent = vec![0i16; samples.len()];
    let base = mp5c::encode(&silent, channels, preset);
    let corr = mp5l::encode(samples, channels);
    (base, corr)
}

/// Encode trying Standard/High/Extreme bases; keep the smallest verified bit-exact
/// `base + CORR` among presets at least as strong as `min_preset`.
pub fn encode_min_size(
    samples: &[i16],
    channels: u8,
    min_preset: Preset,
) -> (Vec<u8>, Vec<u8>, Preset) {
    let presets = [Preset::Standard, Preset::High, Preset::Extreme];
    let start = presets
        .iter()
        .position(|&p| p as u8 >= min_preset as u8)
        .unwrap_or(0);
    let mut best: Option<(Vec<u8>, Vec<u8>, Preset, usize)> = None;
    for &preset in &presets[start..] {
        let (base, corr) = encode(samples, channels, preset);
        let dec = decode(&base, Some(&corr), DecodeMode::Enhanced).unwrap_or_default();
        if dec.len() < samples.len() || dec[..samples.len()] != *samples {
            continue;
        }
        let total = base.len() + corr.len();
        match &best {
            Some((_, _, _, t)) if total >= *t => {}
            _ => best = Some((base, corr, preset, total)),
        }
    }
    best.map(|(b, c, p, _)| (b, c, p)).unwrap_or_else(|| {
        let (b, c) = encode(samples, channels, min_preset);
        (b, c, min_preset)
    })
}

/// Lab: MP5-C2 bitstream as base + CORR residual vs that base.
/// Returns `(base_c2, corr, ok_bitexact)`.
pub fn encode_with_c2_base(
    samples: &[i16],
    channels: u8,
    preset: Preset,
) -> (Vec<u8>, Vec<u8>, bool) {
    use crate::mp5c2;
    let base = mp5c2::encode(samples, channels, preset);
    let decoded = mp5c2::decode(&base).unwrap_or_default();
    let mut decoded = decoded;
    if decoded.len() > samples.len() {
        decoded.truncate(samples.len());
    } else if decoded.len() < samples.len() {
        decoded.resize(samples.len(), 0);
    }
    // C2 Extreme path is already bit-exact → CORR would be empty/near-empty.
    if decoded == samples {
        let corr = mp5l::encode(&vec![0i16; samples.len()], channels);
        return (base, corr, true);
    }
    match residual_i16_exact(samples, &decoded) {
        Some(residual) => {
            let corr = mp5l::encode(&residual, channels);
            let ok = decode_c2_enhanced(&base, &corr)
                .map(|d| d.len() >= samples.len() && d[..samples.len()] == *samples)
                .unwrap_or(false);
            (base, corr, ok)
        }
        None => (base, Vec::new(), false),
    }
}

fn decode_c2_enhanced(base: &[u8], corr: &[u8]) -> Result<Vec<i16>, String> {
    use crate::mp5c2;
    let mut pcm = mp5c2::decode(base)?;
    let residual = mp5l::decode(corr)?;
    for (i, r) in residual.iter().enumerate() {
        if i < pcm.len() {
            pcm[i] = (pcm[i] as i32 + *r as i32).clamp(-32768, 32767) as i16;
        }
    }
    Ok(pcm)
}

/// Enhanced decode: `mp5c_decode(base) + mp5l_decode(corr)` — restores original PCM when corr is present.
pub fn decode(base: &[u8], corr: Option<&[u8]>, mode: DecodeMode) -> Result<Vec<i16>, String> {
    let mut pcm = mp5c::decode(base)?;
    if matches!(mode, DecodeMode::Enhanced) {
        if let Some(c) = corr {
            let residual = mp5l::decode(c)?;
            for (i, r) in residual.iter().enumerate() {
                if i < pcm.len() {
                    pcm[i] = (pcm[i] as i32 + *r as i32).clamp(-32768, 32767) as i16;
                }
            }
        }
    }
    Ok(pcm)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mp5c::Preset;
    use crate::pcm::snr_db;

    #[test]
    fn base_only_without_corr_is_lossy() {
        let samples: Vec<i16> = (0..8000)
            .map(|i| ((i as f32 * 0.05).sin() * 8000.0) as i16)
            .collect();
        let (base, _corr) = encode(&samples, 1, Preset::High);
        let dec = decode(&base, None, DecodeMode::BaseOnly).unwrap();
        let n = samples.len().min(dec.len());
        let snr = snr_db(
            &crate::pcm::i16_to_f32(&samples[..n]),
            &crate::pcm::i16_to_f32(&dec[..n]),
        );
        assert!(snr < 50.0, "base-only should be lossy: {snr}");
        assert_ne!(samples[..n], dec[..n]);
    }

    #[test]
    fn enhanced_with_corr_matches_original_all_presets() {
        let samples: Vec<i16> = (0..24000)
            .map(|i| ((i as f32 * 0.03).sin() * 10000.0 + (i as f32 * 0.001).cos() * 2000.0) as i16)
            .collect();
        for preset in [Preset::Standard, Preset::High, Preset::Extreme] {
            let (base, corr) = encode(&samples, 1, preset);
            assert!(!corr.is_empty(), "CORR must be present for {preset:?}");
            let dec = decode(&base, Some(&corr), DecodeMode::Enhanced).unwrap();
            assert_eq!(samples, dec[..samples.len()]);
        }
    }

    #[test]
    fn enhanced_roundtrip_is_lossless_on_sine() {
        let samples: Vec<i16> = (0..48000)
            .map(|i| ((i as f32 * 0.02).sin() * 12000.0) as i16)
            .collect();
        let (base, corr) = encode(&samples, 1, Preset::High);
        let dec = decode(&base, Some(&corr), DecodeMode::Enhanced).unwrap();
        assert_eq!(samples, dec[..samples.len()]);
        let snr_enh = snr_db(
            &crate::pcm::i16_to_f32(&samples),
            &crate::pcm::i16_to_f32(&dec[..samples.len()]),
        );
        assert!(
            snr_enh > 100.0,
            "enhanced should be near-lossless: {snr_enh}"
        );
    }

    #[test]
    fn full_scale_square_wave_is_bit_exact() {
        let samples: Vec<i16> = (0..4096)
            .map(|i| if i % 2 == 0 { i16::MAX } else { i16::MIN })
            .collect();
        let (base, corr) = encode(&samples, 1, Preset::Extreme);
        let dec = decode(&base, Some(&corr), DecodeMode::Enhanced).unwrap();
        assert_eq!(samples, dec[..samples.len()]);
    }

    #[test]
    fn residual_overflow_detected() {
        let a = vec![i16::MAX, i16::MIN];
        let b = vec![i16::MIN, i16::MAX];
        assert!(residual_i16_exact(&a, &b).is_none());
    }

    #[test]
    fn encode_min_size_is_bit_exact_and_not_larger_than_high() {
        let samples: Vec<i16> = (0..8000)
            .map(|i| ((i as f32 * 0.04).sin() * 14000.0) as i16)
            .collect();
        let (base_h, corr_h) = encode(&samples, 1, Preset::High);
        let (base, corr, _preset) = encode_min_size(&samples, 1, Preset::Standard);
        let dec = decode(&base, Some(&corr), DecodeMode::Enhanced).unwrap();
        assert_eq!(samples, dec[..samples.len()]);
        assert!(base.len() + corr.len() <= base_h.len() + corr_h.len());
    }
}
