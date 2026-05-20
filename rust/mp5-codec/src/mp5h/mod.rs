pub mod validate;

use crate::mp5c::{self, Preset};
use crate::mp5l;

pub enum DecodeMode {
    BaseOnly,
    Enhanced,
}

pub fn encode(samples: &[i16], channels: u8, preset: Preset) -> (Vec<u8>, Vec<u8>) {
    let base = mp5c::encode(samples, channels, preset);
    let decoded = mp5c::decode(&base).unwrap_or_default();
    let mut residual: Vec<i16> = Vec::with_capacity(samples.len());
    for (i, &s) in samples.iter().enumerate() {
        let d = decoded.get(i).copied().unwrap_or(0);
        let r = (s as i32 - d as i32).clamp(-32768, 32767) as i16;
        residual.push(r);
    }
    let corr = mp5l::encode(&residual, channels);
    (base, corr)
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
        let dec_base = decode(&base, None, DecodeMode::BaseOnly).unwrap();
        let dec_enh = decode(&base, Some(&corr), DecodeMode::Enhanced).unwrap();
        let n = samples.len();
        let snr_base = snr_db(
            &crate::pcm::i16_to_f32(&samples),
            &crate::pcm::i16_to_f32(&dec_base[..n]),
        );
        let snr_enh = snr_db(
            &crate::pcm::i16_to_f32(&samples),
            &crate::pcm::i16_to_f32(&dec_enh[..n]),
        );
        assert!(snr_base < 50.0, "base should be lossy: {snr_base}");
        assert!(snr_enh > 100.0, "enhanced should be near-lossless: {snr_enh}");
        assert_eq!(samples, dec_enh[..n]);
    }
}
