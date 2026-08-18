//! Psychoacoustic step allocation for the MDCT loud path (Phase 5.3).
//!
//! Replaces the `noise_frac` / `low_mask` heuristics with a real masking
//! model: absolute threshold of hearing (ATH), a bark-domain spreading
//! function, per-band tonality, and post-transient temporal masking. The
//! model is **encoder-side only** — steps are written into the bitstream, so
//! decode is unchanged and no syntax revision is needed.
//!
//! Everything is deterministic (all state derives from the signal), and the
//! model needs the sample rate for band-edge frequencies — which is exactly
//! why CodecId 6 carries `sample_rate_hz` from day one (plan locked
//! decision). A rate of 0 falls back to 44100 Hz.

/// Bands per frame (must match `NUM_BANDS` in `mp5c3::mod`).
pub const PSY_BANDS: usize = 32;

/// dB SPL ↔ dBFS anchor: a coefficient RMS of 1.0 maps to 96 dB SPL
/// (16-bit full-scale convention).
const FULL_SCALE_DB_SPL: f32 = 96.0;

/// Conservative margin subtracted from every computed threshold (dB). The raw
/// masking model is an idealized bound; real codecs run several dB below it.
const MASKING_MARGIN_DB: f32 = 6.0;

/// Loud-band SNR floor: the threshold may never rise closer than this many dB
/// to the band's own level, so tonal/loud bands keep a sane objective margin
/// even when the spreading function would permit more noise.
const LOUD_BAND_SNR_FLOOR_DB: f32 = 22.0;

/// Own-band SNR floor for fully *tonal* bands (interpolated from
/// [`LOUD_BAND_SNR_FLOOR_DB`] by the band's tonality). A dominant tonal
/// coefficient quantizes to a same-frequency error tone whose frame-to-frame
/// amplitude wobble is audible far below the flat-SNR operating point (the
/// quiet-intro "bass birdie": ~12 dB error plateaus at 100-200 Hz after beat
/// onsets at 43 dB in-band SNR). Noise-like bands tolerate the flat floor;
/// tonal bands need much more.
const TONAL_BAND_SNR_FLOOR_DB: f32 = 40.0;



/// Absolute threshold of hearing in dB SPL (Terhardt approximation).
fn ath_db_spl(freq_hz: f32) -> f32 {
    let f = (freq_hz / 1000.0).max(0.01);
    3.64 * f.powf(-0.8) - 6.5 * (-0.6 * (f - 3.3).powi(2)).exp() + 1e-3 * f.powi(4)
}

/// Frequency (Hz) → bark scale (analytic form used by MPEG psycho models).
fn bark(freq_hz: f32) -> f32 {
    let f = freq_hz;
    (26.81 * f) / (1960.0 + f) - 0.53
}

/// Precomputed per-band geometry and hearing floor for one frame size/rate.
#[derive(Clone, Debug)]
pub struct PsychoModel {
    sample_rate: u32,
    /// Band center frequencies (Hz).
    band_hz: Vec<f32>,
    /// Band center barks.
    band_bark: Vec<f32>,
    /// ATH per band in dBFS (allowed noise level with no maskers).
    ath_dbfs: Vec<f32>,
    /// Threshold floor in dBFS — anchored to the encoder's own step floor so
    /// the model never promises finer than the codec can write (PsychoModel
    /// with a floor above the codec floor is how noise goes un-shaped).
    floor_db: f32,
}

/// Per-band quantities the frame loop needs to advance temporal masking.
#[derive(Clone, Copy, Debug, Default)]
pub struct TemporalState {
    /// Current post-transient allowance boost in dB (decays over time).
    pub boost_db: f32,
}

impl PsychoModel {
    /// Build the model for one sample rate and frame coefficient count.
    /// `floor_step` is the codec's own step floor (`quiet_floor(preset)`);
    /// the model's threshold floor tracks it exactly.
    pub fn new(sample_rate: u32, n_coeffs: usize, band_edges: &[(usize, usize)], floor_step: f32) -> Self {
        let sr = if sample_rate == 0 { 44100 } else { sample_rate } as f32;
        let mut band_hz = Vec::with_capacity(band_edges.len());
        let mut band_bark = Vec::with_capacity(band_edges.len());
        let mut ath_dbfs = Vec::with_capacity(band_edges.len());
        for &(s, e) in band_edges {
            let mid = (s + e) as f32 * 0.5;
            // MDCT bin k of 2N-frame: frequency = k / N * sr... the analysis
            // frame length is 2*n_coeffs samples, so bin width is sr/(2*n_coeffs).
            let hz = mid * sr / (2.0 * n_coeffs as f32);
            let b = bark(hz);
            band_hz.push(hz);
            band_bark.push(b);
            ath_dbfs.push(ath_db_spl(hz) - FULL_SCALE_DB_SPL);
        }
        let floor_db = 20.0 * (floor_step.max(1e-12) / 12.0f32.sqrt()).log10();
        Self {
            sample_rate: if sample_rate == 0 { 44100 } else { sample_rate },
            band_hz,
            band_bark,
            ath_dbfs,
            floor_db,
        }
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Per-band masking thresholds in **dBFS** (allowed noise level per band).
    pub fn thresholds_db(&self, band_rms: &[f32], band_peak: &[f32], temporal: &TemporalState) -> Vec<f32> {
        let nb = self.band_hz.len();
        debug_assert_eq!(band_rms.len(), nb);
        // Band levels in dBFS.
        let mut level = vec![0f32; nb];
        let mut tonal = vec![0f32; nb];
        for b in 0..nb {
            let rms = band_rms[b].max(1e-12);
            // Band level in dBFS (coefficient RMS of 1.0 = 0 dBFS = 96 dB SPL).
            level[b] = 20.0 * rms.log10();
            // Tonality from peak/RMS: a tonal band's energy concentrates in a
            // few coefficients.
            let ratio = band_peak[b].max(1e-12) / rms;
            tonal[b] = ((ratio - 1.5) / 4.0).clamp(0.0, 1.0);
        }

        // Global masking curve: max over maskers i of (L_i + spread(i->j) - offset_i).
        let mut out = vec![0f32; nb];
        for j in 0..nb {
            let mut mask = f32::NEG_INFINITY;
            for i in 0..nb {
                if level[i] < -100.0 {
                    continue;
                }
                let dz = self.band_bark[j] - self.band_bark[i];
                if dz.abs() > 12.0 {
                    continue;
                }
                let spread = if dz >= 0.0 {
                    -27.0 * dz
                } else {
                    // MPEG-style lower slope: shallower for louder maskers.
                    // The formula expects the masker level in dB SPL.
                    let l_spl = level[i] + FULL_SCALE_DB_SPL;
                    (24.0 + 0.23 / (self.band_hz[i] / 1000.0).max(0.1) - 0.2 * l_spl) * dz
                };
                // Tonal maskers mask less: offset grows with tonality.
                let offset = 5.5 + 9.0 * tonal[i];
                let mut m = level[i] + spread - offset;
                if i == j {
                    // Loud-band SNR floor: a band's *own* contribution may not
                    // push its threshold closer than this to its own level.
                    // Tonal bands interpolate toward the stricter tonal floor —
                    // their quantization error is a same-frequency tone, not
                    // spread noise, and stays audible at flat-SNR levels.
                    // (Neighbor masking on quiet bands is legitimate and must
                    // NOT be vetoed by the quiet band's own level.)
                    let floor_db = LOUD_BAND_SNR_FLOOR_DB
                        + (TONAL_BAND_SNR_FLOOR_DB - LOUD_BAND_SNR_FLOOR_DB) * tonal[j];
                    m = m.min(level[j] - floor_db);
                }
                if m > mask {
                    mask = m;
                }
            }
            // Threshold = max(ATH, masking curve) + temporal boost, then the
            // conservative margin and the codec noise floor.
            let thr = self.ath_dbfs[j].max(mask) + temporal.boost_db - MASKING_MARGIN_DB;
            out[j] = thr.max(self.floor_db);
        }
        out
    }

    /// Per-band masking thresholds in **coefficient-step units** (the quant
    /// step that puts quantization noise at the masked threshold).
    ///
    /// `band_rms` / `band_peak` are measured on the (scaled) MDCT coefficients
    /// by the caller; `temporal.boost_db` is the running post-transient
    /// allowance, advanced by [`PsychoModel::advance_temporal`].
    pub fn thresholds(&self, band_rms: &[f32], band_peak: &[f32], temporal: &TemporalState) -> Vec<f32> {
        // Rounding-quantizer noise RMS is step/sqrt(12), so
        // step = sqrt(12) * 10^(thr/20).
        let sqrt12 = 12.0f32.sqrt();
        self.thresholds_db(band_rms, band_peak, temporal)
            .into_iter()
            .map(|db| sqrt12 * (db / 20.0 * std::f32::consts::LOG2_10).exp2())
            .collect()
    }

    /// Advance the temporal-masking state by one record.
    ///
    /// `frame_energy_now` / `frame_energy_prev` are mean-square energies of
    /// the *time-domain* frame and its predecessor; `advance_ms` is the record
    /// duration in milliseconds (window-switching records vary).
    pub fn advance_temporal(&self, temporal: &mut TemporalState, surge: bool, advance_ms: f32) {
        // Post-masking: after an energy surge, allow a few dB of extra noise
        // decaying over ~20-30 ms (halve every 10 ms).
        temporal.boost_db *= (0.5f32).powf(advance_ms / 10.0);
        if surge {
            temporal.boost_db = temporal.boost_db.max(6.0);
        }
        if temporal.boost_db < 0.1 {
            temporal.boost_db = 0.0;
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    fn edges(n: usize, bands: usize) -> Vec<(usize, usize)> {
        let mut v = Vec::new();
        let mut prev = 0;
        for b in 1..=bands {
            let t = b as f32 / bands as f32;
            let end = ((t * t) * n as f32).round() as usize;
            let end = end.max(prev + 1).min(n);
            v.push((prev, end));
            prev = end;
        }
        v
    }

    #[test]
    fn ath_curve_has_the_expected_shape() {
        // ATH minimum around 3-4 kHz, rising at low and high frequencies.
        let low = ath_db_spl(100.0);
        let mid = ath_db_spl(3500.0);
        let high = ath_db_spl(15000.0);
        assert!(mid < low, "ATH at 3.5kHz {mid} should be below 100Hz {low}");
        assert!(mid < high, "ATH at 3.5kHz {mid} should be below 15kHz {high}");
    }

    #[test]
    fn loud_band_masks_neighbors() {
        let edges = edges(1024, PSY_BANDS);
        let model = PsychoModel::new(44100, 1024, &edges, 0.0018);
        // Realistic levels: quiet bands at -60 dBFS, one loud tonal band at 5.
        let mut rms = vec![1e-3f32; PSY_BANDS];
        let mut peak = vec![1e-3f32; PSY_BANDS];
        rms[5] = 0.3;
        peak[5] = 0.9;
        let thr = model.thresholds(&rms, &peak, &TemporalState::default());
        // Lower-side neighbors of the loud band must show a masking benefit
        // over distant bands; the immediate upper neighbor legitimately hits
        // the codec noise floor on this fixture (upper slope is steeper).
        assert!(thr[3] > thr[20], "band 3 thr {} should exceed band 20 {}", thr[3], thr[20]);
        assert!(thr[4] > thr[20], "band 4 thr {} should exceed band 20 {}", thr[4], thr[20]);
        assert!(thr[5] > thr[20], "loud band thr {} should exceed band 20 {}", thr[5], thr[20]);
        // And the ATH floor must hold everywhere (thresholds are positive).
        assert!(thr.iter().all(|&t| t > 0.0 && t.is_finite()));
    }

    #[test]
    fn temporal_boost_decays() {
        let edges = edges(1024, PSY_BANDS);
        let model = PsychoModel::new(44100, 1024, &edges, 0.0018);
        let mut st = TemporalState::default();
        model.advance_temporal(&mut st, true, 23.0);
        let boosted = st.boost_db;
        assert!(boosted >= 6.0, "surge must set the boost, got {boosted}");
        model.advance_temporal(&mut st, false, 23.0);
        model.advance_temporal(&mut st, false, 23.0);
        assert!(st.boost_db < boosted / 2.0, "boost must decay, got {}", st.boost_db);
    }
}
