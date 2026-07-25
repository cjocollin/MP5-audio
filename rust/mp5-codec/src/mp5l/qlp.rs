//! Stored quantized linear prediction for MP5-L v4.
//!
//! v4 layout (breaking / disposable experimental):
//! `[order u8][shift u8][coeffs i16LE x order]
//!  [warmup i16LE x order][parts u8][escape_bits u8][packed ks]
//!  [escaped Rice over N-order body residuals]`
//!
//! Warm-ups are stored verbatim (not Rice). Pre-freeze warm-up-in-Rice v4 is invalid.

use std::collections::HashSet;

use super::rice::{
    best_partitioned_ks_with_bits, escape_bits_for_residuals, pack_partition_ks,
    rice_decode_partitioned_escape, rice_encode_partitioned_escape, unpack_partition_ks,
};

pub const MAX_QLP_ORDER: usize = 12;
const QLP_SHIFTS: &[u8] = &[8, 9, 10, 11, 12, 13, 14, 15];

#[derive(Clone, Debug)]
struct Candidate {
    order: u8,
    shift: u8,
    coefficients: Vec<i16>,
    residuals: Vec<i32>,
    ks: Vec<u8>,
    escape_bits: u8,
    estimated_bits: usize,
    actual_payload_bytes: usize,
}

fn welch_window(index: usize, len: usize) -> f64 {
    if len <= 1 {
        return 1.0;
    }
    let centered = (2.0 * index as f64 / (len - 1) as f64) - 1.0;
    (1.0 - centered * centered).max(0.0)
}

fn tukey_window(index: usize, len: usize, alpha: f64) -> f64 {
    if len <= 1 {
        return 1.0;
    }
    let x = index as f64 / (len - 1) as f64;
    let edge = alpha / 2.0;
    if x < edge {
        let t = x / edge;
        0.5 * (1.0 - (std::f64::consts::PI * (t - 1.0)).cos())
    } else if x > 1.0 - edge {
        let t = (1.0 - x) / edge;
        0.5 * (1.0 - (std::f64::consts::PI * (t - 1.0)).cos())
    } else {
        1.0
    }
}

fn shortlisted_orders(mut ranked: Vec<(usize, f64)>, max_order: usize) -> HashSet<usize> {
    ranked.sort_by(|left, right| left.1.total_cmp(&right.1));
    let mut selected = HashSet::new();
    // Top-4 (was top-2): speech/audiobook often wants higher LPC than the
    // subsampled score's first pick; we still have native ×RT headroom.
    for &(order, _) in ranked.iter().take(4) {
        selected.insert(order);
    }
    let ambiguous = ranked
        .get(3)
        .zip(ranked.get(4))
        .map(|(fourth, fifth)| fifth.1 <= fourth.1 * 1.05 + 8.0)
        .unwrap_or(false);
    if ambiguous {
        let anchors: Vec<usize> = selected.iter().copied().collect();
        for order in anchors {
            if order > 1 {
                selected.insert(order - 1);
            }
            if order < max_order {
                selected.insert(order + 1);
            }
        }
    }
    // Always keep a high-order anchor when Levinson reached it — cheap metadata,
    // often wins on stationary voiced speech.
    if max_order >= 8 {
        selected.insert(8.min(max_order));
    }
    if max_order >= 12 {
        selected.insert(12.min(max_order));
    }
    selected
}

fn subsampled_order_score_i16(samples: &[i16], coefficients: &[f64]) -> f64 {
    let order = coefficients.len();
    let stride = samples.len().div_ceil(256).max(1);
    let mut score = order as f64 * 32.0;
    for index in (order..samples.len()).step_by(stride) {
        let prediction = coefficients
            .iter()
            .enumerate()
            .map(|(offset, coefficient)| coefficient * samples[index - 1 - offset] as f64)
            .sum::<f64>();
        score += (1.0 + (samples[index] as f64 - prediction).abs()).log2() * stride as f64;
    }
    score
}

fn subsampled_order_score_i32(samples: &[i32], coefficients: &[f64]) -> f64 {
    let order = coefficients.len();
    let stride = samples.len().div_ceil(256).max(1);
    let mut score = order as f64 * 48.0;
    for index in (order..samples.len()).step_by(stride) {
        let prediction = coefficients
            .iter()
            .enumerate()
            .map(|(offset, coefficient)| coefficient * samples[index - 1 - offset] as f64)
            .sum::<f64>();
        score += (1.0 + (samples[index] as f64 - prediction).abs()).log2() * stride as f64;
    }
    score
}

/// Analyze orders and coefficient precisions. Apodization is encoder-only.
fn candidates(samples: &[i16], use_tukey: bool) -> Vec<Candidate> {
    if samples.len() < 16 {
        return Vec::new();
    }
    let max_order = MAX_QLP_ORDER.min(samples.len() / 2);
    let windowed: Vec<f64> = samples
        .iter()
        .enumerate()
        .map(|(index, &sample)| {
            let w = if use_tukey {
                tukey_window(index, samples.len(), 0.5)
            } else {
                welch_window(index, samples.len())
            };
            sample as f64 * w
        })
        .collect();
    let mut autocorrelation = vec![0f64; max_order + 1];
    for lag in 0..=max_order {
        autocorrelation[lag] = (lag..windowed.len())
            .map(|index| windowed[index] * windowed[index - lag])
            .sum();
    }
    if !autocorrelation[0].is_finite() || autocorrelation[0] <= 0.0 {
        return Vec::new();
    }

    let mut coefficients = vec![0f64; max_order];
    let mut error = autocorrelation[0];
    let mut order_models = Vec::new();
    for index in 0..max_order {
        let correction: f64 = (0..index)
            .map(|j| coefficients[j] * autocorrelation[index - j])
            .sum();
        let reflection = (autocorrelation[index + 1] - correction) / error;
        if !reflection.is_finite() || reflection.abs() >= 1.0 {
            break;
        }
        let previous = coefficients.clone();
        coefficients[index] = reflection;
        for j in 0..index {
            coefficients[j] = previous[j] - reflection * previous[index - 1 - j];
        }
        error *= 1.0 - reflection * reflection;
        if !error.is_finite() || error <= 0.0 {
            break;
        }

        order_models.push(coefficients[..=index].to_vec());
    }
    let selected_orders = shortlisted_orders(
        order_models
            .iter()
            .map(|model| (model.len(), subsampled_order_score_i16(samples, model)))
            .collect(),
        max_order,
    );
    let mut output = Vec::new();
    let mut seen = HashSet::new();
    for model in order_models {
        let order = model.len();
        if !selected_orders.contains(&order) {
            continue;
        }
        for &shift in QLP_SHIFTS {
            let scale = (1u32 << shift) as f64;
            let mut quantized = Vec::with_capacity(order);
            for &coefficient in &model {
                let value = (coefficient * scale).round();
                if !value.is_finite() || value < i16::MIN as f64 || value > i16::MAX as f64 {
                    quantized.clear();
                    break;
                }
                quantized.push(value as i16);
            }
            if quantized.len() != order {
                continue;
            }
            if !seen.insert((shift, quantized.clone())) {
                continue;
            }
            let Some(body) = body_residuals(samples, shift, &quantized) else {
                continue;
            };
            if escape_bits_for_residuals(&body) > 16 {
                continue;
            }
            let (ks, rice_bits) = best_partitioned_ks_with_bits(&body, 16);
            // Cost model: metadata + verbatim warm-ups + body Rice only.
            let estimated_bits = (4 + quantized.len() * 2 + order * 2) * 8
                + ks.len() * 4
                + rice_bits;
            let actual_payload_bytes = 4
                + quantized.len() * 2
                + order * 2
                + ks.len().div_ceil(2)
                + rice_bits.div_ceil(8);
            output.push(Candidate {
                order: order as u8,
                shift,
                coefficients: quantized,
                residuals: body,
                ks,
                escape_bits: 16,
                estimated_bits,
                actual_payload_bytes,
            });
        }
    }
    output
}

fn prediction(history: &[i16], index: usize, shift: u8, coefficients: &[i16]) -> i64 {
    let sum = coefficients
        .iter()
        .enumerate()
        .fold(0i64, |acc, (j, &coefficient)| {
            acc + coefficient as i64 * history[index - 1 - j] as i64
        });
    sum >> shift
}

/// Full residual stream including warm-ups as sample values (analysis / tax only).
pub fn residuals_including_warmups(
    samples: &[i16],
    shift: u8,
    coefficients: &[i16],
) -> Option<Vec<i32>> {
    let order = coefficients.len();
    (0..samples.len())
        .map(|index| {
            if index < order {
                Some(samples[index] as i32)
            } else {
                let residual =
                    samples[index] as i64 - prediction(samples, index, shift, coefficients);
                i32::try_from(residual).ok()
            }
        })
        .collect()
}

fn body_residuals(samples: &[i16], shift: u8, coefficients: &[i16]) -> Option<Vec<i32>> {
    let order = coefficients.len();
    (order..samples.len())
        .map(|index| {
            let residual = samples[index] as i64 - prediction(samples, index, shift, coefficients);
            i32::try_from(residual).ok()
        })
        .collect()
}

fn reconstruct_from_warmup(
    warmups: &[i16],
    body: &[i32],
    shift: u8,
    coefficients: &[i16],
) -> Result<Vec<i16>, String> {
    let order = coefficients.len();
    if warmups.len() != order {
        return Err("QLP warm-up count mismatch".into());
    }
    let mut samples = Vec::with_capacity(order + body.len());
    samples.extend_from_slice(warmups);
    for (offset, &residual) in body.iter().enumerate() {
        let index = order + offset;
        let mut sum = 0i64;
        for (j, &coefficient) in coefficients.iter().enumerate() {
            let product = (coefficient as i64)
                .checked_mul(samples[index - 1 - j] as i64)
                .ok_or("QLP FIR multiply overflow")?;
            sum = sum.checked_add(product).ok_or("QLP FIR sum overflow")?;
        }
        let predicted = sum >> shift;
        let value = predicted
            .checked_add(residual as i64)
            .ok_or("QLP reconstruction overflow")?;
        if value < i16::MIN as i64 || value > i16::MAX as i64 {
            return Err("QLP sample exceeds i16".into());
        }
        samples.push(value as i16);
    }
    Ok(samples)
}

/// Layout: `[order][shift][coeffs][warmups][parts][escape_bits][packed ks][Rice]`.
fn encode_candidate(samples: &[i16], candidate: &Candidate) -> Option<Vec<u8>> {
    let order_usize = candidate.order as usize;
    if order_usize == 0
        || candidate.coefficients.len() != order_usize
        || samples.len() < order_usize
    {
        return None;
    }
    let packed_ks = pack_partition_ks(&candidate.ks);
    let packed =
        rice_encode_partitioned_escape(&candidate.residuals, &candidate.ks, candidate.escape_bits);
    let mut payload = Vec::with_capacity(candidate.actual_payload_bytes);
    payload.push(candidate.order);
    payload.push(candidate.shift);
    for &coefficient in &candidate.coefficients {
        payload.extend_from_slice(&coefficient.to_le_bytes());
    }
    for &sample in &samples[..order_usize] {
        payload.extend_from_slice(&sample.to_le_bytes());
    }
    payload.push(candidate.ks.len() as u8);
    payload.push(candidate.escape_bits);
    payload.extend_from_slice(&packed_ks);
    payload.extend_from_slice(&packed);
    Some(payload)
}

fn ranked_candidates(mut analyzed: Vec<Candidate>) -> Vec<Candidate> {
    analyzed.sort_unstable_by_key(|candidate| candidate.estimated_bits);
    analyzed
}

/// How many size-ranked QLP candidates to materialize / estimate.
const QLP_MATERIALIZE_TOP: usize = 8;

fn record_top4_coverage(analyzed: &[Candidate]) {
    if let Some((best_index, _)) = analyzed
        .iter()
        .enumerate()
        .min_by_key(|(_, candidate)| candidate.actual_payload_bytes)
    {
        super::diag::record_qlp_top4_check(best_index >= QLP_MATERIALIZE_TOP);
    }
}

fn estimated_top4_payload_bytes(analyzed: &[Candidate]) -> Option<usize> {
    analyzed
        .iter()
        .take(QLP_MATERIALIZE_TOP)
        .map(|candidate| candidate.actual_payload_bytes)
        .min()
}

fn tukey_margin_is_promising(welch: &[Candidate]) -> bool {
    // Gate Tukey Levinson: only when Welch top candidates are within ~2%
    // (was 1%). Always-on Tukey blew ×RT from ~5× down to ~0.3× on Hades.
    let mut top_sizes: Vec<usize> = welch
        .iter()
        .take(QLP_MATERIALIZE_TOP)
        .map(|candidate| candidate.actual_payload_bytes)
        .collect();
    if top_sizes.is_empty() {
        return true;
    }
    top_sizes.sort_unstable();
    let Some(&runner_up) = top_sizes.get(1) else {
        return true;
    };
    let best = top_sizes[0];
    runner_up <= best.saturating_add((best / 50).max(8))
}

fn encode_ranked_candidates(samples: &[i16], analyzed: &[Candidate]) -> Option<Vec<u8>> {
    record_top4_coverage(analyzed);
    // `actual_payload_bytes` matches `encode_candidate` length by layout; pick the
    // winner among the estimated-bits top-N, then materialize once (bit-identical
    // to min_by_key(Vec::len) over those materializations).
    let winner = analyzed
        .iter()
        .take(QLP_MATERIALIZE_TOP)
        .min_by_key(|candidate| candidate.actual_payload_bytes)?;
    encode_candidate(samples, winner)
}

/// Exact payload-byte estimate for the selected window's top-four policy.
///
/// The estimate includes metadata, verbatim warm-ups, packed `k` nibbles, and
/// final Rice byte padding. It intentionally does not pack or decode a payload.
pub fn estimate_best_qlp_payload_bytes_with_window(
    samples: &[i16],
    prefer_tukey: bool,
) -> Option<usize> {
    let analyzed = ranked_candidates(candidates(samples, prefer_tukey));
    estimated_top4_payload_bytes(&analyzed)
}

/// Encode best QLP payload. `prefer_tukey` selects Tukey(0.5) vs Welch apodization.
pub fn encode_best_qlp_payload_with_window(samples: &[i16], prefer_tukey: bool) -> Option<Vec<u8>> {
    let analyzed = ranked_candidates(candidates(samples, prefer_tukey));
    encode_ranked_candidates(samples, &analyzed)
}

/// Exact materialized-size estimate for the Welch-first/Tukey-gated search.
pub fn estimate_best_qlp_payload_bytes(samples: &[i16]) -> Option<usize> {
    prepare_best_qlp(samples).map(|prep| prep.payload_bytes())
}

/// Analyze i16 QLP once for estimate-then-encode callers.
pub struct PreparedQlp {
    welch: Vec<Candidate>,
    tukey: Option<Vec<Candidate>>,
    use_tukey: bool,
    payload_bytes: usize,
}

impl PreparedQlp {
    pub fn payload_bytes(&self) -> usize {
        self.payload_bytes
    }

    pub fn encode(&self, samples: &[i16]) -> Option<Vec<u8>> {
        if self.use_tukey {
            encode_ranked_candidates(samples, self.tukey.as_ref()?)
        } else {
            encode_ranked_candidates(samples, &self.welch)
        }
    }
}

pub fn prepare_best_qlp(samples: &[i16]) -> Option<PreparedQlp> {
    let welch = ranked_candidates(candidates(samples, false));
    let welch_bytes = estimated_top4_payload_bytes(&welch)?;
    if !tukey_margin_is_promising(&welch) {
        return Some(PreparedQlp {
            welch,
            tukey: None,
            use_tukey: false,
            payload_bytes: welch_bytes,
        });
    }
    let tukey = ranked_candidates(candidates(samples, true));
    let tukey_bytes = estimated_top4_payload_bytes(&tukey);
    match tukey_bytes {
        Some(tb) if tb < welch_bytes => Some(PreparedQlp {
            welch,
            tukey: Some(tukey),
            use_tukey: true,
            payload_bytes: tb,
        }),
        _ => Some(PreparedQlp {
            welch,
            tukey: None,
            use_tukey: false,
            payload_bytes: welch_bytes,
        }),
    }
}

pub fn encode_best_qlp_payload(samples: &[i16]) -> Option<Vec<u8>> {
    prepare_best_qlp(samples)?.encode(samples)
}

pub fn decode_qlp_payload(payload: &[u8], expected_len: usize) -> Result<Vec<i16>, String> {
    if payload.len() < 5 {
        return Err("QLP payload short".into());
    }
    let order = payload[0] as usize;
    let shift = payload[1];
    if order > MAX_QLP_ORDER || shift > 31 {
        return Err("QLP metadata invalid".into());
    }
    let mut position = 2usize;
    let coefficients_end = position
        .checked_add(
            order
                .checked_mul(2)
                .ok_or("QLP coefficient size overflow")?,
        )
        .ok_or("QLP coefficient offset overflow")?;
    if coefficients_end > payload.len() {
        return Err("QLP coefficients truncated".into());
    }
    let mut coefficients = Vec::with_capacity(order);
    while position < coefficients_end {
        coefficients.push(i16::from_le_bytes(
            payload[position..position + 2]
                .try_into()
                .map_err(|_| "QLP coefficient truncated")?,
        ));
        position += 2;
    }
    let count = expected_len;
    if order > count {
        return Err("QLP order exceeds sample count".into());
    }
    let warmup_bytes = order.checked_mul(2).ok_or("QLP warm-up size overflow")?;
    if position
        .checked_add(warmup_bytes)
        .ok_or("QLP warm-up offset overflow")?
        > payload.len()
    {
        return Err("QLP warm-up truncated".into());
    }
    let mut warmups = Vec::with_capacity(order);
    for _ in 0..order {
        warmups.push(i16::from_le_bytes(
            payload[position..position + 2]
                .try_into()
                .map_err(|_| "QLP warm-up truncated")?,
        ));
        position += 2;
    }
    if position + 2 > payload.len() {
        return Err("QLP partitions truncated".into());
    }
    let parts = payload[position] as usize;
    position += 1;
    let escape_bits = payload[position];
    position += 1;
    if !(8..=32).contains(&escape_bits) {
        return Err("QLP escape width invalid".into());
    }
    let packed_ks_len = parts.div_ceil(2);
    if parts == 0 || parts > 16 || position + packed_ks_len > payload.len() {
        return Err("QLP partitions invalid".into());
    }
    let ks = unpack_partition_ks(&payload[position..position + packed_ks_len], parts)?;
    position += packed_ks_len;
    let body_len = count - order;
    let decoded = rice_decode_partitioned_escape(&payload[position..], &ks, body_len, escape_bits)?;
    reconstruct_from_warmup(&warmups, &decoded, shift, &coefficients)
}

// --- i32 side-channel stored QLP (FLAG_I32_QLP = 10) ---

fn i32_candidates(samples: &[i32], use_tukey: bool) -> Vec<Candidate> {
    if samples.len() < 16 {
        return Vec::new();
    }
    let max_order = MAX_QLP_ORDER.min(samples.len() / 2);
    let windowed: Vec<f64> = samples
        .iter()
        .enumerate()
        .map(|(index, &sample)| {
            let w = if use_tukey {
                tukey_window(index, samples.len(), 0.5)
            } else {
                welch_window(index, samples.len())
            };
            sample as f64 * w
        })
        .collect();
    let mut autocorrelation = vec![0f64; max_order + 1];
    for lag in 0..=max_order {
        autocorrelation[lag] = (lag..windowed.len())
            .map(|index| windowed[index] * windowed[index - lag])
            .sum();
    }
    if !autocorrelation[0].is_finite() || autocorrelation[0] <= 0.0 {
        return Vec::new();
    }

    let mut coefficients = vec![0f64; max_order];
    let mut error = autocorrelation[0];
    let mut order_models = Vec::new();
    for index in 0..max_order {
        let correction: f64 = (0..index)
            .map(|j| coefficients[j] * autocorrelation[index - j])
            .sum();
        let reflection = (autocorrelation[index + 1] - correction) / error;
        if !reflection.is_finite() || reflection.abs() >= 1.0 {
            break;
        }
        let previous = coefficients.clone();
        coefficients[index] = reflection;
        for j in 0..index {
            coefficients[j] = previous[j] - reflection * previous[index - 1 - j];
        }
        error *= 1.0 - reflection * reflection;
        if !error.is_finite() || error <= 0.0 {
            break;
        }

        order_models.push(coefficients[..=index].to_vec());
    }
    let selected_orders = shortlisted_orders(
        order_models
            .iter()
            .map(|model| (model.len(), subsampled_order_score_i32(samples, model)))
            .collect(),
        max_order,
    );
    let mut output = Vec::new();
    let mut seen = HashSet::new();
    for model in order_models {
        let order = model.len();
        if !selected_orders.contains(&order) {
            continue;
        }
        for &shift in QLP_SHIFTS {
            let scale = (1u32 << shift) as f64;
            let mut quantized = Vec::with_capacity(order);
            for &coefficient in &model {
                let value = (coefficient * scale).round();
                if !value.is_finite() || value < i16::MIN as f64 || value > i16::MAX as f64 {
                    quantized.clear();
                    break;
                }
                quantized.push(value as i16);
            }
            if quantized.len() != order {
                continue;
            }
            if !seen.insert((shift, quantized.clone())) {
                continue;
            }
            let Some(body) = body_residuals_i32(samples, shift, &quantized) else {
                continue;
            };
            let escape_bits = escape_bits_for_residuals(&body);
            let (ks, rice_bits) = best_partitioned_ks_with_bits(&body, escape_bits);
            let estimated_bits = (4 + quantized.len() * 2 + order * 4) * 8
                + ks.len() * 4
                + rice_bits;
            let actual_payload_bytes = 4
                + quantized.len() * 2
                + order * 4
                + ks.len().div_ceil(2)
                + rice_bits.div_ceil(8);
            output.push(Candidate {
                order: order as u8,
                shift,
                coefficients: quantized,
                residuals: body,
                ks,
                escape_bits,
                estimated_bits,
                actual_payload_bytes,
            });
        }
    }
    output
}

fn prediction_i32(history: &[i32], index: usize, shift: u8, coefficients: &[i16]) -> i64 {
    let sum = coefficients
        .iter()
        .enumerate()
        .fold(0i64, |acc, (j, &coefficient)| {
            acc + coefficient as i64 * history[index - 1 - j] as i64
        });
    sum >> shift
}

fn body_residuals_i32(samples: &[i32], shift: u8, coefficients: &[i16]) -> Option<Vec<i32>> {
    let order = coefficients.len();
    let mut residuals = Vec::with_capacity(samples.len().saturating_sub(order));
    for index in order..samples.len() {
        let predicted = prediction_i32(samples, index, shift, coefficients);
        let value = (samples[index] as i64).checked_sub(predicted)?;
        residuals.push(i32::try_from(value).ok()?);
    }
    Some(residuals)
}

fn reconstruct_i32_from_warmup(
    warmups: &[i32],
    body: &[i32],
    shift: u8,
    coefficients: &[i16],
) -> Result<Vec<i32>, String> {
    let order = coefficients.len();
    if warmups.len() != order {
        return Err("i32 QLP warm-up count mismatch".into());
    }
    let mut samples = Vec::with_capacity(order + body.len());
    samples.extend_from_slice(warmups);
    for (offset, &residual) in body.iter().enumerate() {
        let index = order + offset;
        let mut sum = 0i64;
        for (j, &coefficient) in coefficients.iter().enumerate() {
            let product = (coefficient as i64)
                .checked_mul(samples[index - 1 - j] as i64)
                .ok_or("i32 QLP FIR multiply overflow")?;
            sum = sum.checked_add(product).ok_or("i32 QLP FIR sum overflow")?;
        }
        let predicted = sum >> shift;
        let value = predicted
            .checked_add(residual as i64)
            .ok_or("i32 QLP reconstruction overflow")?;
        samples.push(i32::try_from(value).map_err(|_| "i32 QLP sample exceeds signed width")?);
    }
    Ok(samples)
}

fn encode_i32_candidate(samples: &[i32], candidate: &Candidate) -> Option<Vec<u8>> {
    let order_usize = candidate.order as usize;
    if order_usize == 0
        || candidate.coefficients.len() != order_usize
        || samples.len() < order_usize
    {
        return None;
    }
    let packed_ks = pack_partition_ks(&candidate.ks);
    let packed =
        rice_encode_partitioned_escape(&candidate.residuals, &candidate.ks, candidate.escape_bits);
    let mut payload = Vec::with_capacity(candidate.actual_payload_bytes);
    payload.push(candidate.order);
    payload.push(candidate.shift);
    for &coefficient in &candidate.coefficients {
        payload.extend_from_slice(&coefficient.to_le_bytes());
    }
    for &sample in &samples[..order_usize] {
        payload.extend_from_slice(&sample.to_le_bytes());
    }
    payload.push(candidate.ks.len() as u8);
    payload.push(candidate.escape_bits);
    payload.extend_from_slice(&packed_ks);
    payload.extend_from_slice(&packed);
    Some(payload)
}

fn encode_ranked_i32_candidates(samples: &[i32], analyzed: &[Candidate]) -> Option<Vec<u8>> {
    record_top4_coverage(analyzed);
    let winner = analyzed
        .iter()
        .take(QLP_MATERIALIZE_TOP)
        .min_by_key(|candidate| candidate.actual_payload_bytes)?;
    encode_i32_candidate(samples, winner)
}

pub fn encode_best_i32_qlp_payload_with_window(
    samples: &[i32],
    prefer_tukey: bool,
) -> Option<Vec<u8>> {
    let analyzed = ranked_candidates(i32_candidates(samples, prefer_tukey));
    encode_ranked_i32_candidates(samples, &analyzed)
}

pub fn estimate_best_i32_qlp_payload_bytes_with_window(
    samples: &[i32],
    prefer_tukey: bool,
) -> Option<usize> {
    let analyzed = ranked_candidates(i32_candidates(samples, prefer_tukey));
    estimated_top4_payload_bytes(&analyzed)
}

pub fn estimate_best_i32_qlp_payload_bytes(samples: &[i32]) -> Option<usize> {
    prepare_best_i32_qlp(samples).map(|prep| prep.payload_bytes())
}

pub fn encode_best_i32_qlp_payload(samples: &[i32]) -> Option<Vec<u8>> {
    let welch_candidates = ranked_candidates(i32_candidates(samples, false));
    let welch = encode_ranked_i32_candidates(samples, &welch_candidates);
    if !tukey_margin_is_promising(&welch_candidates) {
        return welch;
    }
    let tukey_candidates = ranked_candidates(i32_candidates(samples, true));
    let tukey_estimate = estimated_top4_payload_bytes(&tukey_candidates);
    let try_tukey = match (&welch, tukey_estimate) {
        (Some(payload), Some(estimate)) => estimate < payload.len(),
        (None, Some(_)) => true,
        _ => false,
    };
    if !try_tukey {
        return welch;
    }
    let tukey = encode_ranked_i32_candidates(samples, &tukey_candidates);
    match (welch, tukey) {
        (Some(a), Some(b)) => Some(if b.len() < a.len() { b } else { a }),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

/// Analyze i32 QLP once for estimate-then-encode callers (stereo side).
pub struct PreparedI32Qlp {
    welch: Vec<Candidate>,
    tukey: Option<Vec<Candidate>>,
    /// Which ranked list to materialize; Welch on ties.
    use_tukey: bool,
    payload_bytes: usize,
}

impl PreparedI32Qlp {
    pub fn payload_bytes(&self) -> usize {
        self.payload_bytes
    }

    pub fn encode(&self, samples: &[i32]) -> Option<Vec<u8>> {
        if self.use_tukey {
            encode_ranked_i32_candidates(samples, self.tukey.as_ref()?)
        } else {
            encode_ranked_i32_candidates(samples, &self.welch)
        }
    }
}

pub fn prepare_best_i32_qlp(samples: &[i32]) -> Option<PreparedI32Qlp> {
    let welch = ranked_candidates(i32_candidates(samples, false));
    let welch_bytes = estimated_top4_payload_bytes(&welch)?;
    if !tukey_margin_is_promising(&welch) {
        return Some(PreparedI32Qlp {
            welch,
            tukey: None,
            use_tukey: false,
            payload_bytes: welch_bytes,
        });
    }
    let tukey = ranked_candidates(i32_candidates(samples, true));
    let tukey_bytes = estimated_top4_payload_bytes(&tukey);
    match tukey_bytes {
        Some(tb) if tb < welch_bytes => Some(PreparedI32Qlp {
            welch,
            tukey: Some(tukey),
            use_tukey: true,
            payload_bytes: tb,
        }),
        _ => Some(PreparedI32Qlp {
            welch,
            tukey: None,
            use_tukey: false,
            payload_bytes: welch_bytes,
        }),
    }
}

pub fn decode_i32_qlp_payload(payload: &[u8], expected_len: usize) -> Result<Vec<i32>, String> {
    if payload.len() < 5 {
        return Err("i32 QLP payload short".into());
    }
    let order = payload[0] as usize;
    let shift = payload[1];
    if order > MAX_QLP_ORDER || shift > 31 {
        return Err("i32 QLP metadata invalid".into());
    }
    let mut position = 2usize;
    let coefficients_end = position
        .checked_add(
            order
                .checked_mul(2)
                .ok_or("i32 QLP coefficient size overflow")?,
        )
        .ok_or("i32 QLP coefficient offset overflow")?;
    if coefficients_end > payload.len() {
        return Err("i32 QLP coefficients truncated".into());
    }
    let mut coefficients = Vec::with_capacity(order);
    while position < coefficients_end {
        coefficients.push(i16::from_le_bytes(
            payload[position..position + 2]
                .try_into()
                .map_err(|_| "i32 QLP coefficient truncated")?,
        ));
        position += 2;
    }
    let count = expected_len;
    if order > count {
        return Err("i32 QLP order exceeds sample count".into());
    }
    let warmup_bytes = order
        .checked_mul(4)
        .ok_or("i32 QLP warm-up size overflow")?;
    if position
        .checked_add(warmup_bytes)
        .ok_or("i32 QLP warm-up offset overflow")?
        > payload.len()
    {
        return Err("i32 QLP warm-up truncated".into());
    }
    let mut warmups = Vec::with_capacity(order);
    for _ in 0..order {
        warmups.push(i32::from_le_bytes(
            payload[position..position + 4]
                .try_into()
                .map_err(|_| "i32 QLP warm-up truncated")?,
        ));
        position += 4;
    }
    if position + 2 > payload.len() {
        return Err("i32 QLP partitions truncated".into());
    }
    let parts = payload[position] as usize;
    position += 1;
    let escape_bits = payload[position];
    position += 1;
    if !(8..=32).contains(&escape_bits) {
        return Err("i32 QLP escape width invalid".into());
    }
    let packed_ks_len = parts.div_ceil(2);
    if parts == 0 || parts > 16 || position + packed_ks_len > payload.len() {
        return Err("i32 QLP partitions invalid".into());
    }
    let ks = unpack_partition_ks(&payload[position..position + packed_ks_len], parts)?;
    position += packed_ks_len;
    let body_len = count - order;
    let decoded = rice_decode_partitioned_escape(&payload[position..], &ks, body_len, escape_bits)?;
    reconstruct_i32_from_warmup(&warmups, &decoded, shift, &coefficients)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_qlp_roundtrips() {
        let samples: Vec<i16> = (0..4096)
            .map(|i| ((i as f32 * 0.014).sin() * 24000.0) as i16)
            .collect();
        let payload = encode_best_qlp_payload(&samples).expect("QLP candidate");
        let order = payload[0] as usize;
        let warmup_offset = 2 + order * 2;
        for (index, sample) in samples.iter().take(order).enumerate() {
            assert_eq!(
                i16::from_le_bytes(
                    payload[warmup_offset + index * 2..warmup_offset + index * 2 + 2]
                        .try_into()
                        .unwrap()
                ),
                *sample,
                "QLP warm-up {index} must be stored verbatim"
            );
        }
        let parts_offset = warmup_offset + order * 2;
        let parts = payload[parts_offset] as usize;
        assert!((1..=16).contains(&parts));
        assert_eq!(payload[parts_offset + 1], 16);
        assert_eq!(
            decode_qlp_payload(&payload, samples.len()).unwrap(),
            samples
        );
    }

    #[test]
    fn windowed_adaptive_qlp_roundtrips() {
        let samples: Vec<i16> = (0..4096)
            .map(|i| {
                let envelope = 1.0 - i as f64 / 4096.0;
                ((i as f64 * 0.031).sin() * envelope * 30_000.0) as i16
            })
            .collect();
        assert!(QLP_SHIFTS.len() > 1);
        let payload = encode_best_qlp_payload(&samples).expect("windowed QLP candidate");
        assert!(QLP_SHIFTS.contains(&payload[1]));
        assert_eq!(
            decode_qlp_payload(&payload, samples.len()).unwrap(),
            samples
        );
    }

    #[test]
    fn size_true_selection_uses_smallest_verified_top_n() {
        let samples: Vec<i16> = (0..4096)
            .map(|i| {
                let carrier = (i as f64 * 0.018).sin();
                let overtone = (i as f64 * 0.071).sin() * 0.12;
                ((carrier + overtone) * 22_000.0) as i16
            })
            .collect();
        let ranked = ranked_candidates(candidates(&samples, false));
        let expected = ranked
            .iter()
            .take(QLP_MATERIALIZE_TOP)
            .filter_map(|candidate| encode_candidate(&samples, candidate))
            .map(|payload| payload.len())
            .min()
            .expect("verified QLP candidate");
        let selected =
            encode_best_qlp_payload_with_window(&samples, false).expect("selected QLP payload");
        assert_eq!(selected.len(), expected);
    }

    #[test]
    fn qlp_order_zero_has_no_warmup_bytes() {
        let samples = vec![3i16, -2, 1];
        let body: Vec<i32> = samples.iter().map(|&sample| sample as i32).collect();
        let ks = vec![1u8];
        let mut payload = vec![0, 0];
        payload.push(ks.len() as u8);
        payload.push(16);
        payload.extend_from_slice(&pack_partition_ks(&ks));
        payload.extend_from_slice(&rice_encode_partitioned_escape(&body, &ks, 16));
        assert_eq!(
            decode_qlp_payload(&payload, samples.len()).unwrap(),
            samples
        );
    }

    #[test]
    fn malformed_qlp_is_rejected_without_panic() {
        for payload in [&[][..], &[12, 255, 0, 0][..], &[255; 64][..]] {
            assert!(decode_qlp_payload(payload, 4096).is_err());
        }
    }

    #[test]
    fn qlp_rejects_truncated_verbatim_warmup() {
        let mut payload = vec![2, 8];
        payload.extend_from_slice(&256i16.to_le_bytes());
        payload.extend_from_slice(&0i16.to_le_bytes());
        payload.extend_from_slice(&123i16.to_le_bytes());
        let error = decode_qlp_payload(&payload, 2).unwrap_err();
        assert!(error.contains("warm-up"), "{error}");
    }

    #[test]
    fn qlp_prediction_is_not_clamped_before_residual_add() {
        let samples = reconstruct_from_warmup(&[i16::MAX], &[-32_767], 0, &[2]).unwrap();
        assert_eq!(samples, vec![i16::MAX, i16::MAX]);
    }

    #[test]
    fn i32_stored_qlp_roundtrips_extremes() {
        let mut samples = vec![0i32; 512];
        samples[0] = i32::MIN;
        samples[1] = i32::MAX;
        samples[2] = i32::MIN + 1;
        samples[3] = i32::MAX - 1;
        samples[4] = -1;
        samples[5] = 1;
        let payload = encode_best_i32_qlp_payload(&samples).expect("i32 QLP candidate");
        assert_eq!(
            decode_i32_qlp_payload(&payload, samples.len()).unwrap(),
            samples
        );
    }

    #[test]
    fn i32_stored_qlp_roundtrips_17_bit_side() {
        let mut samples = vec![0i32; 512];
        samples[..7].copy_from_slice(&[-65535, 65535, 0, -1, 1, 32768, -32769]);
        let payload = encode_best_i32_qlp_payload(&samples).expect("i32 QLP side candidate");
        let order = payload[0] as usize;
        let warmup_offset = 2 + order * 2;
        for (index, sample) in samples.iter().take(order).enumerate() {
            assert_eq!(
                i32::from_le_bytes(
                    payload[warmup_offset + index * 4..warmup_offset + index * 4 + 4]
                        .try_into()
                        .unwrap()
                ),
                *sample,
                "i32 QLP warm-up {index} must be stored verbatim"
            );
        }
        let parts_offset = warmup_offset + order * 4;
        let parts = payload[parts_offset] as usize;
        assert!((1..=16).contains(&parts));
        assert!((8..=32).contains(&payload[parts_offset + 1]));
        assert_eq!(
            decode_i32_qlp_payload(&payload, samples.len()).unwrap(),
            samples
        );
    }

    #[test]
    fn i32_stored_qlp_improves_smooth_signal() {
        let samples: Vec<i32> = (0..4096)
            .map(|i| ((i as f64 * 0.014).sin() * 60_000.0) as i32)
            .collect();
        let raw = super::super::block::encode_i32_rice_payload(&samples);
        let predicted = super::super::block::encode_i32_predicted_rice_payload(&samples)
            .expect("predicted payload");
        let qlp = encode_best_i32_qlp_payload(&samples).expect("i32 QLP payload");
        assert!(
            qlp.len() < raw.len() && qlp.len() <= predicted.len(),
            "qlp={} predicted={} raw={}",
            qlp.len(),
            predicted.len(),
            raw.len()
        );
        assert_eq!(
            decode_i32_qlp_payload(&qlp, samples.len()).unwrap(),
            samples
        );
    }

    #[test]
    fn malformed_i32_qlp_is_rejected_without_panic() {
        for payload in [&[][..], &[12, 255, 0, 0][..], &[255; 64][..]] {
            assert!(decode_i32_qlp_payload(payload, 4096).is_err());
        }
    }

    #[test]
    fn i32_qlp_rejects_truncated_verbatim_warmup() {
        let mut payload = vec![2, 8];
        payload.extend_from_slice(&256i16.to_le_bytes());
        payload.extend_from_slice(&0i16.to_le_bytes());
        payload.extend_from_slice(&123i32.to_le_bytes());
        let error = decode_i32_qlp_payload(&payload, 2).unwrap_err();
        assert!(error.contains("warm-up"), "{error}");
    }
}
