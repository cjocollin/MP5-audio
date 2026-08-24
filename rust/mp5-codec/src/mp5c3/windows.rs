//! Window switching for the MDCT loud path (Phase 5.2).
//!
//! Four block types with TDAC-legal overlap geometry. The MDCT in use aliases
//! within each half (`M−1−q` in the left half, `3M−1−q` in the right half —
//! measured by impulse probe), so two frames A (2M_A coeffs... length 2M_A
//! samples) and B (length 2M_B) reconstruct exactly only when B starts at
//!
//! ```text
//! b = a + (3·M_A − M_B) / 2
//! ```
//!
//! (alias sources then coincide and cancel pairwise). With LONG = 2048
//! (M = 1024) and SHORT = 512 (M = 256): LONG→LONG = +1024, START→SHORT =
//! +1408, SHORT→STOP = −128 (STOP overlaps the last short), everything else
//! long-sized = +1024. Slopes are complementary sine halves, so
//! `w_a² + w_b² = 1` on every overlap and reconstruction is exact in float
//! (proven by the OLA test oracle).
//!
//! Layout:
//!
//! ```text
//! LONG   2048: [ sine 1024 | sine 1024 ]
//! START  2048: [ sine-long 1024 | flat 384 | slope-short 256 | zero 384 ]
//! SHORT   512: [ sine 256 | sine 256 ]
//! STOP   2048: [ zero 384 | slope-short 256 | flat 384 | sine-long 1024 ]
//! ```
//!
//! Legal transitions: LONG→{LONG,START}, START→{SHORT,STOP},
//! SHORT→{SHORT,STOP}, STOP→{LONG,START}. Anything else is rejected
//! (fail-closed).

use super::mdct::sine_window;

pub const LONG_LEN: usize = 2048;
pub const SHORT_LEN: usize = 512;
pub const LONG_HOP: usize = 1024;
pub const SHORT_HOP: usize = 256;

/// Sub-block length used by the transient detector (one SHORT hop).
pub const SUB_BLOCK: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BlockType {
    Long = 0,
    Start = 1,
    Short = 2,
    Stop = 3,
}

impl BlockType {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(BlockType::Long),
            1 => Some(BlockType::Start),
            2 => Some(BlockType::Short),
            3 => Some(BlockType::Stop),
            _ => None,
        }
    }

    /// Frame length in samples.
    pub fn len(self) -> usize {
        match self {
            BlockType::Long | BlockType::Start | BlockType::Stop => LONG_LEN,
            BlockType::Short => SHORT_LEN,
        }
    }

    /// MDCT coefficient count (`len / 2`).
    pub fn coeffs(self) -> usize {
        self.len() / 2
    }

    /// Legal successor block types (encoder never writes others; the decoder
    /// fails closed on any violation).
    pub fn legal_next(self) -> &'static [BlockType] {
        match self {
            BlockType::Long => &[BlockType::Long, BlockType::Start],
            BlockType::Start => &[BlockType::Short, BlockType::Stop],
            BlockType::Short => &[BlockType::Short, BlockType::Stop],
            BlockType::Stop => &[BlockType::Long, BlockType::Start],
        }
    }

    /// Distance from this frame's start to the next frame's start, given the
    /// next frame's type (the TDAC coincidence rule). `None` for illegal
    /// transitions.
    pub fn advance_to(self, next: BlockType) -> Option<i64> {
        if !self.legal_next().contains(&next) {
            return None;
        }
        let m_a = (self.len() / 2) as i64;
        let m_b = (next.len() / 2) as i64;
        Some((3 * m_a - m_b) / 2)
    }

    /// Window shape (length == `self.len()`).
    pub fn window(self) -> Vec<f32> {
        match self {
            BlockType::Long => sine_window(LONG_LEN),
            BlockType::Short => sine_window(SHORT_LEN),
            BlockType::Start => {
                let mut w = vec![0f32; LONG_LEN];
                let long = sine_window(LONG_LEN);
                let short = sine_window(SHORT_LEN);
                w[..LONG_HOP].copy_from_slice(&long[..LONG_HOP]);
                for v in &mut w[LONG_HOP..1408] {
                    *v = 1.0;
                }
                w[1408..1664].copy_from_slice(&short[256..512]);
                // [1664..2048) stays zero: covered by the short blocks' own OLA.
                w
            }
            BlockType::Stop => {
                let mut w = vec![0f32; LONG_LEN];
                let long = sine_window(LONG_LEN);
                let short = sine_window(SHORT_LEN);
                // [0..384) stays zero: covered by the short blocks' own OLA.
                w[384..640].copy_from_slice(&short[..256]);
                for v in &mut w[640..LONG_HOP] {
                    *v = 1.0;
                }
                w[LONG_HOP..].copy_from_slice(&long[LONG_HOP..]);
                w
            }
        }
    }
}

/// Compute the start position of every frame in a type sequence (encoder and
/// decoder must agree bit-for-bit). Fails closed on illegal transitions.
pub fn positions_of(types: &[BlockType]) -> Result<Vec<usize>, String> {
    let mut out = Vec::with_capacity(types.len());
    let mut pos = 0i64;
    for (i, &ty) in types.iter().enumerate() {
        if pos < 0 {
            return Err("window sequence underflowed sample zero".into());
        }
        out.push(pos as usize);
        if let Some(&next) = types.get(i + 1) {
            pos += ty
                .advance_to(next)
                .ok_or_else(|| format!("illegal window sequence {ty:?} -> {next:?}"))?;
        }
    }
    Ok(out)
}

/// Plan the block sequence for one channel signal (already padded with
/// `HOP` zeros on both sides by the caller).
///
/// Returns `(start, type)` pairs covering `[0, samples.len())` under the
/// advance rule; the buffer must be readable up to `start + type.len()`
/// (callers zero-extend `samples` by `LONG_LEN` once).
///
/// The decision is a deterministic transient detector: a 256-sample sub-block
/// is a transient when its energy exceeds `attack_ratio` times the recent peak
/// (and an absolute floor). A transient in the short-coverable region of a long window
/// ([pos+1408, pos+2048)) opens a START; short blocks continue while
/// transient activity is within the next 1024 samples.
pub fn plan_blocks(samples: &[f32], attack_ratio: f32) -> Vec<(usize, BlockType)> {
    let n_sub = samples.len() / SUB_BLOCK + 2;
    let mut energy = vec![0f32; n_sub];
    for (j, e) in energy.iter_mut().enumerate() {
        let s = j * SUB_BLOCK;
        if s >= samples.len() {
            break;
        }
        let end = (s + SUB_BLOCK).min(samples.len());
        *e = samples[s..end].iter().map(|x| x * x).sum::<f32>() / (end - s) as f32;
    }
    let mut transient = vec![false; n_sub];
    for j in 1..n_sub {
        // Compare against the recent *peak* (last ~21 ms, >= 2 cycles of the
        // lowest bass band), not the previous sub-block: a decaying bass ring
        // puts successive 256-sample sub-blocks on different phases of the
        // cycle, so the adjacent-ratio rule false-fires 4+ times per second
        // during the ring (measured on a real quiet intro: constant
        // start/stop churn, and each burst re-prices the joint bitmap — the
        // "bass birdie" artifact). A true attack still exceeds the recent
        // peak by 8x; the ring's decaying peaks never do.
        let lo = j.saturating_sub(4);
        let mut peak = 0f32;
        for &e in &energy[lo..j] {
            if e > peak {
                peak = e;
            }
        }
        // Loudness gate: the surge must also clear a running mean (~170 ms).
        // Dip-and-recover cycles of a bass line (808 slides) can spike 8-27x
        // over a momentary trough while staying *below* the recent loud
        // context — their pre-echo is post-masked by that context, so
        // switching there buys nothing and only adds window-boundary splatter.
        let lo2 = j.saturating_sub(32);
        let mean = energy[lo2..j].iter().sum::<f32>() / (j - lo2).max(1) as f32;
        if energy[j] > peak * attack_ratio && energy[j] > mean * 6.0 && energy[j] > 1e-6 {
            transient[j] = true;
        }
    }
    let any_transient_in = |from: usize, to: usize| -> bool {
        let j0 = from / SUB_BLOCK;
        let j1 = ((to + SUB_BLOCK - 1) / SUB_BLOCK).min(n_sub);
        (j0..j1).any(|j| transient[j])
    };

    let mut types: Vec<BlockType> = Vec::new();
    let total = samples.len();
    let mut pos = 0usize;
    let mut short_mode = false;
    while pos < total {
        if !short_mode {
            // Look one long frame ahead so the START lands early enough for
            // the short blocks to actually cover the attack (shorts only
            // reach [pos+1408, ...)).
            if any_transient_in(pos + 1408, (pos + 3072).min(total + 1)) {
                types.push(BlockType::Start);
                short_mode = true;
                pos += 1408; // first short block starts here (TDAC rule)
            } else {
                types.push(BlockType::Long);
                pos += 1024;
            }
        } else if any_transient_in(pos + SHORT_HOP, (pos + 2048).min(total + 1)) {
            types.push(BlockType::Short);
            pos += 256;
        } else {
            types.push(BlockType::Stop);
            short_mode = false;
            // The STOP overlaps the last short (at pos-256) and starts at
            // pos-384 by the TDAC rule; the next LONG lands at pos+640.
            pos += 640;
        }
    }
    // Exact positions derive from the type list via the TDAC coincidence rule.
    let starts = match positions_of(&types) {
        Ok(s) => s,
        Err(e) => unreachable!("encoder produced an illegal sequence: {e}"),
    };
    starts.into_iter().zip(types).collect()
}

/// Validate a full block sequence (decoder side): transitions must be legal.
pub fn validate_sequence(types: &[BlockType]) -> Result<(), String> {
    positions_of(types).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::super::mdct::{analyze_frame, synthesize_frame};
    use super::*;

    /// Float OLA oracle: analyze/synthesize a legal sequence and require
    /// near-exact reconstruction. If this passes, the window geometry and the
    /// advance algebra are TDAC-legal.
    fn float_roundtrip_seq(samples: &[f32], seq: &[(usize, BlockType)]) -> Vec<f32> {
        let mut padded = vec![0f32; samples.len() + LONG_LEN];
        padded[..samples.len()].copy_from_slice(samples);
        let mut out = vec![0f32; samples.len() + LONG_LEN];
        for &(pos, ty) in seq {
            let w = ty.window();
            let frame = &padded[pos..pos + ty.len()];
            let coeffs = analyze_frame(frame, &w);
            let y = synthesize_frame(&coeffs, &w);
            for (i, &v) in y.iter().enumerate() {
                out[pos + i] += v;
            }
        }
        out[..samples.len()].to_vec()
    }

    fn snr_db(a: &[f32], b: &[f32]) -> f64 {
        let (mut sig, mut err) = (0f64, 0f64);
        for i in 0..a.len() {
            sig += (a[i] as f64).powi(2);
            err += ((a[i] - b[i]) as f64).powi(2);
        }
        10.0 * (sig / err.max(1e-30)).log10()
    }

    #[test]
    fn float_ola_exact_on_all_long_sequence() {
        let n = 4096 * 2;
        let x: Vec<f32> = (0..n).map(|i| ((i as f32) * 0.03).sin() * 0.5).collect();
        let seq = plan_blocks(&x, 8.0);
        let y = float_roundtrip_seq(&x, &seq);
        let s = snr_db(&x[1024..n - 1024], &y[1024..n - 1024]);
        assert!(s > 80.0, "long-only float OLA SNR {s:.1}");
    }

    #[test]
    fn float_ola_exact_forced_every_transition() {
        // Forced sequence exercising every legal transition:
        // LONG → START → SHORT → SHORT → STOP → LONG → START → STOP → LONG.
        let n = 16384;
        let x: Vec<f32> = (0..n)
            .map(|i| ((i as f32) * 0.021).sin() * 0.4 + ((i as f32) * 0.005).cos() * 0.2)
            .collect();
        let types = vec![
            BlockType::Long,
            BlockType::Start,
            BlockType::Short,
            BlockType::Short,
            BlockType::Stop,
            BlockType::Long,
            BlockType::Start,
            BlockType::Stop,
            BlockType::Long,
            BlockType::Long,
            BlockType::Long,
            BlockType::Long,
            BlockType::Long,
            BlockType::Long,
            BlockType::Long,
            BlockType::Long,
        ];
        let starts = positions_of(&types).unwrap();
        let seq: Vec<(usize, BlockType)> = starts.into_iter().zip(types).collect();
        let y = float_roundtrip_seq(&x, &seq);
        // Interior (away from the zero-pad edges) must reconstruct exactly.
        let s = snr_db(&x[1024..n - 2048], &y[1024..n - 2048]);
        assert!(s > 80.0, "mixed-sequence float OLA SNR {s:.1}");
    }

    #[test]
    fn float_ola_exact_on_impulse_train() {
        // Impulses at awkward phases: worst case for the geometry.
        let n = 12288;
        let mut x = vec![0f32; n];
        for (k, &p) in [1500usize, 4000, 7777, 11000].iter().enumerate() {
            x[p] = if k % 2 == 0 { 0.9 } else { -0.9 };
        }
        let seq = plan_blocks(&x, 8.0);
        assert!(validate_sequence(&seq.iter().map(|&(_, t)| t).collect::<Vec<_>>()).is_ok());
        let y = float_roundtrip_seq(&x, &seq);
        let s = snr_db(&x[1024..n - 2048], &y[1024..n - 2048]);
        assert!(s > 70.0, "impulse float OLA SNR {s:.1}");
    }

    #[test]
    fn plan_blocks_switches_around_attacks() {
        let n = 8192;
        let mut x = vec![0f32; n];
        for i in 4096..n {
            x[i] = ((i as f32) * 0.07).sin() * 0.6;
        }
        let seq = plan_blocks(&x, 8.0);
        let types: Vec<BlockType> = seq.iter().map(|&(_, t)| t).collect();
        assert!(
            types.contains(&BlockType::Start),
            "must open a START near the attack"
        );
        assert!(
            types.contains(&BlockType::Stop),
            "must close the short episode"
        );
        assert!(validate_sequence(&types).is_ok());
    }

    #[test]
    fn high_attack_ratio_still_switches_after_quiet_audio() {
        let n = 8192;
        let mut x = vec![0f32; n];
        for (i, sample) in x.iter_mut().enumerate() {
            let amplitude = if i < 4096 { 0.01 } else { 0.6 };
            *sample = (i as f32 * 0.07).sin() * amplitude;
        }
        let types: Vec<BlockType> = plan_blocks(&x, 256.0).iter().map(|&(_, t)| t).collect();
        assert!(types.contains(&BlockType::Start));
        assert!(types.contains(&BlockType::Stop));
        assert!(validate_sequence(&types).is_ok());
    }

    #[test]
    fn bass_ring_does_not_retrigger_switches() {
        // A decaying bass ring after one attack (kick-drum shape): the attack
        // may switch once, but the ring must not re-trigger. Two close
        // partials beat at 5 Hz, so adjacent 256-sample sub-blocks swing
        // >8x in energy — the old adjacent-ratio rule opened start/stop
        // bursts 4+ times per second here (the "bass birdie" churn measured
        // on a real quiet intro). The recent-peak + running-mean gates must
        // hold the ring to a single switch.
        let n = 48000; // 1 s at 48 kHz
        let mut x = vec![0f32; n];
        for (i, s) in x.iter_mut().enumerate() {
            let t = i as f32 / 48000.0;
            let env = if t < 0.2 {
                0.02f32
            } else {
                0.8 * (-(t - 0.2) * 9.0).exp()
            };
            let wobble = 0.5 * (2.0 * std::f32::consts::PI * 73.0 * t).sin()
                + 0.5 * (2.0 * std::f32::consts::PI * 78.0 * t).sin();
            *s = env * wobble;
        }
        let seq = plan_blocks(&x, 8.0);
        let starts = seq
            .iter()
            .filter(|&&(_, ty)| ty == BlockType::Start)
            .count();
        assert!(
            starts <= 2,
            "bass ring re-triggered {starts} START blocks (want at most the attack + one)"
        );
        assert!(starts >= 1, "the attack itself must still switch");
    }

    #[test]
    fn illegal_sequences_are_rejected() {
        assert!(validate_sequence(&[BlockType::Long, BlockType::Short]).is_err());
        assert!(validate_sequence(&[BlockType::Short, BlockType::Long]).is_err());
        assert!(validate_sequence(&[BlockType::Long, BlockType::Stop]).is_err());
        assert!(validate_sequence(&[BlockType::Stop, BlockType::Short]).is_err());
        assert!(validate_sequence(&[BlockType::Start, BlockType::Long]).is_err());
        assert!(validate_sequence(&[
            BlockType::Long,
            BlockType::Start,
            BlockType::Short,
            BlockType::Stop,
            BlockType::Long,
        ])
        .is_ok());
    }
}
