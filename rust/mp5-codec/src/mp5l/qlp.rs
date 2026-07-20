//! Stored quantized linear prediction for MP5-L v4.

use super::rice::{
    best_partitioned_ks, rice_decode_partitioned_escape, rice_encode_partitioned_escape,
    rice_estimate_bits_partitioned,
};

pub const MAX_QLP_ORDER: usize = 12;
const QLP_SHIFT: u8 = 12;

/// Analyze one block once and retain the best candidate in each staged range:
/// orders 1–8 and orders 9–12.
fn staged_candidates(samples: &[i16]) -> Vec<(u8, Vec<i16>)> {
    if samples.len() < 16 {
        return Vec::new();
    }
    let max_order = MAX_QLP_ORDER.min(samples.len() / 2);
    let mut autocorrelation = vec![0f64; max_order + 1];
    for lag in 0..=max_order {
        autocorrelation[lag] = (lag..samples.len())
            .map(|i| samples[i] as f64 * samples[i - lag] as f64)
            .sum();
    }
    if autocorrelation[0] <= 0.0 {
        return Vec::new();
    }

    let scale = (1u32 << QLP_SHIFT) as f64;
    let mut coefficients = vec![0f64; max_order];
    let mut error = autocorrelation[0];
    let mut best_low: Option<(u8, Vec<i16>, usize)> = None;
    let mut best_high: Option<(u8, Vec<i16>, usize)> = None;

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

        let order = index + 1;
        let mut quantized = Vec::with_capacity(order);
        for &coefficient in &coefficients[..order] {
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
        let residuals = residuals(samples, QLP_SHIFT, &quantized);
        let ks = best_partitioned_ks(&residuals);
        let estimated_bits = 7 * 8
            + quantized.len() * 16
            + ks.len() * 8
            + rice_estimate_bits_partitioned(&residuals, &ks);
        let target = if order <= 8 {
            &mut best_low
        } else {
            &mut best_high
        };
        if target
            .as_ref()
            .map(|candidate| estimated_bits < candidate.2)
            .unwrap_or(true)
        {
            *target = Some((order as u8, quantized, estimated_bits));
        }
    }

    best_low
        .into_iter()
        .chain(best_high)
        .map(|(order, coefficients, _)| (order, coefficients))
        .collect()
}

fn prediction(history: &[i16], index: usize, shift: u8, coefficients: &[i16]) -> i64 {
    let sum = coefficients
        .iter()
        .enumerate()
        .fold(0i64, |acc, (j, &coefficient)| {
            acc + coefficient as i64 * history[index - 1 - j] as i64
        });
    (sum >> shift).clamp(i16::MIN as i64, i16::MAX as i64)
}

fn residuals(samples: &[i16], shift: u8, coefficients: &[i16]) -> Vec<i32> {
    let order = coefficients.len();
    (0..samples.len())
        .map(|index| {
            if index < order {
                samples[index] as i32
            } else {
                samples[index] as i32 - prediction(samples, index, shift, coefficients) as i32
            }
        })
        .collect()
}

fn reconstruct(residuals: &[i32], shift: u8, coefficients: &[i16]) -> Result<Vec<i16>, String> {
    let order = coefficients.len();
    let mut samples = Vec::with_capacity(residuals.len());
    for (index, &residual) in residuals.iter().enumerate() {
        let value = if index < order {
            residual as i64
        } else {
            let mut sum = 0i64;
            for (j, &coefficient) in coefficients.iter().enumerate() {
                let product = (coefficient as i64)
                    .checked_mul(samples[index - 1 - j] as i64)
                    .ok_or("QLP FIR multiply overflow")?;
                sum = sum.checked_add(product).ok_or("QLP FIR sum overflow")?;
            }
            let predicted = (sum >> shift).clamp(i16::MIN as i64, i16::MAX as i64);
            predicted
                .checked_add(residual as i64)
                .ok_or("QLP reconstruction overflow")?
        };
        if value < i16::MIN as i64 || value > i16::MAX as i64 {
            return Err("QLP sample exceeds i16".into());
        }
        samples.push(value as i16);
    }
    Ok(samples)
}

/// Layout: `[order][shift][coefficients i16 LE][count u32][parts][ks][Rice]`.
fn encode_candidate(samples: &[i16], order: u8, coefficients: &[i16]) -> Option<Vec<u8>> {
    let values = residuals(samples, QLP_SHIFT, coefficients);
    let ks = best_partitioned_ks(&values);
    let packed = rice_encode_partitioned_escape(&values, &ks);
    let mut payload = Vec::with_capacity(7 + coefficients.len() * 2 + ks.len() + packed.len());
    payload.push(order);
    payload.push(QLP_SHIFT);
    for &coefficient in coefficients {
        payload.extend_from_slice(&coefficient.to_le_bytes());
    }
    payload.extend_from_slice(&(values.len() as u32).to_le_bytes());
    payload.push(ks.len() as u8);
    payload.extend_from_slice(&ks);
    payload.extend_from_slice(&packed);
    if decode_qlp_payload(&payload, samples.len()).ok().as_deref() == Some(samples) {
        Some(payload)
    } else {
        None
    }
}

pub fn encode_best_qlp_payload(samples: &[i16]) -> Option<Vec<u8>> {
    staged_candidates(samples)
        .into_iter()
        .filter_map(|(order, coefficients)| encode_candidate(samples, order, &coefficients))
        .min_by_key(Vec::len)
}

pub fn decode_qlp_payload(payload: &[u8], expected_len: usize) -> Result<Vec<i16>, String> {
    if payload.len() < 7 {
        return Err("QLP payload short".into());
    }
    let order = payload[0] as usize;
    let shift = payload[1];
    if order == 0 || order > MAX_QLP_ORDER || shift > 31 {
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
    if coefficients_end + 5 > payload.len() {
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
    let count = u32::from_le_bytes(
        payload[position..position + 4]
            .try_into()
            .map_err(|_| "QLP count truncated")?,
    ) as usize;
    position += 4;
    if count != expected_len {
        return Err(format!("QLP count {count} != block len {expected_len}"));
    }
    let parts = payload[position] as usize;
    position += 1;
    if parts == 0 || parts > 16 || position + parts > payload.len() {
        return Err("QLP partitions invalid".into());
    }
    let ks = &payload[position..position + parts];
    position += parts;
    let decoded = rice_decode_partitioned_escape(&payload[position..], ks, count)?;
    reconstruct(&decoded, shift, &coefficients)
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
}
