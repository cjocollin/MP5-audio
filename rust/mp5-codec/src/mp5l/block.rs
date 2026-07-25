//! MP5-L block payloads (v3): silence, const, LPC+varint, LPC+Rice-packed, delta, raw.

use super::predict::{best_order, best_order_rice, reconstruct, residuals, MAX_ORDER};
use super::rice::{
    rice_decode_partitioned, rice_encode_partitioned, rice_estimate_bits_partitioned,
};
use super::varint::{read_varint, write_varint};

fn delta_residuals(samples: &[i16]) -> Vec<i32> {
    let mut out = Vec::with_capacity(samples.len());
    let mut prev = 0i16;
    for &s in samples {
        out.push(s as i32 - prev as i32);
        prev = s;
    }
    out
}

fn reconstruct_delta(res: &[i32]) -> Vec<i16> {
    let mut out = Vec::with_capacity(res.len());
    let mut prev = 0i32;
    for &r in res {
        prev += r;
        out.push(prev as i16);
    }
    out
}

fn encode_delta_payload(samples: &[i16]) -> Vec<u8> {
    let res = delta_residuals(samples);
    let mut payload = Vec::new();
    payload.extend(&(res.len() as u32).to_le_bytes());
    for &r in &res {
        write_varint(&mut payload, zigzag32(r));
    }
    payload
}

fn decode_delta_payload(payload: &[u8], len: usize) -> Result<Vec<i16>, String> {
    if payload.len() < 4 {
        return Err("delta block short".into());
    }
    let count = u32::from_le_bytes(payload[0..4].try_into().unwrap()) as usize;
    if count != len {
        return Err(format!("delta count {count} != len {len}"));
    }
    let mut pos = 4usize;
    let mut res = Vec::with_capacity(count);
    while res.len() < count {
        let zz = read_varint(payload, &mut pos)?;
        res.push(unzigzag32(zz));
    }
    Ok(reconstruct_delta(&res))
}

pub const FLAG_RAW: u8 = 0;
pub const FLAG_SILENCE: u8 = 1;
pub const FLAG_CONST: u8 = 2;
/// Legacy name: LPC residuals coded as **varint zigzag** (not bit-packed Rice).
pub const FLAG_RICE: u8 = 3;
pub const FLAG_DELTA: u8 = 4;
pub const FLAG_STEREO_MS: u8 = 5;
/// LPC residuals coded with bit-packed Rice (single-k or partitioned).
pub const FLAG_RICE_PACKED: u8 = 6;
/// Stored quantized LPC coefficients with escaped partitioned Rice residuals (v4 only).
pub const FLAG_QLP: u8 = 7;
/// Signed i32 samples with escaped partitioned Rice coding (v4 stereo side only).
pub const FLAG_I32_RICE: u8 = 8;
/// Fixed-predicted i32 samples with escaped partitioned Rice (v4 stereo side only).
pub const FLAG_I32_PRED: u8 = 9;
/// Stored QLP on width-safe i32 stereo side with verbatim i32 warm-ups (v4 only).
pub const FLAG_I32_QLP: u8 = 10;

/// Max samples per block on decode (matches encoder `BLOCK_SIZE_V4`). Reject before allocate.
pub const MAX_DECODE_BLOCK_SAMPLES: usize = 8192;

const BLOCK_HDR: usize = 13;

fn zigzag32(n: i32) -> u32 {
    ((n << 1) ^ (n >> 31)) as u32
}

fn unzigzag32(n: u32) -> i32 {
    ((n >> 1) as i32) ^ (-((n & 1) as i32))
}

fn payload_roundtrips(flag: u8, payload: &[u8], samples: &[i16]) -> bool {
    decode_block_payload(flag, payload, samples.len())
        .map(|decoded| decoded == samples)
        .unwrap_or(false)
}

/// Encode LPC residuals as bit-packed Rice.
/// Layout: `[order u8][count u32 LE][parts u8][k0..k_{parts-1}][rice bytes…]`
fn encode_rice_packed_payload(samples: &[i16], order: u8) -> Option<Vec<u8>> {
    use super::rice::{best_partitioned_ks_unescaped, estimate_k_partitioned_unescaped};

    let res = residuals(samples, order);
    let count = res.len() as u32;
    let raw_cap = samples.len() * 2 + 8;
    let mut best: Option<Vec<u8>> = None;

    // Always try the global best partition choice, plus each candidate count.
    let mut tried: Vec<Vec<u8>> = Vec::new();
    tried.push(best_partitioned_ks_unescaped(&res));
    for &parts in &[1usize, 2, 4, 8] {
        if parts > res.len().max(1) {
            continue;
        }
        let ks = estimate_k_partitioned_unescaped(&res, parts);
        if !tried.iter().any(|t| t == &ks) {
            tried.push(ks);
        }
    }

    for ks in tried {
        let est_bits = rice_estimate_bits_partitioned(&res, &ks);
        if est_bits / 8 + 6 + ks.len() >= raw_cap {
            continue;
        }
        let packed = rice_encode_partitioned(&res, &ks);
        let mut payload = Vec::with_capacity(6 + ks.len() + packed.len());
        payload.push(order);
        payload.extend(&count.to_le_bytes());
        payload.push(ks.len() as u8);
        payload.extend_from_slice(&ks);
        payload.extend_from_slice(&packed);
        if payload.len() >= raw_cap {
            continue;
        }
        if payload_roundtrips(FLAG_RICE_PACKED, &payload, samples) {
            if best
                .as_ref()
                .map(|b| payload.len() < b.len())
                .unwrap_or(true)
            {
                best = Some(payload);
            }
        }
    }
    best
}

/// Actual bit-packed Rice payload size (bytes) vs current varint LPC payload.
/// Used for the Phase 4.0 go/no-go measurement.
pub fn rice_vs_varint_payload_bytes(samples: &[i16]) -> (usize, usize) {
    let order_v = best_order(samples, MAX_ORDER as u8);
    let res_v = residuals(samples, order_v);
    let mut varint_bytes = 5usize; // order + count
    for &r in &res_v {
        let zz = zigzag32(r);
        let mut v = zz;
        varint_bytes += 1;
        while v >= 0x80 {
            v >>= 7;
            varint_bytes += 1;
        }
    }

    let order_r = best_order_rice(samples, MAX_ORDER as u8);
    let rice_bytes = encode_rice_packed_payload(samples, order_r)
        .map(|p| p.len())
        .unwrap_or(usize::MAX);
    (varint_bytes, rice_bytes)
}

pub fn encode_block_payload(samples: &[i16]) -> (u8, Vec<u8>) {
    if samples.is_empty() {
        return (FLAG_SILENCE, Vec::new());
    }
    if samples.iter().all(|&s| s == 0) {
        return (FLAG_SILENCE, Vec::new());
    }
    if let Some(&v) = samples.first() {
        if samples.iter().all(|&s| s == v) {
            return (FLAG_CONST, v.to_le_bytes().to_vec());
        }
    }

    let mut best_flag = FLAG_RAW;
    let mut best_payload = raw_payload(samples);
    let mut best_len = BLOCK_HDR + best_payload.len();

    let delta_payload = encode_delta_payload(samples);
    let delta_total = BLOCK_HDR + delta_payload.len();
    if delta_total < best_len && payload_roundtrips(FLAG_DELTA, &delta_payload, samples) {
        best_len = delta_total;
        best_flag = FLAG_DELTA;
        best_payload = delta_payload;
    }

    // Legacy LPC + varint (FLAG_RICE)
    let order_v = best_order(samples, MAX_ORDER as u8);
    let res_v = residuals(samples, order_v);
    let mut lpc_payload = Vec::new();
    lpc_payload.push(order_v);
    lpc_payload.extend(&(res_v.len() as u32).to_le_bytes());
    for &r in &res_v {
        write_varint(&mut lpc_payload, zigzag32(r));
    }
    let lpc_total = BLOCK_HDR + lpc_payload.len();
    if lpc_total < best_len && payload_roundtrips(FLAG_RICE, &lpc_payload, samples) {
        best_len = lpc_total;
        best_flag = FLAG_RICE;
        best_payload = lpc_payload;
    }

    // Bit-packed Rice (FLAG_RICE_PACKED) — rice-cost-aware order selection
    let order_r = best_order_rice(samples, MAX_ORDER as u8);
    if let Some(packed) = encode_rice_packed_payload(samples, order_r) {
        let packed_total = BLOCK_HDR + packed.len();
        if packed_total < best_len {
            best_len = packed_total;
            best_flag = FLAG_RICE_PACKED;
            best_payload = packed;
        }
    }

    let _ = best_len;
    (best_flag, best_payload)
}

/// Exact selected v4 payload byte count using a precomputed QLP analysis.
pub fn estimate_block_payload_v4_bytes_with_qlp(
    samples: &[i16],
    qlp: &Option<super::qlp::PreparedQlp>,
) -> usize {
    let base = estimate_block_payload_bytes(samples);
    qlp.as_ref()
        .map(|prep| base.min(prep.payload_bytes()))
        .unwrap_or(base)
}

/// v4 block search with optional precomputed QLP analysis (avoids a second Levinson pass).
pub fn encode_block_payload_v4_with_qlp(
    samples: &[i16],
    qlp: Option<super::qlp::PreparedQlp>,
) -> (u8, Vec<u8>) {
    let (mut best_flag, mut best_payload) = encode_base_payload_v4_winner(samples);
    if let Some(prep) = qlp {
        if prep.payload_bytes() < best_payload.len() {
            if let Some(qlp_payload) = prep.encode(samples) {
                if qlp_payload.len() < best_payload.len() {
                    best_flag = FLAG_QLP;
                    best_payload = qlp_payload;
                }
            }
        }
    }
    (best_flag, best_payload)
}

/// v4 block search adds stored QLP without changing v3 encoder decisions.
pub fn encode_block_payload_v4(samples: &[i16]) -> (u8, Vec<u8>) {
    encode_block_payload_v4_with_qlp(samples, super::qlp::prepare_best_qlp(samples))
}

fn varint_payload_bytes(residuals: &[i32]) -> usize {
    residuals.iter().fold(0usize, |total, &residual| {
        let zigzag = zigzag32(residual);
        total.saturating_add(if zigzag == 0 {
            1
        } else {
            (u32::BITS - zigzag.leading_zeros()).div_ceil(7) as usize
        })
    })
}

struct RicePackedPlan {
    residuals: Vec<i32>,
    ks: Vec<u8>,
    payload_bytes: usize,
}

fn rice_packed_plan(samples: &[i16], order: u8) -> Option<RicePackedPlan> {
    use super::rice::{best_partitioned_ks_unescaped, estimate_k_partitioned_unescaped};

    let residuals = residuals(samples, order);
    let raw_cap = samples.len().saturating_mul(2).saturating_add(8);
    let mut tried: Vec<Vec<u8>> = vec![best_partitioned_ks_unescaped(&residuals)];
    for &parts in &[1usize, 2, 4, 8] {
        if parts > residuals.len().max(1) {
            continue;
        }
        let ks = estimate_k_partitioned_unescaped(&residuals, parts);
        if !tried.iter().any(|candidate| candidate == &ks) {
            tried.push(ks);
        }
    }
    let mut best: Option<(Vec<u8>, usize)> = None;
    for ks in tried {
        let bits = rice_estimate_bits_partitioned(&residuals, &ks);
        if bits / 8 + 6 + ks.len() >= raw_cap {
            continue;
        }
        let payload_bytes = 6 + ks.len() + bits.div_ceil(8);
        if payload_bytes < raw_cap
            && best
                .as_ref()
                .map(|(_, current)| payload_bytes < *current)
                .unwrap_or(true)
        {
            best = Some((ks, payload_bytes));
        }
    }
    best.map(|(ks, payload_bytes)| RicePackedPlan {
        residuals,
        ks,
        payload_bytes,
    })
}

fn estimate_rice_packed_payload_bytes(samples: &[i16], order: u8) -> Option<usize> {
    rice_packed_plan(samples, order).map(|plan| plan.payload_bytes)
}

fn materialize_rice_packed_plan(order: u8, plan: &RicePackedPlan) -> Vec<u8> {
    let packed = rice_encode_partitioned(&plan.residuals, &plan.ks);
    let mut payload = Vec::with_capacity(plan.payload_bytes);
    payload.push(order);
    payload.extend_from_slice(&(plan.residuals.len() as u32).to_le_bytes());
    payload.push(plan.ks.len() as u8);
    payload.extend_from_slice(&plan.ks);
    payload.extend_from_slice(&packed);
    payload
}

fn estimate_block_payload_bytes(samples: &[i16]) -> usize {
    if samples.is_empty() || samples.iter().all(|&sample| sample == 0) {
        return 0;
    }
    if samples
        .first()
        .is_some_and(|first| samples.iter().all(|sample| sample == first))
    {
        return 2;
    }

    let mut best = samples.len().saturating_mul(2);
    let delta = 4usize.saturating_add(varint_payload_bytes(&delta_residuals(samples)));
    best = best.min(delta);

    let varint_order = best_order(samples, MAX_ORDER as u8);
    let varint_residuals = residuals(samples, varint_order);
    best = best.min(5usize.saturating_add(varint_payload_bytes(&varint_residuals)));

    let rice_order = best_order_rice(samples, MAX_ORDER as u8);
    if let Some(rice) = estimate_rice_packed_payload_bytes(samples, rice_order) {
        best = best.min(rice);
    }
    best
}

enum V4BasePlan {
    Raw,
    Delta,
    Varint { order: u8, residuals: Vec<i32> },
    Packed { order: u8, plan: RicePackedPlan },
}

fn encode_base_payload_v4_winner(samples: &[i16]) -> (u8, Vec<u8>) {
    if samples.is_empty() || samples.iter().all(|&sample| sample == 0) {
        return (FLAG_SILENCE, Vec::new());
    }
    if let Some(&value) = samples.first() {
        if samples.iter().all(|&sample| sample == value) {
            return (FLAG_CONST, value.to_le_bytes().to_vec());
        }
    }

    let mut best_bytes = samples.len().saturating_mul(2);
    let mut best = V4BasePlan::Raw;

    let delta_bytes = 4usize.saturating_add(varint_payload_bytes(&delta_residuals(samples)));
    if delta_bytes < best_bytes {
        best_bytes = delta_bytes;
        best = V4BasePlan::Delta;
    }

    let varint_order = best_order(samples, MAX_ORDER as u8);
    let varint_residuals = residuals(samples, varint_order);
    let varint_bytes = 5usize.saturating_add(varint_payload_bytes(&varint_residuals));
    if varint_bytes < best_bytes {
        best_bytes = varint_bytes;
        best = V4BasePlan::Varint {
            order: varint_order,
            residuals: varint_residuals,
        };
    }

    let rice_order = best_order_rice(samples, MAX_ORDER as u8);
    if let Some(plan) = rice_packed_plan(samples, rice_order) {
        if plan.payload_bytes < best_bytes {
            best = V4BasePlan::Packed {
                order: rice_order,
                plan,
            };
        }
    }

    let (flag, payload) = match best {
        V4BasePlan::Raw => (FLAG_RAW, raw_payload(samples)),
        V4BasePlan::Delta => (FLAG_DELTA, encode_delta_payload(samples)),
        V4BasePlan::Varint { order, residuals } => {
            let mut payload = Vec::with_capacity(5 + varint_payload_bytes(&residuals));
            payload.push(order);
            payload.extend_from_slice(&(residuals.len() as u32).to_le_bytes());
            for residual in residuals {
                write_varint(&mut payload, zigzag32(residual));
            }
            (FLAG_RICE, payload)
        }
        V4BasePlan::Packed { order, plan } => {
            (FLAG_RICE_PACKED, materialize_rice_packed_plan(order, &plan))
        }
    };
    (flag, payload)
}

/// Exact selected v4 payload byte count without materializing or decoding.
///
/// This mirrors all metadata and final-byte padding decisions made by the
/// encoder. Ties do not affect the returned size.
pub fn estimate_block_payload_v4_bytes(samples: &[i16]) -> usize {
    estimate_block_payload_v4_bytes_with_qlp(samples, &super::qlp::prepare_best_qlp(samples))
}

/// Prepared Rice/Fixed/QLP side analysis for estimate-then-encode.
pub struct PreparedI32Side {
    rice: I32RicePlan,
    fixed: Option<PredictedI32Plan>,
    qlp: Option<super::qlp::PreparedI32Qlp>,
    payload_bytes: usize,
}

impl PreparedI32Side {
    pub fn payload_bytes(&self) -> usize {
        self.payload_bytes
    }

    pub fn encode(self, samples: &[i32]) -> (u8, Vec<u8>) {
        #[derive(Clone, Copy)]
        enum SidePayload {
            Rice,
            Fixed,
            Qlp,
        }

        let mut candidates = vec![(self.rice.payload_bytes, SidePayload::Rice)];
        if let Some(ref plan) = self.fixed {
            candidates.push((plan.payload_bytes, SidePayload::Fixed));
        }
        if let Some(ref prep) = self.qlp {
            candidates.push((prep.payload_bytes(), SidePayload::Qlp));
        }
        candidates.sort_by_key(|(bytes, _)| *bytes);

        for (_, candidate) in candidates {
            match candidate {
                SidePayload::Rice => {
                    return (FLAG_I32_RICE, materialize_i32_rice_plan(samples, &self.rice));
                }
                SidePayload::Fixed => {
                    if let Some(ref plan) = self.fixed {
                        return (
                            FLAG_I32_PRED,
                            materialize_i32_predicted_plan(samples, plan),
                        );
                    }
                }
                SidePayload::Qlp => {
                    if let Some(ref prep) = self.qlp {
                        if let Some(payload) = prep.encode(samples) {
                            return (FLAG_I32_QLP, payload);
                        }
                    }
                }
            }
        }
        (FLAG_I32_RICE, materialize_i32_rice_plan(samples, &self.rice))
    }
}

pub fn prepare_i32_side(samples: &[i32]) -> PreparedI32Side {
    let rice = best_i32_rice_plan(samples);
    let fixed = best_i32_predicted_plan(samples);
    let qlp = super::qlp::prepare_best_i32_qlp(samples);
    let mut payload_bytes = rice.payload_bytes;
    if let Some(ref plan) = fixed {
        payload_bytes = payload_bytes.min(plan.payload_bytes);
    }
    if let Some(ref prep) = qlp {
        payload_bytes = payload_bytes.min(prep.payload_bytes());
    }
    PreparedI32Side {
        rice,
        fixed,
        qlp,
        payload_bytes,
    }
}

struct I32RicePlan {
    escape_bits: u8,
    ks: Vec<u8>,
    payload_bytes: usize,
}

fn best_i32_rice_plan(samples: &[i32]) -> I32RicePlan {
    use super::rice::{best_partitioned_ks_with_bits, escape_bits_for_residuals};

    let escape_bits = escape_bits_for_residuals(samples);
    let (ks, rice_bits) = best_partitioned_ks_with_bits(samples, escape_bits);
    I32RicePlan {
        escape_bits,
        payload_bytes: 2 + ks.len().div_ceil(2) + rice_bits.div_ceil(8),
        ks,
    }
}

fn materialize_i32_rice_plan(samples: &[i32], plan: &I32RicePlan) -> Vec<u8> {
    use super::rice::{pack_partition_ks, rice_encode_partitioned_escape};

    let packed_ks = pack_partition_ks(&plan.ks);
    let packed = rice_encode_partitioned_escape(samples, &plan.ks, plan.escape_bits);
    let mut payload = Vec::with_capacity(plan.payload_bytes);
    payload.push(plan.ks.len() as u8);
    payload.push(plan.escape_bits);
    payload.extend_from_slice(&packed_ks);
    payload.extend_from_slice(&packed);
    debug_assert_eq!(payload.len(), plan.payload_bytes);
    payload
}

/// Encode a stereo side channel.
/// Layout: `[parts u8][escape_bits u8][packed ks][escaped Rice bytes]`.
pub fn encode_i32_rice_payload(samples: &[i32]) -> Vec<u8> {
    materialize_i32_rice_plan(samples, &best_i32_rice_plan(samples))
}

pub fn estimate_i32_rice_payload_bytes(samples: &[i32]) -> usize {
    best_i32_rice_plan(samples).payload_bytes
}

pub fn decode_i32_rice_payload(payload: &[u8], len: usize) -> Result<Vec<i32>, String> {
    use super::rice::{rice_decode_partitioned_escape, unpack_partition_ks};

    if len == 0 || len > MAX_DECODE_BLOCK_SAMPLES {
        return Err(format!(
            "i32 block len {len} out of range (1..={MAX_DECODE_BLOCK_SAMPLES})"
        ));
    }
    if payload.len() < 3 {
        return Err("i32 Rice payload short".into());
    }
    let parts = payload[0] as usize;
    let escape_bits = payload[1];
    let packed_ks_len = parts.div_ceil(2);
    if parts == 0
        || parts > 16
        || !(8..=32).contains(&escape_bits)
        || 2 + packed_ks_len > payload.len()
    {
        return Err("i32 Rice partitions invalid".into());
    }
    let ks = unpack_partition_ks(&payload[2..2 + packed_ks_len], parts)?;
    rice_decode_partitioned_escape(&payload[2 + packed_ks_len..], &ks, len, escape_bits)
}

fn fixed_i32_prediction(history: &[i32], index: usize, order: u8) -> i64 {
    let sample = |back: usize| history[index - back] as i64;
    match order {
        1 => sample(1),
        2 => 2 * sample(1) - sample(2),
        3 => 3 * sample(1) - 3 * sample(2) + sample(3),
        4 => 4 * sample(1) - 6 * sample(2) + 4 * sample(3) - sample(4),
        _ => 0,
    }
}

fn fixed_i32_residuals(samples: &[i32], order: u8) -> Option<Vec<i32>> {
    let order = order as usize;
    if order > samples.len() {
        return None;
    }
    let mut residuals = Vec::with_capacity(samples.len() - order);
    for (index, &sample) in samples.iter().enumerate().skip(order) {
        let value =
            (sample as i64).checked_sub(fixed_i32_prediction(samples, index, order as u8))?;
        residuals.push(i32::try_from(value).ok()?);
    }
    Some(residuals)
}

struct PredictedI32Plan {
    order: u8,
    residuals: Vec<i32>,
    escape_bits: u8,
    ks: Vec<u8>,
    estimated_bits: usize,
    payload_bytes: usize,
}

fn best_i32_predicted_plan(samples: &[i32]) -> Option<PredictedI32Plan> {
    use super::rice::{best_partitioned_ks_with_bits, escape_bits_for_residuals};

    let mut best: Option<PredictedI32Plan> = None;
    for order in 0..=4u8 {
        let Some(residuals) = fixed_i32_residuals(samples, order) else {
            continue;
        };
        let escape_bits = escape_bits_for_residuals(&residuals);
        let (ks, rice_bits) = best_partitioned_ks_with_bits(&residuals, escape_bits);
        let estimated_bits = (3 + order as usize * 4) * 8 + ks.len() * 4 + rice_bits;
        let payload_bytes = 3 + order as usize * 4 + ks.len().div_ceil(2) + rice_bits.div_ceil(8);
        let replace = best
            .as_ref()
            .map(|current| {
                estimated_bits < current.estimated_bits
                    || (estimated_bits == current.estimated_bits
                        && payload_bytes < current.payload_bytes)
            })
            .unwrap_or(true);
        if replace {
            best = Some(PredictedI32Plan {
                order,
                residuals,
                escape_bits,
                ks,
                estimated_bits,
                payload_bytes,
            });
        }
    }
    best
}

fn reconstruct_fixed_i32(
    warmups: &[i32],
    residuals: &[i32],
    count: usize,
    order: u8,
) -> Result<Vec<i32>, String> {
    let order = order as usize;
    if warmups.len() != order || count < order || residuals.len() != count - order {
        return Err("predicted i32 Rice reconstruction lengths invalid".into());
    }
    let mut samples = Vec::with_capacity(count);
    samples.extend_from_slice(warmups);
    for &residual in residuals {
        let index = samples.len();
        let value = fixed_i32_prediction(&samples, index, order as u8)
            .checked_add(residual as i64)
            .ok_or("i32 prediction reconstruction overflow")?;
        samples
            .push(i32::try_from(value).map_err(|_| "i32 prediction sample exceeds signed width")?);
    }
    Ok(samples)
}

fn materialize_i32_predicted_plan(samples: &[i32], plan: &PredictedI32Plan) -> Vec<u8> {
    use super::rice::{pack_partition_ks, rice_encode_partitioned_escape};

    let packed_ks = pack_partition_ks(&plan.ks);
    let packed = rice_encode_partitioned_escape(&plan.residuals, &plan.ks, plan.escape_bits);
    let mut payload = Vec::with_capacity(plan.payload_bytes);
    payload.push(plan.order);
    for &sample in samples.iter().take(plan.order as usize) {
        payload.extend_from_slice(&sample.to_le_bytes());
    }
    payload.push(plan.ks.len() as u8);
    payload.push(plan.escape_bits);
    payload.extend_from_slice(&packed_ks);
    payload.extend_from_slice(&packed);
    debug_assert_eq!(payload.len(), plan.payload_bytes);
    payload
}

/// v4 layout:
/// `[order u8][warm-up i32 LE][parts u8][escape_bits u8][packed ks][Rice N-order]`.
/// Orders 0–4 use the FLAC fixed predictor coefficients.
pub fn encode_i32_predicted_rice_payload(samples: &[i32]) -> Option<Vec<u8>> {
    let plan = best_i32_predicted_plan(samples)?;
    Some(materialize_i32_predicted_plan(samples, &plan))
}

pub fn estimate_i32_predicted_rice_payload_bytes(samples: &[i32]) -> Option<usize> {
    best_i32_predicted_plan(samples).map(|plan| plan.payload_bytes)
}

/// Exact side-channel payload size (Rice / fixed / QLP), matching [`encode_best_i32_side_payload`].
pub fn estimate_i32_side_payload_bytes(samples: &[i32]) -> usize {
    prepare_i32_side(samples).payload_bytes()
}

/// Plan-once side encode: analyze Rice/Fixed/QLP once, materialize only the winner.
/// Tie-break order on equal sizes: Rice → Fixed → QLP (stable sort insertion order).
pub fn encode_best_i32_side_payload(samples: &[i32]) -> (u8, Vec<u8>) {
    prepare_i32_side(samples).encode(samples)
}

pub fn decode_i32_qlp_payload(payload: &[u8], len: usize) -> Result<Vec<i32>, String> {
    super::qlp::decode_i32_qlp_payload(payload, len)
}

pub fn decode_i32_predicted_rice_payload(payload: &[u8], len: usize) -> Result<Vec<i32>, String> {
    use super::rice::{rice_decode_partitioned_escape, unpack_partition_ks};

    if len == 0 || len > MAX_DECODE_BLOCK_SAMPLES {
        return Err(format!(
            "i32 predicted block len {len} out of range (1..={MAX_DECODE_BLOCK_SAMPLES})"
        ));
    }
    if payload.len() < 4 {
        return Err("predicted i32 Rice payload short".into());
    }
    let order = payload[0];
    if order > 4 {
        return Err("predicted i32 Rice order invalid".into());
    }
    let count = len;
    let order = order as usize;
    if order > count {
        return Err("predicted i32 Rice order exceeds sample count".into());
    }
    let warmup_bytes = order
        .checked_mul(4)
        .ok_or("predicted i32 Rice warm-up size overflow")?;
    let mut position = 1usize;
    let warmup_end = position
        .checked_add(warmup_bytes)
        .ok_or("predicted i32 Rice warm-up offset overflow")?;
    if warmup_end
        .checked_add(2)
        .ok_or("predicted i32 Rice partition offset overflow")?
        > payload.len()
    {
        return Err("predicted i32 Rice warm-up truncated".into());
    }
    let mut warmups = Vec::with_capacity(order);
    while position < warmup_end {
        warmups.push(i32::from_le_bytes(
            payload[position..position + 4]
                .try_into()
                .map_err(|_| "predicted i32 Rice warm-up truncated")?,
        ));
        position += 4;
    }
    let parts = payload[position] as usize;
    position += 1;
    let escape_bits = payload[position];
    position += 1;
    let packed_ks_len = parts.div_ceil(2);
    let ks_end = position
        .checked_add(packed_ks_len)
        .ok_or("predicted i32 Rice partition offset overflow")?;
    if parts == 0 || parts > 16 || !(8..=32).contains(&escape_bits) || ks_end > payload.len() {
        return Err("predicted i32 Rice partitions invalid".into());
    }
    let ks = unpack_partition_ks(&payload[position..ks_end], parts)?;
    let residuals =
        rice_decode_partitioned_escape(&payload[ks_end..], &ks, count - order, escape_bits)?;
    reconstruct_fixed_i32(&warmups, &residuals, count, order as u8)
}

pub fn encode_stereo_ms_payload(mid: &[i16], side: &[i16]) -> Vec<u8> {
    let (f1, p1) = encode_block_payload(mid);
    let (f2, p2) = encode_block_payload(side);
    let mut out = Vec::with_capacity(2 + p1.len() + 2 + p2.len());
    out.push(f1);
    out.extend(&(p1.len() as u32).to_le_bytes());
    out.extend_from_slice(&p1);
    out.push(f2);
    out.extend(&(p2.len() as u32).to_le_bytes());
    out.extend_from_slice(&p2);
    out
}

pub fn decode_stereo_ms_payload(
    payload: &[u8],
    len: usize,
) -> Result<(Vec<i16>, Vec<i16>), String> {
    let mut pos = 0usize;
    let (mid, pos) = read_sub_block(payload, pos, len)?;
    let (side, _pos) = read_sub_block(payload, pos, len)?;
    Ok(super::stereo::decode_ms(&mid, &side))
}

fn read_sub_block(data: &[u8], pos: usize, len: usize) -> Result<(Vec<i16>, usize), String> {
    if pos + 5 > data.len() {
        return Err("stereo sub-block short".into());
    }
    let flag = data[pos];
    let plen = u32::from_le_bytes(data[pos + 1..pos + 5].try_into().unwrap()) as usize;
    let start = pos + 5;
    if start + plen > data.len() {
        return Err("stereo sub payload short".into());
    }
    let samples = decode_block_payload(flag, &data[start..start + plen], len)?;
    Ok((samples, start + plen))
}

pub fn decode_block_payload(flag: u8, payload: &[u8], len: usize) -> Result<Vec<i16>, String> {
    if len == 0 || len > MAX_DECODE_BLOCK_SAMPLES {
        return Err(format!(
            "block len {len} out of range (1..={MAX_DECODE_BLOCK_SAMPLES})"
        ));
    }
    match flag {
        FLAG_SILENCE => Ok(vec![0i16; len]),
        FLAG_CONST => {
            if payload.len() < 2 {
                return Err("const block short".into());
            }
            let v = i16::from_le_bytes(payload[0..2].try_into().unwrap());
            Ok(vec![v; len])
        }
        FLAG_RICE => {
            if payload.len() < 5 {
                return Err("rice block short".into());
            }
            let order = payload[0];
            let count = u32::from_le_bytes(payload[1..5].try_into().unwrap()) as usize;
            if count != len {
                return Err(format!("rice residual count {count} != block len {len}"));
            }
            if count > MAX_DECODE_BLOCK_SAMPLES {
                return Err(format!("rice residual count {count} exceeds max"));
            }
            let mut pos = 5usize;
            let mut res = Vec::with_capacity(count);
            while res.len() < count {
                let zz = read_varint(payload, &mut pos)?;
                res.push(unzigzag32(zz));
            }
            Ok(reconstruct(&res, order))
        }
        FLAG_RICE_PACKED => decode_rice_packed_payload(payload, len),
        FLAG_QLP => super::qlp::decode_qlp_payload(payload, len),
        FLAG_DELTA => decode_delta_payload(payload, len),
        FLAG_RAW => decode_raw_payload(payload, len),
        FLAG_STEREO_MS => {
            let (left, right) = decode_stereo_ms_payload(payload, len)?;
            let mut interleaved = Vec::with_capacity(left.len() * 2);
            for i in 0..left.len() {
                interleaved.push(left[i]);
                interleaved.push(right.get(i).copied().unwrap_or(0));
            }
            Ok(interleaved)
        }
        _ => Err(format!("unknown MP5-L block flag {flag}")),
    }
}

fn decode_rice_packed_payload(payload: &[u8], len: usize) -> Result<Vec<i16>, String> {
    if payload.len() < 6 {
        return Err("rice-packed block short".into());
    }
    let order = payload[0];
    let count = u32::from_le_bytes(payload[1..5].try_into().unwrap()) as usize;
    if count != len {
        return Err(format!(
            "rice-packed residual count {count} != block len {len}"
        ));
    }
    let parts = payload[5] as usize;
    if parts == 0 || parts > 16 {
        return Err(format!("rice-packed bad partition count {parts}"));
    }
    if payload.len() < 6 + parts {
        return Err("rice-packed ks truncated".into());
    }
    let ks = payload[6..6 + parts].to_vec();
    let packed = &payload[6 + parts..];
    let res = rice_decode_partitioned(packed, &ks, count)?;
    Ok(reconstruct(&res, order))
}

fn raw_payload(samples: &[i16]) -> Vec<u8> {
    let mut out = Vec::with_capacity(samples.len() * 2);
    for &s in samples {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

fn decode_raw_payload(payload: &[u8], len: usize) -> Result<Vec<i16>, String> {
    if payload.len() < len * 2 {
        return Err("raw block short".into());
    }
    let mut out = Vec::with_capacity(len);
    for i in 0..len {
        out.push(i16::from_le_bytes(
            payload[i * 2..i * 2 + 2].try_into().unwrap(),
        ));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lpc_varint_roundtrip_on_residuals() {
        let samples: Vec<i16> = (0..4096)
            .map(|i| (((i as u32).wrapping_mul(1103515245).wrapping_add(12345)) >> 17) as i16)
            .collect();
        for order in 0..=4u8 {
            let res = residuals(&samples, order);
            assert_eq!(
                reconstruct(&res, order),
                samples,
                "reconstruct order {order}"
            );
            let mut payload = Vec::new();
            payload.push(order);
            payload.extend(&(res.len() as u32).to_le_bytes());
            for &r in &res {
                write_varint(&mut payload, zigzag32(r));
            }
            let mut pos = 5usize;
            for (j, &expect) in res.iter().enumerate() {
                let zz = read_varint(&payload, &mut pos).expect("varint");
                assert_eq!(unzigzag32(zz), expect, "residual {j} order {order}");
            }
            assert_eq!(pos, payload.len(), "trailing bytes order {order}");
            assert!(
                payload_roundtrips(FLAG_RICE, &payload, &samples),
                "payload roundtrip failed order {order}"
            );
        }
    }

    #[test]
    fn oversized_block_len_rejected_before_alloc() {
        let err = decode_block_payload(FLAG_SILENCE, &[], MAX_DECODE_BLOCK_SAMPLES + 1).unwrap_err();
        assert!(err.contains("out of range"), "{err}");
        let err2 = decode_block_payload(FLAG_SILENCE, &[], 0).unwrap_err();
        assert!(err2.contains("out of range"), "{err2}");
        let huge = 1usize << 28;
        assert!(decode_block_payload(FLAG_CONST, &[0, 0], huge).is_err());
        assert!(decode_i32_rice_payload(&[1, 16, 0], huge).is_err());
    }

    #[test]
    fn silence_and_sine_roundtrip() {
        let silence = vec![0i16; 100];
        let (f, p) = encode_block_payload(&silence);
        assert_eq!(f, FLAG_SILENCE);
        assert_eq!(decode_block_payload(f, &p, silence.len()).unwrap(), silence);

        let sine: Vec<i16> = (0..4096)
            .map(|i| ((i as f32 * 0.02).sin() * 12000.0) as i16)
            .collect();
        let (f2, p2) = encode_block_payload(&sine);
        let back = decode_block_payload(f2, &p2, sine.len()).unwrap();
        assert_eq!(sine, back);
    }

    #[test]
    fn v4_payload_estimate_matches_materialized_bytes() {
        let fixtures: Vec<Vec<i16>> = vec![
            vec![0; 4096],
            vec![1234; 4096],
            (0..4096)
                .map(|i| ((i as f64 * 0.014).sin() * 24_000.0) as i16)
                .collect(),
            (0..4096)
                .map(|i| {
                    let noise = (i as u32)
                        .wrapping_mul(1_664_525)
                        .wrapping_add(1_013_904_223);
                    (noise >> 16) as i16
                })
                .collect(),
        ];
        for samples in fixtures {
            let (_, payload) = encode_block_payload_v4(&samples);
            assert_eq!(
                estimate_block_payload_v4_bytes(&samples),
                payload.len(),
                "estimate must include exact metadata and Rice byte padding"
            );
        }
    }

    #[test]
    fn rice_packed_roundtrip_and_smaller_than_varint() {
        let sine: Vec<i16> = (0..4096)
            .map(|i| ((i as f32 * 0.02).sin() * 12000.0) as i16)
            .collect();
        let (varint_b, rice_b) = rice_vs_varint_payload_bytes(&sine);
        assert!(
            rice_b + rice_b / 20 < varint_b,
            "expected ≥5% Rice savings: varint={varint_b} rice≈{rice_b}"
        );
        let (f, p) = encode_block_payload(&sine);
        assert_eq!(f, FLAG_RICE_PACKED, "sine should prefer packed Rice");
        assert_eq!(decode_block_payload(f, &p, sine.len()).unwrap(), sine);
    }

    #[test]
    fn decoder_accepts_legacy_varint_and_packed() {
        let samples: Vec<i16> = (0..512)
            .map(|i| ((i as f32 * 0.05).sin() * 8000.0) as i16)
            .collect();
        let order = 2u8;
        let res = residuals(&samples, order);
        let mut varint = Vec::new();
        varint.push(order);
        varint.extend(&(res.len() as u32).to_le_bytes());
        for &r in &res {
            write_varint(&mut varint, zigzag32(r));
        }
        assert_eq!(
            decode_block_payload(FLAG_RICE, &varint, samples.len()).unwrap(),
            samples
        );
        let packed = encode_rice_packed_payload(&samples, order).expect("packed");
        assert_eq!(
            decode_block_payload(FLAG_RICE_PACKED, &packed, samples.len()).unwrap(),
            samples
        );
    }

    #[test]
    fn i32_side_payload_roundtrips_17_bit_values() {
        let samples = vec![-65535, 65535, 0, -1, 1, 32768, -32769];
        let payload = encode_i32_rice_payload(&samples);
        assert!((1..=16).contains(&payload[0]));
        assert_eq!(payload[1], 17);
        assert_eq!(
            decode_i32_rice_payload(&payload, samples.len()).unwrap(),
            samples
        );
    }

    #[test]
    fn predicted_i32_side_roundtrips_extremes() {
        let samples = vec![i32::MIN, i32::MAX, i32::MIN + 1, i32::MAX - 1, 0, -1, 1];
        let payload = encode_i32_predicted_rice_payload(&samples).expect("predicted payload");
        assert_eq!(
            decode_i32_predicted_rice_payload(&payload, samples.len()).unwrap(),
            samples
        );
    }

    #[test]
    fn predicted_i32_side_improves_smooth_signal() {
        let samples: Vec<i32> = (0..4096)
            .map(|i| ((i as f64 * 0.014).sin() * 60_000.0) as i32)
            .collect();
        let raw = encode_i32_rice_payload(&samples);
        let predicted = encode_i32_predicted_rice_payload(&samples).expect("predicted payload");
        let order = predicted[0] as usize;
        assert!(order > 0, "smooth signal should use a predictor");
        for (index, sample) in samples.iter().take(order).enumerate() {
            let offset = 1 + index * 4;
            assert_eq!(
                i32::from_le_bytes(predicted[offset..offset + 4].try_into().unwrap()),
                *sample,
                "i32 warm-up {index} must be stored verbatim"
            );
        }
        let parts_offset = 1 + order * 4;
        assert!((1..=16).contains(&predicted[parts_offset]));
        assert!((8..=32).contains(&predicted[parts_offset + 1]));
        assert!(
            predicted.len() < raw.len(),
            "predicted={} raw={}",
            predicted.len(),
            raw.len()
        );
    }

    #[test]
    fn predicted_i32_rejects_truncated_verbatim_warmup() {
        let mut payload = vec![2];
        payload.extend_from_slice(&123i32.to_le_bytes());
        let error = decode_i32_predicted_rice_payload(&payload, 2).unwrap_err();
        assert!(error.contains("warm-up"), "{error}");
    }

    /// Phase 4.0 go/no-go: projected Rice savings across a small corpus.
    #[test]
    fn phase40_rice_go_nogo_corpus() {
        let fixtures: Vec<Vec<i16>> = vec![
            (0..8192)
                .map(|i| ((i as f32 * 0.02).sin() * 20000.0) as i16)
                .collect(),
            (0..8192)
                .map(|i| {
                    let t = i as f32 / 8192.0;
                    ((1.0 - t).powi(3) * 16000.0) as i16
                })
                .collect(),
            (0..8192)
                .map(|i| {
                    let n = ((i as u32).wrapping_mul(1103515245).wrapping_add(12345) >> 16) as i16;
                    n / 8
                })
                .collect(),
            {
                let mut v = vec![0i16; 2048];
                v.extend((0..4096).map(|i| ((i as f32 * 0.03).sin() * 10000.0) as i16));
                v.extend(std::iter::repeat(0i16).take(2048));
                v
            },
        ];
        let mut varint_total = 0usize;
        let mut rice_total = 0usize;
        for fx in &fixtures {
            // Measure only on non-trivial blocks (skip pure silence).
            let mut i = 0;
            while i < fx.len() {
                let end = (i + 4096).min(fx.len());
                let block = &fx[i..end];
                if !block.iter().all(|&s| s == 0) {
                    let (v, r) = rice_vs_varint_payload_bytes(block);
                    assert!(
                        r < usize::MAX / 4,
                        "packed Rice encode failed on a corpus block"
                    );
                    varint_total += v;
                    rice_total += r;
                }
                i = end;
            }
        }
        let saving = 1.0 - (rice_total as f64 / varint_total.max(1) as f64);
        eprintln!(
            "Phase 4.0 Rice go/no-go: varint={varint_total} rice={rice_total} saving={pct:.1}%",
            pct = saving * 100.0
        );
        assert!(
            saving >= 0.05,
            "Rice projected saving {:.1}% < 5% — deprioritize packed Rice",
            saving * 100.0
        );
    }
}
