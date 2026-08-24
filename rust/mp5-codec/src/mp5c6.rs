//! MP5-C (CodecId 6) -- lossy MDCT loud path with bit-exact protect islands.
//!
//! Normative reference: `docs/MP5C_NEXT_SPEC.md`. Magic `0x43 0x36`, 28-byte
//! CRC-protected header, C2-style units plus a mandatory trailing unit CRC.
//!
//! Relationship to the other codecs:
//! - `mp5c2` (CodecId 5) stays bit-exact and untouched; this module reuses its
//!   protect planner ([`mp5c2::plan_protect_units`]) so `%protected` cannot
//!   diverge between the two streams.
//! - `mp5c3` supplies the MDCT coding core for `TAG_MDCT` payloads.
//!
//! Every decode path fails closed: unknown magic, bad header/unit CRC, unknown
//! tag or profile, reserved flag bits, a payload length that runs past the
//! buffer, a unit that decodes to the wrong sample count, or a frame/hop total
//! that disagrees with the header all return `Err`. A truncated stream is never
//! decoded to short PCM.

use crate::mp5c::{self, Preset};
use crate::mp5c2::{
    self, PlannedUnit, ProtectParams, TAG_BAND, TAG_LOSSLESS, TAG_LOSSY, TAG_MDCT, TAG_SR,
    UNIT_SIZE_FRAMES,
};
use crate::mp5c3;
use crate::mp5l::{self, crc32_bytes};

/// First magic byte (`'C'`).
pub const MAGIC0: u8 = 0x43;
/// Second magic byte (`'6'`) -- distinct from C2's `0x34` and classic version bytes.
pub const MAGIC1: u8 = 0x36;
/// Byte-exact stream header length (spec 3.1).
pub const HEADER_LEN: usize = 28;
/// Unit prefix: `tag(1) + n_frames(4) + payload_len(4)`.
const UNIT_PREFIX_LEN: usize = 9;
/// Trailing per-unit CRC-32/IEEE.
const UNIT_CRC_LEN: usize = 4;

/// Transitional lab profile: raw per-band `f32` scale steps (spec 3.2). Never freezable.
pub const PROFILE_TRANSITIONAL_LAB: u8 = 0;

/// Coded scalefactors: log-domain global gain + Rice-coded band deltas
/// (spec 3.2, Phase 4.1). Candidate for freeze once golden fixtures land.
pub const PROFILE_CODED_SCALEFACTORS: u8 = 1;

/// Partitioned coefficient coding: partitioned escaped Rice + HF zero-runs
/// on top of coded scalefactors (spec 3.2.2, Phase 4.2).
pub const PROFILE_PARTITIONED_COEFFS: u8 = 2;

/// Phase 5 syntax family: profile 2 coding plus joint stereo (per-band M/S,
/// `flags` bits 0-1) and window switching (`flags` bits 2-3, Phase 5.2).
pub const PROFILE_PHASE5: u8 = 3;

/// Profile written by this build's encoder.
pub const DEFAULT_PROFILE: u8 = PROFILE_PHASE5;

/// Map a declared `profile_id` onto the MDCT scalefactor syntax it promises.
///
/// Decoders use this to cross-check the self-describing `mp5c3` payload magic
/// against the header, so a mislabeled stream fails closed instead of decoding
/// under the wrong syntax.
pub fn sf_mode_for_profile(profile_id: u8) -> Result<mp5c3::SfMode, String> {
    match profile_id {
        PROFILE_TRANSITIONAL_LAB => Ok(mp5c3::SfMode::RawF32),
        PROFILE_CODED_SCALEFACTORS | PROFILE_PARTITIONED_COEFFS | PROFILE_PHASE5 => {
            Ok(mp5c3::SfMode::Coded)
        }
        other => Err(format!(
            "MP5-C (CodecId 6) profile_id {other} unsupported by this build"
        )),
    }
}

/// Map a declared `profile_id` onto the coefficient coding its writer used.
///
/// Coefficient pack records are self-describing (per-record flag), so decoders
/// accept every known flag under any profile; this mapping selects what the
/// *encoder* writes.
pub fn coeff_mode_for_profile(profile_id: u8) -> Result<mp5c3::CoeffMode, String> {
    match profile_id {
        PROFILE_TRANSITIONAL_LAB | PROFILE_CODED_SCALEFACTORS => Ok(mp5c3::CoeffMode::Legacy),
        PROFILE_PARTITIONED_COEFFS | PROFILE_PHASE5 => Ok(mp5c3::CoeffMode::Partitioned),
        other => Err(format!(
            "MP5-C (CodecId 6) profile_id {other} unsupported by this build"
        )),
    }
}

/// `flags` bit fields (spec 3.3): bits 0-1 `joint_stereo_mode`, bits 2-3
/// `window_mode`, bits 4-15 reserved.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Flags {
    pub joint_stereo_mode: u8,
    pub window_mode: u8,
}

impl Flags {
    pub fn parse(raw: u16, profile_id: u8) -> Result<Flags, String> {
        let f = Flags {
            joint_stereo_mode: (raw & 0x3) as u8,
            window_mode: ((raw >> 2) & 0x3) as u8,
        };
        if raw >> 4 != 0 {
            return Err(format!(
                "MP5-C (CodecId 6) flags 0x{raw:04x} set reserved bits (fail-closed)"
            ));
        }
        if profile_id == PROFILE_PHASE5 {
            if f.joint_stereo_mode > 1 {
                return Err(format!(
                    "MP5-C (CodecId 6) joint_stereo_mode {} unsupported (0 or 1 in this revision)",
                    f.joint_stereo_mode
                ));
            }
            if f.window_mode > 1 {
                return Err(format!(
                    "MP5-C (CodecId 6) window_mode {} unsupported (0 or 1 in this revision)",
                    f.window_mode
                ));
            }
        } else if raw != 0 {
            return Err(format!(
                "MP5-C (CodecId 6) flags 0x{raw:04x} not supported by this revision"
            ));
        }
        Ok(f)
    }

    pub fn raw(self) -> u16 {
        self.joint_stereo_mode as u16 | ((self.window_mode as u16) << 2)
    }
}
/// Encoder build revision written into the header (spec 9.1).
/// 1 = Phase 2 scaffold + Phase 4.1 coded scalefactors;
/// 2 = Phase 4.2 partitioned coefficients + Phase 4.3 deterministic rate control;
/// 3 = Phase 5 joint stereo + window switching + psycho model + boundary seeding.
/// 4 = transient planner recent-peak + running-mean gates (no start/stop churn on
///     bass rings) + joint bitmap hold inside short bursts + whole-frame M/S cost
///     guard + psycho steps capped at the legacy allocation + quiet-passage quality
///     (Extreme noise_frac 0.006, High 0.010; passage-adaptive quiet floor gated on
///     the louder channel). Same bitstream syntax; decode is unaffected.
/// 5 = rated-path (ABR/CBR) channel-budget fix: the shared reservoir's bisection
///     maximizes spend up to budget, so uncapped it handed the whole pair allowance
///     to the first channel and the second starved (measured ch0 24.9 / ch1 1.1 dB
///     SNR on a real track). Channels now split the hop budget by content. Also
///     Low/Standard quiet-passage floors + noise lift + HF band caps. Unconstrained
///     output is byte-identical to rev 4.
/// 6 = stereo ABR 128 corpus calibration: width-normalized psycho tonality,
///     legacy-safe masking cap, 1.1x protect thresholds, and a stricter 256x
///     short-block attack gate. Same syntax; prior streams decode unchanged.
/// 7 = protect framing is charged exactly once and joint transient planning
///     consumes channel amplitude rather than squaring channel energy twice.
///     ABR 128 uses the dev-calibrated 32x attack gate, rate search retains
///     the finest fitting candidate, and decoder allocation validation is
///     hardened. Syntax remains unchanged.
pub const ENCODER_REVISION: u16 = 7;
/// Shipping protect widen scale, matching MP5-C2.
pub const PROTECT_SCALE: f64 = 1.5;
/// ABR 128 stereo spends most of the default protect tax on the MDCT path.
const ABR_128_PROTECT_SCALE: f64 = 1.1;
const ABR_128_WINDOW_ATTACK_RATIO: f32 = 32.0;
/// Assumed rate when a caller cannot supply one. Writers should always pass a real rate.
pub const DEFAULT_SAMPLE_RATE: u32 = 44100;

const MIN_SAMPLE_RATE: u32 = 8000;
const MAX_CHANNELS: u8 = 2;

/// Container CodecId this bitstream is declared under.
pub const CODEC_ID: u8 = 6;

fn crc32(bytes: &[u8]) -> u32 {
    crc32_bytes(bytes.iter().copied())
}

/// Decoded stream header (spec 3.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Header {
    pub channels: u8,
    pub profile_id: u8,
    pub sample_rate_hz: u32,
    pub total_frames: u32,
    pub mdct_frame_count: u32,
    pub target_bitrate_kbps: u16,
    pub encoder_revision: u16,
    pub flags: u16,
    pub unit_size: u16,
}

impl Header {
    fn write(&self, out: &mut Vec<u8>) {
        out.push(MAGIC0);
        out.push(MAGIC1);
        out.push(self.channels);
        out.push(self.profile_id);
        out.extend(&self.sample_rate_hz.to_le_bytes());
        out.extend(&self.total_frames.to_le_bytes());
        out.extend(&self.mdct_frame_count.to_le_bytes());
        out.extend(&self.target_bitrate_kbps.to_le_bytes());
        out.extend(&self.encoder_revision.to_le_bytes());
        out.extend(&self.flags.to_le_bytes());
        out.extend(&self.unit_size.to_le_bytes());
        debug_assert_eq!(out.len(), HEADER_LEN - 4);
        let crc = crc32(&out[..HEADER_LEN - 4]);
        out.extend(&crc.to_le_bytes());
        debug_assert_eq!(out.len(), HEADER_LEN);
    }

    /// Parse and validate a CodecId 6 header. Fails closed on every anomaly.
    pub fn parse(data: &[u8]) -> Result<Header, String> {
        if data.len() < HEADER_LEN {
            return Err("truncated MP5-C (CodecId 6) header".into());
        }
        if data[0] != MAGIC0 || data[1] != MAGIC1 {
            return Err("invalid MP5-C (CodecId 6) stream: bad magic".into());
        }
        let stored = u32::from_le_bytes(data[24..28].try_into().unwrap());
        let actual = crc32(&data[..HEADER_LEN - 4]);
        if stored != actual {
            return Err(format!(
                "MP5-C (CodecId 6) header CRC mismatch (stored 0x{stored:08x}, computed 0x{actual:08x})"
            ));
        }
        let h = Header {
            channels: data[2],
            profile_id: data[3],
            sample_rate_hz: u32::from_le_bytes(data[4..8].try_into().unwrap()),
            total_frames: u32::from_le_bytes(data[8..12].try_into().unwrap()),
            mdct_frame_count: u32::from_le_bytes(data[12..16].try_into().unwrap()),
            target_bitrate_kbps: u16::from_le_bytes(data[16..18].try_into().unwrap()),
            encoder_revision: u16::from_le_bytes(data[18..20].try_into().unwrap()),
            flags: u16::from_le_bytes(data[20..22].try_into().unwrap()),
            unit_size: u16::from_le_bytes(data[22..24].try_into().unwrap()),
        };
        if h.channels == 0 || h.channels > MAX_CHANNELS {
            return Err(format!(
                "MP5-C (CodecId 6) channels {} unsupported (1 or 2 in this revision)",
                h.channels
            ));
        }
        sf_mode_for_profile(h.profile_id)?;
        if h.sample_rate_hz < MIN_SAMPLE_RATE {
            return Err(format!(
                "MP5-C (CodecId 6) sample_rate_hz {} below 8000",
                h.sample_rate_hz
            ));
        }
        // Phase 2 defines joint_stereo_mode = 0, window_mode = 0, reserved = 0.
        // Phase 5 (profile 3) assigns bits 0-3; everything else stays fail-closed.
        Flags::parse(h.flags, h.profile_id)?;
        if h.unit_size == 0 {
            return Err("MP5-C (CodecId 6) unit_size must be non-zero".into());
        }
        Ok(h)
    }
}

fn push_unit(out: &mut Vec<u8>, tag: u8, n_frames: u32, payload: &[u8]) {
    let start = out.len();
    out.push(tag);
    out.extend(&n_frames.to_le_bytes());
    out.extend(&(payload.len() as u32).to_le_bytes());
    out.extend(payload);
    let crc = crc32(&out[start..]);
    out.extend(&crc.to_le_bytes());
}

fn mdct_pool_for_target(total: usize, unit_count: usize, protect_payload_bytes: usize) -> usize {
    let framing = HEADER_LEN + unit_count * (UNIT_PREFIX_LEN + UNIT_CRC_LEN);
    total.saturating_sub(framing + protect_payload_bytes)
}

/// Rate-control mode for one encode (Phase 4.3, spec 6.3).
///
/// All modes are deterministic: every search they drive is bounded, so
/// re-encoding the same input on the same build is byte-identical.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RateMode {
    /// Preset quality, no rate target. Header `target_bitrate_kbps` = 0.
    Off,
    /// VBR quality index in 1/4-log2 step-grid units (positive = finer).
    /// Header `target_bitrate_kbps` = 0: a VBR stream has no rate claim.
    Vbr { qi: i32 },
    /// Average-rate target with a wide reservoir. Header records the target.
    Abr { kbps: u32 },
    /// Constant-rate target with a narrow reservoir. Header records the target.
    Cbr { kbps: u32 },
}

impl RateMode {
    /// Target written into the stream header (0 = unconstrained operating point).
    fn header_kbps(self) -> u16 {
        match self {
            RateMode::Abr { kbps } | RateMode::Cbr { kbps } => kbps as u16,
            _ => 0,
        }
    }

    fn budget_mode(self) -> Option<(u32, mp5c3::BudgetMode)> {
        match self {
            RateMode::Abr { kbps } => Some((kbps, mp5c3::BudgetMode::Abr)),
            RateMode::Cbr { kbps } => Some((kbps, mp5c3::BudgetMode::Cbr)),
            _ => None,
        }
    }
}

/// Encode with the shipping protect thresholds (widen 1.5) and no rate target.
pub fn encode(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    sample_rate: u32,
) -> Result<Vec<u8>, String> {
    encode_inner(
        samples,
        channels,
        preset,
        ProtectParams::widened(PROTECT_SCALE),
        sample_rate,
        RateMode::Off,
        EncodeOptions::default_for(channels),
    )
}

/// Encode pinned to an explicit `profile_id`.
///
/// Used by the lab to measure the coded-scalefactor profile against the
/// transitional raw-`f32` baseline on identical input.
pub fn encode_with_profile(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    sample_rate: u32,
    profile_id: u8,
) -> Result<Vec<u8>, String> {
    encode_inner(
        samples,
        channels,
        preset,
        ProtectParams::widened(PROTECT_SCALE),
        sample_rate,
        RateMode::Off,
        EncodeOptions {
            profile_id,
            ..EncodeOptions::default()
        },
    )
}

/// Encode with explicit protect thresholds and a nominal ABR target.
///
/// `target_bitrate_kbps` is a real deterministic ABR target in this revision
/// (spec 6.3): `0` means "unconstrained operating point".
pub fn encode_with_protect(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    protect: ProtectParams,
    sample_rate: u32,
    target_bitrate_kbps: u16,
) -> Result<Vec<u8>, String> {
    let rate = if target_bitrate_kbps > 0 {
        RateMode::Abr {
            kbps: target_bitrate_kbps as u32,
        }
    } else {
        RateMode::Off
    };
    encode_inner(
        samples,
        channels,
        preset,
        protect,
        sample_rate,
        rate,
        EncodeOptions::default_for(channels),
    )
}

/// Optional encode features beyond the rate mode.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EncodeOptions {
    pub profile_id: u8,
    /// Phase 5.1 per-band joint stereo (profile 3, `flags.joint_stereo_mode = 1`).
    pub joint_stereo: bool,
    /// Phase 5.2 window switching (profile 3, `flags.window_mode = 1`).
    pub window_switching: bool,
    /// Phase 5.3 psychoacoustic step allocation (encoder-side only).
    pub psycho: bool,
}

impl Default for EncodeOptions {
    fn default() -> Self {
        Self {
            profile_id: DEFAULT_PROFILE,
            joint_stereo: false,
            window_switching: false,
            psycho: false,
        }
    }
}

impl EncodeOptions {
    /// Shipping defaults (Phase 5): profile 3 with joint stereo (stereo only)
    /// and window switching on. The psycho model stays opt-in until its
    /// operating point passes listening iteration.
    pub fn default_for(channels: u8) -> Self {
        Self {
            profile_id: DEFAULT_PROFILE,
            joint_stereo: channels == 2,
            window_switching: true,
            psycho: false,
        }
    }
}

/// Encode with an explicit rate-control mode (Phase 4.3).
///
/// Protect islands are budgeted first and consume rate budget ahead of the
/// MDCT pool — the tax is disclosed through the mandatory three-figure report
/// (spec 4.4), never hidden.
pub fn encode_with_rate(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    sample_rate: u32,
    rate: RateMode,
) -> Result<Vec<u8>, String> {
    let mut options = EncodeOptions::default_for(channels);
    let protect_scale = if channels == 2 && rate == (RateMode::Abr { kbps: 128 }) {
        // At this operating point protect bytes are more valuable in the MDCT
        // pool. Short blocks remain enabled for true attacks.
        options.psycho = true;
        ABR_128_PROTECT_SCALE
    } else {
        PROTECT_SCALE
    };
    encode_with_options(
        samples,
        channels,
        preset,
        ProtectParams::widened(protect_scale),
        sample_rate,
        rate,
        options,
    )
}

/// Encode with full control over rate mode and Phase 5 options.
pub fn encode_with_options(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    protect: ProtectParams,
    sample_rate: u32,
    rate: RateMode,
    options: EncodeOptions,
) -> Result<Vec<u8>, String> {
    encode_inner(
        samples,
        channels,
        preset,
        protect,
        sample_rate,
        rate,
        options,
    )
}

#[allow(clippy::too_many_arguments)]
fn encode_inner(
    samples: &[i16],
    channels: u8,
    preset: Preset,
    protect: ProtectParams,
    sample_rate: u32,
    rate: RateMode,
    options: EncodeOptions,
) -> Result<Vec<u8>, String> {
    let profile_id = options.profile_id;
    let sf_mode = sf_mode_for_profile(profile_id)?;
    let coeff_mode = coeff_mode_for_profile(profile_id)?;
    // Joint stereo is a profile-3 feature (flags bit 0-1); it is an error to
    // request it anywhere else rather than silently writing the wrong flags.
    if options.joint_stereo && profile_id != PROFILE_PHASE5 {
        return Err(format!(
            "MP5-C (CodecId 6) joint stereo requires profile {PROFILE_PHASE5}, got {profile_id}"
        ));
    }
    if options.joint_stereo && channels != 2 {
        return Err("MP5-C (CodecId 6) joint stereo requires stereo input".into());
    }
    if options.window_switching && profile_id != PROFILE_PHASE5 {
        return Err(format!(
            "MP5-C (CodecId 6) window switching requires profile {PROFILE_PHASE5}, got {profile_id}"
        ));
    }
    if options.psycho && profile_id != PROFILE_PHASE5 {
        return Err(format!(
            "MP5-C (CodecId 6) psycho model requires profile {PROFILE_PHASE5}, got {profile_id}"
        ));
    }
    let flags = Flags {
        joint_stereo_mode: u8::from(options.joint_stereo),
        window_mode: u8::from(options.window_switching),
    };
    if channels == 0 || channels > MAX_CHANNELS {
        return Err(format!(
            "MP5-C (CodecId 6) channels {channels} unsupported (1 or 2 in this revision)"
        ));
    }
    if sample_rate < MIN_SAMPLE_RATE {
        return Err(format!(
            "MP5-C (CodecId 6) sample_rate {sample_rate} below 8000"
        ));
    }
    if let RateMode::Abr { kbps } | RateMode::Cbr { kbps } = rate {
        if kbps == 0 || kbps > u16::MAX as u32 {
            return Err(format!(
                "MP5-C (CodecId 6) rate target {kbps} kbps out of range (1..=65535)"
            ));
        }
    }
    let ch = channels as usize;
    if samples.len() % ch != 0 {
        return Err("MP5-C (CodecId 6) sample count is not a multiple of channel count".into());
    }
    let frames = samples.len() / ch;
    if frames > u32::MAX as usize {
        return Err("MP5-C (CodecId 6) frame count exceeds u32".into());
    }

    let plan: Vec<PlannedUnit> = mp5c2::plan_protect_units(samples, ch, sample_rate, &protect);

    // Pass 1: protect islands. They are bit-exact MP5-L and consume rate
    // budget ahead of the MDCT pool (spec 6.3: the protect tax is disclosed,
    // never laundered into the loud path).
    struct Staged {
        tag: u8,
        n: u32,
        payload: Option<Vec<u8>>,
        start: usize,
        end: usize,
    }
    let mut staged: Vec<Staged> = Vec::with_capacity(plan.len());
    let mut protect_payload_bytes = 0usize;
    let mut mdct_frames_total = 0usize;
    for (marker, start, end) in plan {
        let n = end - start;
        if marker == TAG_LOSSY {
            mdct_frames_total += n;
            staged.push(Staged {
                tag: TAG_MDCT,
                n: n as u32,
                payload: None,
                start,
                end,
            });
        } else {
            let payload = mp5l::encode(&samples[start * ch..end * ch], channels);
            if payload.len() > u32::MAX as usize {
                return Err("MP5-C (CodecId 6) unit payload exceeds u32".into());
            }
            protect_payload_bytes += payload.len();
            staged.push(Staged {
                tag: marker,
                n: n as u32,
                payload: Some(payload),
                start,
                end,
            });
        }
    }

    // The MDCT pool: whatever the target leaves after framing and protect.
    let budgeted = rate.budget_mode();
    let mdct_pool = match budgeted {
        Some((kbps, _)) => {
            let total = mp5c3::bitrate_budget_bytes(kbps, frames, sample_rate);
            mdct_pool_for_target(total, staged.len(), protect_payload_bytes)
        }
        None => 0,
    };

    // Pass 2: MDCT units. The pool is distributed in proportion to unit
    // frames; the remainder goes to the last loud unit (deterministic).
    let loud_count = staged.iter().filter(|s| s.payload.is_none()).count();
    let mut units: Vec<(u8, u32, Vec<u8>)> = Vec::with_capacity(staged.len());
    let mut mdct_hops: usize = 0;
    let mut assigned = 0usize;
    let mut loud_seen = 0usize;
    for unit in staged {
        let payload = match unit.payload {
            Some(p) => p,
            None => {
                loud_seen += 1;
                let rate_control = match budgeted {
                    Some((_, mode)) => {
                        let share = if mdct_frames_total == 0 {
                            0
                        } else {
                            ((mdct_pool as u128 * (unit.end - unit.start) as u128)
                                / mdct_frames_total as u128) as usize
                        };
                        assigned += share;
                        let mut budget = share;
                        if loud_seen == loud_count {
                            budget += mdct_pool - assigned;
                        }
                        mp5c3::RateControl::Budgeted {
                            bytes: budget,
                            mode,
                        }
                    }
                    None => match rate {
                        RateMode::Vbr { qi } => mp5c3::RateControl::Vbr { qi },
                        _ => mp5c3::RateControl::Off,
                    },
                };
                // Loud runs are MDCT under CodecId 6 -- never TAG_SR (spec 4.3).
                // Phase 5.4: seed the MDCT overlap with the real neighbors so
                // unit boundaries are continuous (decoder needs no change).
                let pre_start = unit.start.saturating_sub(mp5c3::mdct::HOP);
                let post_end = (unit.end + mp5c3::mdct::HOP).min(frames);
                let payload = mp5c3::encode_with_context(
                    &samples[unit.start * ch..unit.end * ch],
                    channels,
                    preset,
                    {
                        let p = mp5c3::EncodeParams::full(
                            sf_mode,
                            coeff_mode,
                            rate_control,
                            if options.joint_stereo {
                                mp5c3::StereoMode::JointPerBand
                            } else {
                                mp5c3::StereoMode::Independent
                            },
                            options.window_switching,
                        );
                        let p = if channels == 2 && rate == (RateMode::Abr { kbps: 128 }) {
                            p.with_window_attack_ratio(ABR_128_WINDOW_ATTACK_RATIO)
                        } else {
                            p
                        };
                        if options.psycho {
                            p.with_psycho(sample_rate)
                        } else {
                            p
                        }
                    },
                    (
                        &samples[pre_start * ch..unit.start * ch],
                        &samples[unit.end * ch..post_end * ch],
                    ),
                );
                mdct_hops += mp5c3::hop_record_count(&payload)?;
                payload
            }
        };
        if payload.len() > u32::MAX as usize {
            return Err("MP5-C (CodecId 6) unit payload exceeds u32".into());
        }
        units.push((unit.tag, unit.n, payload));
    }

    if mdct_hops > u32::MAX as usize {
        return Err("MP5-C (CodecId 6) MDCT hop count exceeds u32".into());
    }

    let header = Header {
        channels,
        profile_id,
        sample_rate_hz: sample_rate,
        total_frames: frames as u32,
        mdct_frame_count: mdct_hops as u32,
        target_bitrate_kbps: rate.header_kbps(),
        encoder_revision: ENCODER_REVISION,
        flags: flags.raw(),
        unit_size: UNIT_SIZE_FRAMES as u16,
    };

    let payload_total: usize = units.iter().map(|(_, _, p)| p.len()).sum();
    let mut out = Vec::with_capacity(
        HEADER_LEN + units.len() * (UNIT_PREFIX_LEN + UNIT_CRC_LEN) + payload_total,
    );
    header.write(&mut out);
    for (tag, n, payload) in &units {
        push_unit(&mut out, *tag, *n, payload);
    }
    Ok(out)
}

/// One parsed unit view into the stream buffer.
struct UnitRef<'a> {
    tag: u8,
    n_frames: usize,
    payload: &'a [u8],
}

/// Walk units with full bounds + CRC validation. Fails closed on any anomaly,
/// including trailing bytes that are not a complete unit.
fn units_of(data: &[u8]) -> Result<Vec<UnitRef<'_>>, String> {
    let mut pos = HEADER_LEN;
    let mut units = Vec::new();
    while pos < data.len() {
        if pos + UNIT_PREFIX_LEN + UNIT_CRC_LEN > data.len() {
            return Err("truncated MP5-C (CodecId 6) unit header".into());
        }
        let tag = data[pos];
        let n_frames = u32::from_le_bytes(data[pos + 1..pos + 5].try_into().unwrap()) as usize;
        let payload_len = u32::from_le_bytes(data[pos + 5..pos + 9].try_into().unwrap()) as usize;
        let payload_start = pos + UNIT_PREFIX_LEN;
        let payload_end = payload_start
            .checked_add(payload_len)
            .ok_or_else(|| "MP5-C (CodecId 6) unit payload length overflow".to_string())?;
        let crc_end = payload_end
            .checked_add(UNIT_CRC_LEN)
            .ok_or_else(|| "MP5-C (CodecId 6) unit length overflow".to_string())?;
        if crc_end > data.len() {
            return Err(format!(
                "MP5-C (CodecId 6) unit payload length {payload_len} runs past end of stream"
            ));
        }
        let stored = u32::from_le_bytes(data[payload_end..crc_end].try_into().unwrap());
        let actual = crc32(&data[pos..payload_end]);
        if stored != actual {
            return Err(format!(
                "MP5-C (CodecId 6) unit CRC mismatch (stored 0x{stored:08x}, computed 0x{actual:08x})"
            ));
        }
        units.push(UnitRef {
            tag,
            n_frames,
            payload: &data[payload_start..payload_end],
        });
        pos = crc_end;
    }
    Ok(units)
}

/// Decode one unit's payload, cross-checking MDCT syntax against the header.
#[allow(clippy::too_many_arguments)]
fn decode_unit(
    unit: &UnitRef<'_>,
    ch: usize,
    header: &Header,
    declared_sf: mp5c3::SfMode,
    declared_joint: bool,
    declared_windowed: bool,
    mdct_hops: &mut usize,
) -> Result<Vec<i16>, String> {
    let want = unit
        .n_frames
        .checked_mul(ch)
        .ok_or_else(|| "MP5-C (CodecId 6) unit frame count overflow".to_string())?;
    let decoded = match unit.tag {
        TAG_LOSSLESS | TAG_BAND => mp5l::decode(unit.payload)?,
        TAG_MDCT => {
            let syntax = mp5c3::stream_syntax(unit.payload)?;
            if syntax.sf != declared_sf
                || syntax.joint != declared_joint
                || syntax.windowed != declared_windowed
            {
                return Err(format!(
                    "MP5-C (CodecId 6) TAG_MDCT syntax {syntax:?} \
                     contradicts header profile_id {} / flags 0x{:04x}",
                    header.profile_id, header.flags
                ));
            }
            *mdct_hops += mp5c3::hop_record_count(unit.payload)?;
            mp5c3::decode(unit.payload)?
        }
        // Decode-only migration path; new encoders never write it (spec 4.2).
        TAG_LOSSY => mp5c::decode(unit.payload)?,
        TAG_SR => {
            return Err(
                "MP5-C (CodecId 6) TAG_SR is MP5-C2-only and must not appear (fail-closed)".into(),
            );
        }
        other => {
            return Err(format!(
                "unsupported MP5-C (CodecId 6) unit tag 0x{other:02x} (fail-closed)"
            ));
        }
    };
    if decoded.len() != want {
        return Err(format!(
            "MP5-C (CodecId 6) unit tag 0x{:02x} decoded {} samples, header declares {want}",
            unit.tag,
            decoded.len()
        ));
    }
    Ok(decoded)
}

/// Decode a CodecId 6 stream to interleaved i16 PCM.
///
/// Protect units (`TAG_LOSSLESS` / `TAG_BAND`) come back sample-exact; MDCT
/// units are lossy. Any inconsistency errors instead of returning short PCM.
pub fn decode(data: &[u8]) -> Result<Vec<i16>, String> {
    let header = Header::parse(data)?;
    let ch = header.channels as usize;
    let declared_flags = Flags::parse(header.flags, header.profile_id)?;
    let declared_sf = sf_mode_for_profile(header.profile_id)?;
    // The Phase 5 features the header advertises for TAG_MDCT payloads.
    let declared_joint =
        header.profile_id == PROFILE_PHASE5 && declared_flags.joint_stereo_mode == 1;
    let declared_windowed = header.profile_id == PROFILE_PHASE5 && declared_flags.window_mode == 1;
    let units = units_of(data)?;
    let declared_unit_frames = units.iter().try_fold(0usize, |total, unit| {
        total
            .checked_add(unit.n_frames)
            .ok_or_else(|| "MP5-C (CodecId 6) aggregate unit frame count overflow".to_string())
    })?;
    if declared_unit_frames != header.total_frames as usize {
        return Err(format!(
            "MP5-C (CodecId 6) units declare {declared_unit_frames} frames, header declares {}",
            header.total_frames
        ));
    }

    // Do not reserve from an untrusted header. Each validated unit grows the
    // output only after its payload has decoded to the declared sample count.
    let mut out: Vec<i16> = Vec::new();
    let mut frames_seen: usize = 0;
    let mut mdct_hops: usize = 0;

    for unit in &units {
        let decoded = decode_unit(
            unit,
            ch,
            &header,
            declared_sf,
            declared_joint,
            declared_windowed,
            &mut mdct_hops,
        )?;
        out.extend_from_slice(&decoded);
        frames_seen += unit.n_frames;
    }

    if frames_seen != header.total_frames as usize {
        return Err(format!(
            "MP5-C (CodecId 6) decoded {frames_seen} frames, header declares {}",
            header.total_frames
        ));
    }
    if header.mdct_frame_count as usize != mdct_hops {
        return Err(format!(
            "MP5-C (CodecId 6) decoded {mdct_hops} MDCT hops, header declares {}",
            header.mdct_frame_count
        ));
    }
    if out.len() != header.total_frames as usize * ch {
        return Err("MP5-C (CodecId 6) decoded sample count mismatch".into());
    }
    Ok(out)
}

/// Seek decode (Phase 5.4): decode only the units covering
/// `[start_frame, start_frame + num_frames)` instead of the whole stream.
///
/// Units are indexable frames: the unit table is walked by length (payloads
/// are skipped, never partially decoded), and every touched unit is fully
/// validated (header CRC, unit CRCs, syntax cross-check, frame counts) — the
/// same fail-closed behavior as [`decode`]. MDCT units carry their boundary
/// context in the payload (Phase 5.4 encoder seeding), so each unit decodes
/// standalone without preroll.
pub fn decode_range(data: &[u8], start_frame: u32, num_frames: u32) -> Result<Vec<i16>, String> {
    let header = Header::parse(data)?;
    let ch = header.channels as usize;
    let declared_flags = Flags::parse(header.flags, header.profile_id)?;
    let declared_sf = sf_mode_for_profile(header.profile_id)?;
    let declared_joint =
        header.profile_id == PROFILE_PHASE5 && declared_flags.joint_stereo_mode == 1;
    let declared_windowed = header.profile_id == PROFILE_PHASE5 && declared_flags.window_mode == 1;
    let units = units_of(data)?;

    let total = header.total_frames as usize;
    let start = start_frame as usize;
    let want = num_frames as usize;
    if start > total || start + want > total {
        return Err(format!(
            "MP5-C (CodecId 6) seek range [{start_frame}, +{num_frames}) past stream end ({total})"
        ));
    }

    let mut out: Vec<i16> = Vec::with_capacity(want * ch);
    let mut unit_start = 0usize;
    let mut mdct_hops: usize = 0;
    for unit in &units {
        let unit_end = unit_start + unit.n_frames;
        let overlap_start = unit_start.max(start);
        let overlap_end = unit_end.min(start + want);
        if overlap_start < overlap_end {
            let decoded = decode_unit(
                unit,
                ch,
                &header,
                declared_sf,
                declared_joint,
                declared_windowed,
                &mut mdct_hops,
            )?;
            let from = (overlap_start - unit_start) * ch;
            let to = (overlap_end - unit_start) * ch;
            out.extend_from_slice(&decoded[from..to]);
        }
        unit_start = unit_end;
    }
    if unit_start != total {
        return Err(format!(
            "MP5-C (CodecId 6) units cover {unit_start} frames, header declares {total}"
        ));
    }
    if out.len() != want * ch {
        return Err("MP5-C (CodecId 6) seek decode sample count mismatch".into());
    }
    Ok(out)
}

/// Per-tag unit statistics (spec 4.4).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct TagStats {
    pub units: usize,
    pub frames: usize,
    pub payload_bytes: usize,
}

impl TagStats {
    fn add(&mut self, frames: usize, bytes: usize) {
        self.units += 1;
        self.frames += frames;
        self.payload_bytes += bytes;
    }

    fn to_json(self) -> String {
        format!(
            "{{\"units\":{},\"frames\":{},\"payload_bytes\":{}}}",
            self.units, self.frames, self.payload_bytes
        )
    }
}

/// Unit-mix report for a CodecId 6 (or CodecId 5) stream.
///
/// Publishes the three mandatory figures of spec 4.4: coded-path bitrate,
/// protected sample/byte percentages, and the raw bitstream size.
#[derive(Debug, Default, Clone)]
pub struct UnitMix {
    /// `6` for MP5-C, `5` for an MP5-C2 stream inspected through the same call.
    pub codec_id: u8,
    pub channels: usize,
    /// `0` when the stream format does not carry a rate (MP5-C2).
    pub sample_rate_hz: u32,
    /// `None` for MP5-C2, which has no profile field.
    pub profile_id: Option<u8>,
    pub encoder_revision: Option<u16>,
    pub target_bitrate_kbps: Option<u16>,
    pub unit_size: usize,
    /// `total_frames` as declared by the header.
    pub declared_frames: usize,
    /// `mdct_frame_count` as declared by the header (CodecId 6 only).
    pub declared_mdct_frames: Option<usize>,
    /// Frames actually covered by units.
    pub total_frames: usize,
    pub total_units: usize,
    pub total_payload_bytes: usize,
    /// Whole codec bitstream size in bytes, framing included.
    pub stream_bytes: usize,
    pub lossless_l: TagStats,
    pub lossless_b: TagStats,
    pub mdct: TagStats,
    pub legacy_lossy: TagStats,
    pub signal_relative: TagStats,
    pub unknown: TagStats,
}

impl UnitMix {
    /// Protect-island frames as a percentage of all frames (spec 4.4b).
    pub fn protected_sample_pct(&self) -> f64 {
        if self.total_frames == 0 {
            return 0.0;
        }
        100.0 * (self.lossless_l.frames + self.lossless_b.frames) as f64 / self.total_frames as f64
    }

    /// Protect-island payload as a percentage of all payload bytes (spec 4.4b).
    pub fn protected_byte_pct(&self) -> f64 {
        if self.total_payload_bytes == 0 {
            return 0.0;
        }
        100.0 * (self.lossless_l.payload_bytes + self.lossless_b.payload_bytes) as f64
            / self.total_payload_bytes as f64
    }

    /// Payload bytes spent on lossy units only -- protect islands excluded (spec 4.4a).
    pub fn coded_path_bytes(&self) -> usize {
        self.mdct.payload_bytes + self.legacy_lossy.payload_bytes
    }

    /// Media duration in seconds, or `None` when the rate is unknown.
    pub fn duration_seconds(&self) -> Option<f64> {
        if self.sample_rate_hz == 0 || self.total_frames == 0 {
            return None;
        }
        Some(self.total_frames as f64 / self.sample_rate_hz as f64)
    }

    /// Coded-path bitrate in kbps (lossy units over media duration, spec 4.4a).
    pub fn coded_path_kbps(&self) -> Option<f64> {
        let seconds = self.duration_seconds()?;
        Some(self.coded_path_bytes() as f64 * 8.0 / 1000.0 / seconds)
    }

    /// Stable JSON for the JS lab / bench harness. Integers are exact; the three
    /// derived figures are emitted as numbers (`coded_path_kbps` is `null` when
    /// the stream carries no sample rate).
    pub fn to_json(&self) -> String {
        let kbps = match self.coded_path_kbps() {
            Some(v) => format!("{v:.6}"),
            None => "null".to_string(),
        };
        let duration = match self.duration_seconds() {
            Some(v) => format!("{v:.9}"),
            None => "null".to_string(),
        };
        let opt_num = |v: Option<u64>| match v {
            Some(v) => v.to_string(),
            None => "null".to_string(),
        };
        format!(
            concat!(
                "{{\"codec_id\":{},\"channels\":{},\"sample_rate_hz\":{},\"profile_id\":{},",
                "\"encoder_revision\":{},\"target_bitrate_kbps\":{},\"unit_size\":{},",
                "\"declared_frames\":{},\"declared_mdct_frames\":{},\"total_frames\":{},",
                "\"total_units\":{},\"total_payload_bytes\":{},\"stream_bytes\":{},",
                "\"duration_seconds\":{},\"tags\":{{\"lossless_l\":{},\"lossless_b\":{},",
                "\"mdct\":{},\"legacy_lossy\":{},\"signal_relative\":{},\"unknown\":{}}},",
                "\"protected_sample_pct\":{:.6},\"protected_byte_pct\":{:.6},",
                "\"coded_path_bytes\":{},\"coded_path_kbps\":{}}}"
            ),
            self.codec_id,
            self.channels,
            self.sample_rate_hz,
            opt_num(self.profile_id.map(u64::from)),
            opt_num(self.encoder_revision.map(u64::from)),
            opt_num(self.target_bitrate_kbps.map(u64::from)),
            self.unit_size,
            self.declared_frames,
            opt_num(self.declared_mdct_frames.map(|v| v as u64)),
            self.total_frames,
            self.total_units,
            self.total_payload_bytes,
            self.stream_bytes,
            duration,
            self.lossless_l.to_json(),
            self.lossless_b.to_json(),
            self.mdct.to_json(),
            self.legacy_lossy.to_json(),
            self.signal_relative.to_json(),
            self.unknown.to_json(),
            self.protected_sample_pct(),
            self.protected_byte_pct(),
            self.coded_path_bytes(),
            kbps,
        )
    }
}

fn tally(mix: &mut UnitMix, tag: u8, frames: usize, bytes: usize) {
    mix.total_units += 1;
    mix.total_frames += frames;
    mix.total_payload_bytes += bytes;
    match tag {
        TAG_LOSSLESS => mix.lossless_l.add(frames, bytes),
        TAG_BAND => mix.lossless_b.add(frames, bytes),
        TAG_MDCT => mix.mdct.add(frames, bytes),
        TAG_LOSSY => mix.legacy_lossy.add(frames, bytes),
        TAG_SR => mix.signal_relative.add(frames, bytes),
        _ => mix.unknown.add(frames, bytes),
    }
}

/// Inspect the unit mix of a CodecId 6 stream, or of an MP5-C2 (CodecId 5)
/// stream so the two can be compared with one code path.
///
/// Validation is as strict as [`decode`] for CodecId 6 (header CRC, unit CRCs,
/// bounds, declared frame/hop totals) minus the actual audio decode.
pub fn inspect_unit_mix(data: &[u8]) -> Result<UnitMix, String> {
    if data.len() >= 2 && data[0] == mp5c2_magic0() && data[1] == mp5c2_magic1() {
        return inspect_mp5c2(data);
    }
    let header = Header::parse(data)?;
    let units = units_of(data)?;
    let mut mix = UnitMix {
        codec_id: CODEC_ID,
        channels: header.channels as usize,
        sample_rate_hz: header.sample_rate_hz,
        profile_id: Some(header.profile_id),
        encoder_revision: Some(header.encoder_revision),
        target_bitrate_kbps: Some(header.target_bitrate_kbps),
        unit_size: header.unit_size as usize,
        declared_frames: header.total_frames as usize,
        declared_mdct_frames: Some(header.mdct_frame_count as usize),
        stream_bytes: data.len(),
        ..UnitMix::default()
    };
    let mut mdct_hops = 0usize;
    for unit in &units {
        if unit.tag == TAG_MDCT {
            mdct_hops += mp5c3::hop_record_count(unit.payload)?;
        }
        tally(&mut mix, unit.tag, unit.n_frames, unit.payload.len());
    }
    if mix.total_frames != mix.declared_frames {
        return Err(format!(
            "MP5-C (CodecId 6) unit frames {} disagree with header {}",
            mix.total_frames, mix.declared_frames
        ));
    }
    if header.mdct_frame_count as usize != mdct_hops {
        return Err(format!(
            "MP5-C (CodecId 6) MDCT hops {mdct_hops} disagree with header {}",
            header.mdct_frame_count
        ));
    }
    Ok(mix)
}

fn mp5c2_magic0() -> u8 {
    0x43
}
fn mp5c2_magic1() -> u8 {
    0x34
}

/// MP5-C2 units carry no CRC and no rate; report what the format does provide.
fn inspect_mp5c2(data: &[u8]) -> Result<UnitMix, String> {
    const C2_HEADER_LEN: usize = 10;
    if data.len() < C2_HEADER_LEN {
        return Err("truncated MP5-C2 header".into());
    }
    let mut mix = UnitMix {
        codec_id: 5,
        channels: data[2].max(1) as usize,
        unit_size: u16::from_le_bytes(data[4..6].try_into().unwrap()) as usize,
        declared_frames: u32::from_le_bytes(data[6..10].try_into().unwrap()) as usize,
        stream_bytes: data.len(),
        ..UnitMix::default()
    };
    let mut pos = C2_HEADER_LEN;
    while pos < data.len() {
        if pos + UNIT_PREFIX_LEN > data.len() {
            return Err("truncated MP5-C2 unit header".into());
        }
        let tag = data[pos];
        let n = u32::from_le_bytes(data[pos + 1..pos + 5].try_into().unwrap()) as usize;
        let len = u32::from_le_bytes(data[pos + 5..pos + 9].try_into().unwrap()) as usize;
        let end = (pos + UNIT_PREFIX_LEN)
            .checked_add(len)
            .filter(|e| *e <= data.len())
            .ok_or_else(|| "truncated MP5-C2 unit".to_string())?;
        tally(&mut mix, tag, n, len);
        pos = end;
    }
    if mix.total_frames != mix.declared_frames {
        return Err(format!(
            "MP5-C2 unit frames {} disagree with header {}",
            mix.total_frames, mix.declared_frames
        ));
    }
    Ok(mix)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pcm;

    const SR: u32 = 44100;

    fn interleave(frames: usize, ch: usize, f: impl Fn(usize, usize) -> i16) -> Vec<i16> {
        let mut s = vec![0i16; frames * ch];
        for i in 0..frames {
            for c in 0..ch {
                s[i * ch + c] = f(i, c);
            }
        }
        s
    }

    /// Loud head, decaying tail: guarantees both MDCT and protect units.
    fn mixed_signal(frames: usize, ch: usize) -> Vec<i16> {
        interleave(frames, ch, |i, _| {
            let t = i as f64 / frames as f64;
            let amp = if t < 0.4 {
                0.5
            } else {
                0.5 * (-(t - 0.4) * 12.0).exp()
            };
            ((i as f64 * 0.06).sin() * amp * 32767.0) as i16
        })
    }

    fn tags(stream: &[u8]) -> Vec<u8> {
        units_of(stream).unwrap().iter().map(|u| u.tag).collect()
    }

    #[test]
    fn header_is_28_bytes_with_spec_magic_and_fields() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 8, 2);
        let enc = encode(&s, 2, Preset::High, SR).unwrap();
        assert_eq!(enc[0], 0x43, "magic0");
        assert_eq!(enc[1], 0x36, "magic1");
        let h = Header::parse(&enc).unwrap();
        assert_eq!(h.channels, 2);
        assert_eq!(h.profile_id, DEFAULT_PROFILE);
        assert_eq!(h.profile_id, PROFILE_PHASE5);
        assert_eq!(h.encoder_revision, ENCODER_REVISION);
        assert_eq!(h.sample_rate_hz, SR);
        assert_eq!(h.total_frames as usize, UNIT_SIZE_FRAMES * 8);
        assert_eq!(h.unit_size as usize, UNIT_SIZE_FRAMES);
        assert_eq!(h.encoder_revision, ENCODER_REVISION);
        assert_eq!(
            h.flags, 5,
            "shipping defaults: joint stereo + window switching"
        );
        assert!(h.mdct_frame_count > 0, "loud content must record MDCT hops");
        assert_eq!(HEADER_LEN, 28);
    }

    #[test]
    fn roundtrip_preserves_sample_count() {
        for ch in [1usize, 2] {
            let s = mixed_signal(UNIT_SIZE_FRAMES * 6, ch);
            let enc = encode(&s, ch as u8, Preset::High, SR).unwrap();
            let dec = decode(&enc).unwrap();
            assert_eq!(dec.len(), s.len(), "duration drift on {ch}ch");
        }
    }

    #[test]
    fn protect_islands_are_sample_exact() {
        let ch = 2usize;
        let frames = UNIT_SIZE_FRAMES * 10;
        let s = mixed_signal(frames, ch);
        let enc = encode(&s, ch as u8, Preset::High, SR).unwrap();
        let units = units_of(&enc).unwrap();
        let mut start = 0usize;
        let mut protect_units = 0usize;
        for unit in &units {
            let end = start + unit.n_frames;
            if unit.tag == TAG_LOSSLESS || unit.tag == TAG_BAND {
                let decoded = mp5l::decode(unit.payload).unwrap();
                assert_eq!(
                    decoded,
                    s[start * ch..end * ch].to_vec(),
                    "protect unit tag 0x{:02x} at frames {start}..{end} must be sample-exact",
                    unit.tag
                );
                protect_units += 1;
            }
            start = end;
        }
        assert_eq!(start, frames);
        assert!(protect_units > 0, "fixture must contain protect islands");
        // And the same spans must be exact through the public decoder.
        let dec = decode(&enc).unwrap();
        let mut start = 0usize;
        for unit in &units {
            let end = start + unit.n_frames;
            if unit.tag == TAG_LOSSLESS || unit.tag == TAG_BAND {
                assert_eq!(
                    &dec[start * ch..end * ch],
                    &s[start * ch..end * ch],
                    "full decode must keep protect islands sample-exact"
                );
            }
            start = end;
        }
    }

    #[test]
    fn loud_runs_use_mdct_and_never_signal_relative() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 8, 2);
        let enc = encode(&s, 2, Preset::High, SR).unwrap();
        let t = tags(&enc);
        assert!(t.contains(&TAG_MDCT), "loud run must be TAG_MDCT");
        assert!(!t.contains(&TAG_SR), "TAG_SR is MP5-C2-only");
        assert!(!t.contains(&TAG_LOSSY), "legacy tag must not be written");
    }

    /// Profile 0 is transitional, but streams already written under it must
    /// keep decoding forever. Both profiles must also protect islands
    /// sample-exactly and agree on duration.
    #[test]
    fn both_profiles_decode_and_profile_1_is_smaller() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 8, 2);
        let legacy =
            encode_with_profile(&s, 2, Preset::High, SR, PROFILE_TRANSITIONAL_LAB).unwrap();
        let coded =
            encode_with_profile(&s, 2, Preset::High, SR, PROFILE_CODED_SCALEFACTORS).unwrap();

        assert_eq!(Header::parse(&legacy).unwrap().profile_id, 0);
        assert_eq!(Header::parse(&coded).unwrap().profile_id, 1);
        assert_eq!(decode(&legacy).unwrap().len(), s.len());
        assert_eq!(decode(&coded).unwrap().len(), s.len());
        assert!(
            coded.len() < legacy.len(),
            "coded scalefactors {} B must beat raw f32 {} B",
            coded.len(),
            legacy.len()
        );

        // Protect islands stay bit-exact under both profiles.
        for enc in [&legacy, &coded] {
            let dec = decode(enc).unwrap();
            let mut frame = 0usize;
            for unit in units_of(enc).unwrap() {
                if matches!(unit.tag, TAG_LOSSLESS | TAG_BAND) {
                    let a = frame * 2;
                    let b = a + unit.n_frames * 2;
                    assert_eq!(&dec[a..b], &s[a..b], "protect island not sample-exact");
                }
                frame += unit.n_frames;
            }
        }

        // An unsupported profile is refused at encode time, not written out.
        assert!(encode_with_profile(&s, 2, Preset::High, SR, 7).is_err());
    }

    #[test]
    fn silence_is_all_protect_and_bit_exact() {
        let s = vec![0i16; UNIT_SIZE_FRAMES * 4 * 2];
        let enc = encode(&s, 2, Preset::High, SR).unwrap();
        assert_eq!(decode(&enc).unwrap(), s);
        let mix = inspect_unit_mix(&enc).unwrap();
        assert_eq!(mix.protected_sample_pct(), 100.0);
        assert_eq!(mix.mdct.units, 0);
        assert_eq!(mix.declared_mdct_frames, Some(0));
    }

    /// Loud / near-silent / loud: guarantees MDCT units *and* protect islands
    /// in one stream, which is what the protect-budget test needs.
    fn loud_quiet_loud_signal(frames: usize, ch: usize) -> Vec<i16> {
        let mut rng: u32 = 0x2468_ace0;
        let mut s = vec![0i16; frames * ch];
        for i in 0..frames {
            let t = i as f64 / frames as f64;
            rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
            let noise = ((rng >> 8) as f64 / (1u32 << 24) as f64 - 0.5) * 6000.0;
            let v = if t < 0.4 || t > 0.65 {
                (i as f64 * 0.061).sin() * 14000.0 + (i as f64 * 0.023).sin() * 7000.0 + noise
            } else {
                (i as f64 * 0.061).sin() * 2.0
            };
            let q = v.clamp(-32768.0, 32767.0) as i16;
            for c in 0..ch {
                s[i * ch + c] = q;
            }
        }
        s
    }

    fn asymmetric_stereo_signal(frames: usize) -> Vec<i16> {
        let mut rng: u32 = 0x1357_9bdf;
        let mut s = vec![0i16; frames * 2];
        for i in 0..frames {
            rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
            let noise = ((rng >> 8) as f64 / (1u32 << 24) as f64 - 0.5) * 1800.0;
            let l =
                (i as f64 * 0.061).sin() * 13_000.0 + (i as f64 * 0.017).sin() * 5_000.0 + noise;
            let r = (i as f64 * 0.047).sin() * 11_000.0 + (i as f64 * 0.029).sin() * 6_000.0
                - noise * 0.7;
            s[i * 2] = l.clamp(-32768.0, 32767.0) as i16;
            s[i * 2 + 1] = r.clamp(-32768.0, 32767.0) as i16;
        }
        s
    }

    /// Default encode is profile 3 (Phase 5 defaults); the explicit profile
    /// ladder stays reachable for baselines, and every profile stays decodable.
    #[test]
    fn profile_3_is_default_and_profile_2_repacks_lossless() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 8, 2);
        let p1 = encode_with_profile(&s, 2, Preset::High, SR, PROFILE_CODED_SCALEFACTORS).unwrap();
        let p2 = encode_with_profile(&s, 2, Preset::High, SR, PROFILE_PARTITIONED_COEFFS).unwrap();
        let def = encode(&s, 2, Preset::High, SR).unwrap();
        let dh = Header::parse(&def).unwrap();
        assert_eq!(dh.profile_id, PROFILE_PHASE5);
        assert_eq!(dh.encoder_revision, ENCODER_REVISION);
        assert_eq!(
            dh.flags, 5,
            "default flags: joint stereo + window switching"
        );
        assert_eq!(
            def,
            encode_with_options(
                &s,
                2,
                Preset::High,
                ProtectParams::widened(PROTECT_SCALE),
                SR,
                RateMode::Off,
                EncodeOptions::default_for(2),
            )
            .unwrap(),
            "default encode must equal the Phase 5 default options"
        );
        assert!(
            p2.len() < p1.len(),
            "profile 2 {} B must beat profile 1 {} B",
            p2.len(),
            p1.len()
        );
        assert_eq!(
            decode(&p1).unwrap(),
            decode(&p2).unwrap(),
            "profiles must decode to identical PCM (partitioned pack is lossless)"
        );
        for p in [
            PROFILE_TRANSITIONAL_LAB,
            PROFILE_CODED_SCALEFACTORS,
            PROFILE_PARTITIONED_COEFFS,
        ] {
            let enc = encode_with_profile(&s, 2, Preset::High, SR, p).unwrap();
            assert_eq!(
                decode(&enc).unwrap().len(),
                s.len(),
                "profile {p} must decode"
            );
        }
        assert!(encode_with_profile(&s, 2, Preset::High, SR, 7).is_err());
    }

    /// Phase 4.3 headline: ABR hits the ladder with protect islands consuming
    /// budget ahead of the MDCT pool, and islands stay sample-exact.
    #[test]
    fn protect_budget_charges_framing_once() {
        let total = 10_000usize;
        let units = 7usize;
        let protect_payload = 1_234usize;
        let framing = HEADER_LEN + units * (UNIT_PREFIX_LEN + UNIT_CRC_LEN);
        assert_eq!(
            mdct_pool_for_target(total, units, protect_payload),
            total - framing - protect_payload,
        );
    }

    #[test]
    fn abr_ladder_hits_targets_with_protect_consuming_budget() {
        let frames = SR as usize * 6;
        let s = loud_quiet_loud_signal(frames, 2);
        let seconds = frames as f64 / SR as f64;
        for kbps in [320u32, 192, 128] {
            let enc = encode_with_rate(&s, 2, Preset::High, SR, RateMode::Abr { kbps }).unwrap();
            let h = Header::parse(&enc).unwrap();
            assert_eq!(h.target_bitrate_kbps, kbps as u16);
            let mix = inspect_unit_mix(&enc).unwrap();
            assert!(
                mix.lossless_l.units + mix.lossless_b.units > 0,
                "fixture must contain protect islands"
            );
            assert!(mix.mdct.units > 0, "fixture must contain MDCT units");
            let achieved = enc.len() as f64 * 8.0 / 1000.0 / seconds;
            let err = (achieved - kbps as f64).abs() / kbps as f64;
            eprintln!(
                "PHASE4.3 c6 abr {kbps}: achieved {achieved:.1} kbps ({:.2}% off), \
                 protect {:.1}% samples / {:.1}% bytes, total {} B",
                err * 100.0,
                mix.protected_sample_pct(),
                mix.protected_byte_pct(),
                enc.len()
            );
            assert!(
                err <= 0.03,
                "ABR {kbps} off by {:.1}% (bar: ±3%)",
                err * 100.0
            );
            // Protect islands stay sample-exact under rate control.
            let dec = decode(&enc).unwrap();
            let mut frame = 0usize;
            for unit in units_of(&enc).unwrap() {
                if matches!(unit.tag, TAG_LOSSLESS | TAG_BAND) {
                    let a = frame * 2;
                    let b = a + unit.n_frames * 2;
                    assert_eq!(
                        &dec[a..b],
                        &s[a..b],
                        "protect island not sample-exact at {kbps}"
                    );
                }
                frame += unit.n_frames;
            }
            // Deterministic rate control: byte-identical re-encode.
            assert_eq!(
                enc,
                encode_with_rate(&s, 2, Preset::High, SR, RateMode::Abr { kbps }).unwrap(),
                "ABR {kbps} encode is not deterministic"
            );
        }
    }

    #[test]
    fn abr128_shipping_policy_matches_the_calibrated_path() {
        let s = loud_quiet_loud_signal(SR as usize * 2, 2);
        let rate = RateMode::Abr { kbps: 128 };
        let actual = encode_with_rate(&s, 2, Preset::High, SR, rate).unwrap();
        let expected = encode_with_options(
            &s,
            2,
            Preset::High,
            ProtectParams::widened(ABR_128_PROTECT_SCALE),
            SR,
            rate,
            EncodeOptions {
                profile_id: DEFAULT_PROFILE,
                joint_stereo: true,
                window_switching: true,
                psycho: true,
            },
        )
        .unwrap();
        assert_eq!(actual, expected);

        let h = Header::parse(&actual).unwrap();
        assert_eq!(Flags::parse(h.flags, h.profile_id).unwrap().window_mode, 1);
    }

    /// Regression: rated joint-stereo encodes must not starve the second
    /// channel. The shared reservoir's bisection maximizes spend up to budget,
    /// so without a per-channel share the first channel consumed the entire
    /// pair allowance and the second decoded at ~1 dB SNR (measured on a real
    /// 48 kHz track at ABR 192: ch0 24.9 dB, ch1 1.1 dB before the fix). The
    /// ladder test above never caught it because it asserted size, not
    /// per-channel quality.
    #[test]
    fn abr_joint_stereo_keeps_channels_balanced() {
        let frames = SR as usize * 6;
        let s = asymmetric_stereo_signal(frames);
        assert!(s.chunks_exact(2).any(|frame| frame[0] != frame[1]));
        let enc = encode_with_rate(&s, 2, Preset::High, SR, RateMode::Abr { kbps: 192 }).unwrap();
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), s.len());
        let mut snr = [0.0f64; 2];
        for (ch, slot) in snr.iter_mut().enumerate() {
            let mut sig = 0f64;
            let mut err = 0f64;
            for i in (ch..s.len()).step_by(2) {
                sig += (s[i] as f64) * (s[i] as f64);
                let d = s[i] as f64 - dec[i] as f64;
                err += d * d;
            }
            *slot = 10.0 * (sig / err.max(1e-9)).log10();
        }
        eprintln!(
            "ABR192 joint channel SNR: L {:.2} dB, R {:.2} dB",
            snr[0], snr[1]
        );
        assert!(
            snr[0].min(snr[1]) >= 10.0,
            "a channel starved: L {:.2} / R {:.2} dB (floor 10 dB)",
            snr[0],
            snr[1]
        );
        assert!(
            (snr[0] - snr[1]).abs() <= 6.0,
            "channel imbalance {:.2} dB (bar: 6 dB)",
            (snr[0] - snr[1]).abs()
        );
    }

    #[test]
    fn cbr_ladder_hits_targets_at_container_level() {
        let frames = SR as usize * 6;
        let s = loud_quiet_loud_signal(frames, 2);
        let seconds = frames as f64 / SR as f64;
        for kbps in [320u32, 192, 128] {
            let enc = encode_with_rate(&s, 2, Preset::High, SR, RateMode::Cbr { kbps }).unwrap();
            let achieved = enc.len() as f64 * 8.0 / 1000.0 / seconds;
            let err = (achieved - kbps as f64).abs() / kbps as f64;
            eprintln!(
                "PHASE4.3 c6 cbr {kbps}: achieved {achieved:.1} kbps ({:.2}% off)",
                err * 100.0
            );
            assert!(
                err <= 0.03,
                "CBR {kbps} off by {:.1}% (bar: ±3%)",
                err * 100.0
            );
        }
    }

    #[test]
    fn vbr_qi_writes_no_rate_target_and_scales_size() {
        let frames = SR as usize * 3;
        let s = loud_quiet_loud_signal(frames, 2);
        let mut sizes = Vec::new();
        for qi in [-8i32, 0, 8] {
            let enc = encode_with_rate(&s, 2, Preset::High, SR, RateMode::Vbr { qi }).unwrap();
            assert_eq!(
                Header::parse(&enc).unwrap().target_bitrate_kbps,
                0,
                "VBR must not claim a rate target"
            );
            sizes.push(enc.len());
        }
        assert!(
            sizes[0] < sizes[1] && sizes[1] < sizes[2],
            "VBR size not monotone in qi: {sizes:?}"
        );
    }

    #[test]
    fn rate_target_is_validated() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        assert!(encode_with_rate(&s, 2, Preset::High, SR, RateMode::Abr { kbps: 0 }).is_err());
        assert!(encode_with_rate(&s, 2, Preset::High, SR, RateMode::Abr { kbps: 70000 }).is_err());
        assert!(encode_with_rate(&s, 2, Preset::High, SR, RateMode::Cbr { kbps: 0 }).is_err());
        // Unconstrained encodes write target 0.
        let enc = encode(&s, 2, Preset::High, SR).unwrap();
        assert_eq!(Header::parse(&enc).unwrap().target_bitrate_kbps, 0);
    }

    // ---- Phase 5.1: profile 3 joint stereo ----

    fn phase5_joint_opts() -> EncodeOptions {
        EncodeOptions {
            profile_id: PROFILE_PHASE5,
            joint_stereo: true,
            window_switching: false,
            psycho: false,
        }
    }

    #[test]
    fn profile_3_joint_stereo_end_to_end() {
        let frames = SR as usize * 6;
        let s = loud_quiet_loud_signal(frames, 2);
        let joint = encode_with_options(
            &s,
            2,
            Preset::High,
            ProtectParams::widened(PROTECT_SCALE),
            SR,
            RateMode::Off,
            phase5_joint_opts(),
        )
        .unwrap();
        let h = Header::parse(&joint).unwrap();
        assert_eq!(h.profile_id, 3);
        assert_eq!(h.flags, 1, "joint_stereo_mode must be advertised in flags");

        // Every TAG_MDCT payload must be the joint (M5) syntax.
        for unit in units_of(&joint).unwrap() {
            if unit.tag == TAG_MDCT {
                assert_eq!(unit.payload[0], 0x4d);
                assert_eq!(unit.payload[1], 0x35, "payload must be joint syntax");
            }
        }

        // Decode works, duration preserved, protect islands sample-exact.
        let dec = decode(&joint).unwrap();
        assert_eq!(dec.len(), s.len());
        let mut frame = 0usize;
        for unit in units_of(&joint).unwrap() {
            if matches!(unit.tag, TAG_LOSSLESS | TAG_BAND) {
                let a = frame * 2;
                let b = a + unit.n_frames * 2;
                assert_eq!(&dec[a..b], &s[a..b], "protect island not sample-exact");
            }
            frame += unit.n_frames;
        }

        // And it beats the independent profile 2 on size for this correlated-ish signal.
        let p2 = encode(&s, 2, Preset::High, SR).unwrap();
        eprintln!(
            "PHASE5.1 c6: profile2 {} B -> profile3-joint {} B ({:.1}% saved)",
            p2.len(),
            joint.len(),
            100.0 * (1.0 - joint.len() as f64 / p2.len() as f64)
        );
        // Margin: the joint record carries 5 B/block of type+bitmap overhead the
        // independent record does not, so a wash on M/S savings shows as a small
        // loss. At the finer High operating point (rev 4, noise_frac 0.010) the
        // side channel codes more faithfully and M/S saves less on this fixture —
        // the guard is "never lose by more than the overhead" (~0.5%).
        assert!(
            joint.len() as f64 <= p2.len() as f64 * 1.005,
            "joint profile 3 lost to profile 2 by more than the record overhead: {} vs {} B",
            joint.len(),
            p2.len()
        );
    }

    #[test]
    fn profile_3_without_joint_writes_zero_flags_and_m4_payload() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 6, 2);
        let enc = encode_with_options(
            &s,
            2,
            Preset::High,
            ProtectParams::widened(PROTECT_SCALE),
            SR,
            RateMode::Off,
            EncodeOptions {
                profile_id: PROFILE_PHASE5,
                joint_stereo: false,
                window_switching: false,
                psycho: false,
            },
        )
        .unwrap();
        let h = Header::parse(&enc).unwrap();
        assert_eq!(h.profile_id, 3);
        assert_eq!(h.flags, 0);
        for unit in units_of(&enc).unwrap() {
            if unit.tag == TAG_MDCT {
                assert_eq!(unit.payload[1], 0x34, "independent payload expected");
            }
        }
        assert_eq!(decode(&enc).unwrap().len(), s.len());
    }

    #[test]
    fn joint_stereo_requires_profile_3_and_stereo() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        let mono: Vec<i16> = s.iter().step_by(2).copied().collect();
        for (profile, ch, samples) in [(2u8, 2u8, s.clone()), (3u8, 1u8, mono)] {
            assert!(
                encode_with_options(
                    &samples,
                    ch,
                    Preset::High,
                    ProtectParams::widened(PROTECT_SCALE),
                    SR,
                    RateMode::Off,
                    EncodeOptions {
                        profile_id: profile,
                        joint_stereo: true,
                        window_switching: false,
                        psycho: false,
                    },
                )
                .is_err(),
                "joint with profile {profile} ch {ch} must be refused"
            );
        }
    }

    #[test]
    fn profile_3_flags_and_payload_contradictions_fail_closed() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        let joint = encode_with_options(
            &s,
            2,
            Preset::High,
            ProtectParams::widened(PROTECT_SCALE),
            SR,
            RateMode::Off,
            phase5_joint_opts(),
        )
        .unwrap();

        // Reserved flag bit, invalid joint mode, window mode (not yet assigned):
        // all fail closed even with a repaired header CRC.
        for raw_flags in [0x0010u16, 0x0002, 0x0004] {
            let mut bad = joint.clone();
            bad[20..22].copy_from_slice(&raw_flags.to_le_bytes());
            let crc = crc32(&bad[..HEADER_LEN - 4]);
            bad[24..28].copy_from_slice(&crc.to_le_bytes());
            assert!(
                decode(&bad).is_err(),
                "flags 0x{raw_flags:04x} must fail closed"
            );
        }

        // Payload/flags contradiction: header says independent, payload is M5.
        let mut bad = joint.clone();
        bad[20..22].copy_from_slice(&0u16.to_le_bytes());
        let crc = crc32(&bad[..HEADER_LEN - 4]);
        bad[24..28].copy_from_slice(&crc.to_le_bytes());
        let err = decode(&bad).unwrap_err();
        assert!(err.contains("contradicts"), "unexpected error: {err}");
    }

    #[test]
    fn every_profile_decodes_forever() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 6, 2);
        for (profile, joint) in [(0u8, false), (1, false), (2, false), (3, false), (3, true)] {
            let enc = encode_with_options(
                &s,
                2,
                Preset::High,
                ProtectParams::widened(PROTECT_SCALE),
                SR,
                RateMode::Off,
                EncodeOptions {
                    profile_id: profile,
                    joint_stereo: joint,
                    window_switching: false,
                    psycho: false,
                },
            )
            .unwrap();
            assert_eq!(
                decode(&enc).unwrap().len(),
                s.len(),
                "profile {profile} joint={joint} must decode"
            );
        }
    }

    // ---- Phase 7: hardening (fuzz fail-closed) ----

    fn xorshift(state: &mut u64) -> u64 {
        let mut x = *state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        *state = x;
        x
    }

    /// Phase 7 fuzz gate: every profile, every corruption class — the decoder
    /// must fail closed (Err) or return *structurally valid* PCM; never panic,
    /// never return silent short garbage, never blow up memory.
    #[test]
    fn fuzz_malformed_streams_fail_closed_without_panic() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 6, 2);
        let variants: Vec<Vec<u8>> = vec![
            encode_with_profile(&s, 2, Preset::High, SR, PROFILE_TRANSITIONAL_LAB).unwrap(),
            encode_with_profile(&s, 2, Preset::High, SR, PROFILE_CODED_SCALEFACTORS).unwrap(),
            encode_with_profile(&s, 2, Preset::High, SR, PROFILE_PARTITIONED_COEFFS).unwrap(),
            encode(&s, 2, Preset::High, SR).unwrap(), // Phase 5 defaults (js+win)
            encode_with_options(
                &s,
                2,
                Preset::High,
                ProtectParams::widened(PROTECT_SCALE),
                SR,
                RateMode::Abr { kbps: 128 },
                EncodeOptions::default_for(2),
            )
            .unwrap(),
        ];

        let mut rng: u64 = 0x9e37_79b9_7f4a_7c15;
        for (vi, enc) in variants.iter().enumerate() {
            // 1. Truncation at every offset must error, never short-decode.
            for cut in (0..enc.len()).step_by(37) {
                let r = std::panic::catch_unwind(|| decode(&enc[..cut]));
                match r {
                    Ok(Ok(pcm)) => {
                        assert!(
                            pcm.len() >= s.len(),
                            "variant {vi} truncation at {cut} returned short PCM"
                        );
                    }
                    Ok(Err(_)) => {}
                    Err(_) => panic!("variant {vi} panicked on truncation at {cut}"),
                }
            }
            // 2. Byte mutations (header, unit prefixes, payloads, CRCs).
            for _ in 0..64 {
                let mut bad = enc.clone();
                for _ in 0..8 {
                    let pos = (xorshift(&mut rng) as usize) % bad.len();
                    bad[pos] ^= (xorshift(&mut rng) as u8) | 1;
                }
                let r = std::panic::catch_unwind(|| decode(&bad));
                assert!(r.is_ok(), "variant {vi} panicked on byte mutation");
                if let Ok(Ok(pcm)) = r {
                    assert_eq!(
                        pcm.len(),
                        s.len(),
                        "variant {vi} mutation returned wrong sample count"
                    );
                }
            }
            // 3. inspect_unit_mix on the same corruptions: no panic either.
            for _ in 0..16 {
                let mut bad = enc.clone();
                let pos = (xorshift(&mut rng) as usize) % bad.len();
                bad[pos] ^= 0xff;
                let r = std::panic::catch_unwind(|| inspect_unit_mix(&bad));
                assert!(r.is_ok(), "variant {vi} inspect panicked");
            }
            // 4. decode_range on truncations: fail closed.
            for cut in [enc.len() / 3, enc.len() / 2, enc.len() - 1] {
                assert!(decode_range(&enc[..cut], 0, 1024).is_err());
            }
        }

        // 5. Pure garbage and absurd lengths: no panic, bounded work.
        for seed in 0..32u64 {
            let mut g = vec![0x43u8, 0x36];
            for _ in 0..((xorshift(&mut rng) % 2048) + 28) {
                g.push(xorshift(&mut rng) as u8);
            }
            let _ = decode(&g);
            let _ = inspect_unit_mix(&g);
            let _ = decode_range(&g, 0, 1024);
        }
    }

    /// mp5c3 payload-level fuzz: corrupt every syntax family's records.
    #[test]
    fn fuzz_mp5c3_payloads_fail_closed_without_panic() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        let streams: Vec<Vec<u8>> = vec![
            mp5c3::encode(&s, 2, Preset::High),
            mp5c3::encode_with_params(
                &s,
                2,
                Preset::High,
                mp5c3::EncodeParams::new(
                    mp5c3::SfMode::Coded,
                    mp5c3::CoeffMode::Legacy,
                    mp5c3::RateControl::Off,
                ),
            ),
            mp5c3::encode_with_params(
                &s,
                2,
                Preset::High,
                mp5c3::EncodeParams::new(
                    mp5c3::SfMode::Coded,
                    mp5c3::CoeffMode::Partitioned,
                    mp5c3::RateControl::Off,
                ),
            ),
            mp5c3::encode_with_params(
                &s,
                2,
                Preset::High,
                mp5c3::EncodeParams::full(
                    mp5c3::SfMode::Coded,
                    mp5c3::CoeffMode::Partitioned,
                    mp5c3::RateControl::Off,
                    mp5c3::StereoMode::JointPerBand,
                    true,
                ),
            ),
        ];
        let mut rng: u64 = 0xdead_beef_cafe_f00d;
        for (vi, enc) in streams.iter().enumerate() {
            for cut in (0..enc.len()).step_by(29) {
                let r = std::panic::catch_unwind(|| mp5c3::decode(&enc[..cut]));
                assert!(r.is_ok(), "mp5c3 variant {vi} panicked on truncation {cut}");
            }
            for _ in 0..48 {
                let mut bad = enc.clone();
                for _ in 0..4 {
                    let pos = (xorshift(&mut rng) as usize) % bad.len();
                    bad[pos] ^= (xorshift(&mut rng) as u8) | 1;
                }
                let r = std::panic::catch_unwind(|| mp5c3::decode(&bad));
                assert!(r.is_ok(), "mp5c3 variant {vi} panicked on mutation");
                let r2 = std::panic::catch_unwind(|| mp5c3::record_stats(&bad));
                assert!(r2.is_ok(), "mp5c3 variant {vi} record_stats panicked");
            }
        }
    }

    // ---- Phase 5.2: window switching under profile 3 ----

    #[test]
    fn window_switching_end_to_end() {
        let frames = SR as usize * 6;
        let s = loud_quiet_loud_signal(frames, 2);
        let enc = encode_with_options(
            &s,
            2,
            Preset::High,
            ProtectParams::widened(PROTECT_SCALE),
            SR,
            RateMode::Off,
            EncodeOptions {
                profile_id: PROFILE_PHASE5,
                joint_stereo: false,
                window_switching: true,
                psycho: false,
            },
        )
        .unwrap();
        let h = Header::parse(&enc).unwrap();
        assert_eq!(h.profile_id, 3);
        assert_eq!(h.flags, 4, "window_mode must be advertised in flags");
        for unit in units_of(&enc).unwrap() {
            if unit.tag == TAG_MDCT {
                assert_eq!(unit.payload[1], 0x36, "payload must be windowed (M6)");
            }
        }
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), s.len());
        let mut frame = 0usize;
        for unit in units_of(&enc).unwrap() {
            if matches!(unit.tag, TAG_LOSSLESS | TAG_BAND) {
                let a = frame * 2;
                let b = a + unit.n_frames * 2;
                assert_eq!(&dec[a..b], &s[a..b], "protect island not sample-exact");
            }
            frame += unit.n_frames;
        }
    }

    #[test]
    fn window_switching_and_joint_stereo_combined() {
        let frames = SR as usize * 3;
        let s = loud_quiet_loud_signal(frames, 2);
        let enc = encode_with_options(
            &s,
            2,
            Preset::High,
            ProtectParams::widened(PROTECT_SCALE),
            SR,
            RateMode::Off,
            EncodeOptions {
                profile_id: PROFILE_PHASE5,
                joint_stereo: true,
                window_switching: true,
                psycho: false,
            },
        )
        .unwrap();
        let h = Header::parse(&enc).unwrap();
        assert_eq!(h.flags, 5, "joint + window flags");
        for unit in units_of(&enc).unwrap() {
            if unit.tag == TAG_MDCT {
                assert_eq!(unit.payload[1], 0x37, "payload must be windowed joint (M7)");
            }
        }
        assert_eq!(decode(&enc).unwrap().len(), s.len());
    }

    #[test]
    fn window_switching_requires_profile_3() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        assert!(
            encode_with_options(
                &s,
                2,
                Preset::High,
                ProtectParams::widened(PROTECT_SCALE),
                SR,
                RateMode::Off,
                EncodeOptions {
                    profile_id: 2,
                    joint_stereo: false,
                    window_switching: true,
                    psycho: false,
                },
            )
            .is_err(),
            "window switching under profile 2 must be refused"
        );
    }

    #[test]
    fn window_mode_2_and_payload_contradiction_fail_closed() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        let enc = encode_with_options(
            &s,
            2,
            Preset::High,
            ProtectParams::widened(PROTECT_SCALE),
            SR,
            RateMode::Off,
            EncodeOptions {
                profile_id: PROFILE_PHASE5,
                joint_stereo: false,
                window_switching: true,
                psycho: false,
            },
        )
        .unwrap();

        // window_mode = 2 is unassigned: fail closed even with repaired CRC.
        let mut bad = enc.clone();
        bad[20..22].copy_from_slice(&8u16.to_le_bytes());
        let crc = crc32(&bad[..HEADER_LEN - 4]);
        bad[24..28].copy_from_slice(&crc.to_le_bytes());
        assert!(decode(&bad).is_err(), "window_mode 2 must fail closed");

        // Header says no windowing, payload is M6: contradiction must fail.
        let mut bad2 = enc.clone();
        bad2[20..22].copy_from_slice(&0u16.to_le_bytes());
        let crc = crc32(&bad2[..HEADER_LEN - 4]);
        bad2[24..28].copy_from_slice(&crc.to_le_bytes());
        let err = decode(&bad2).unwrap_err();
        assert!(err.contains("contradicts"), "unexpected error: {err}");
    }

    #[test]
    fn windowed_abr_ladder_at_container_level() {
        let frames = SR as usize * 6;
        let s = loud_quiet_loud_signal(frames, 2);
        let seconds = frames as f64 / SR as f64;
        for kbps in [320u32, 128] {
            let enc = encode_with_options(
                &s,
                2,
                Preset::High,
                ProtectParams::widened(PROTECT_SCALE),
                SR,
                RateMode::Abr { kbps },
                EncodeOptions {
                    profile_id: PROFILE_PHASE5,
                    joint_stereo: false,
                    window_switching: true,
                    psycho: false,
                },
            )
            .unwrap();
            let achieved = enc.len() as f64 * 8.0 / 1000.0 / seconds;
            let err = (achieved - kbps as f64).abs() / kbps as f64;
            eprintln!(
                "PHASE5.2 c6 windowed abr {kbps}: achieved {achieved:.1} kbps ({:.2}% off)",
                err * 100.0
            );
            assert!(
                err <= 0.03,
                "windowed ABR {kbps} off by {:.1}%",
                err * 100.0
            );
        }
    }

    #[test]
    fn psycho_model_end_to_end_at_container_level() {
        let frames = SR as usize * 6;
        let s = loud_quiet_loud_signal(frames, 2);
        let seconds = frames as f64 / SR as f64;
        // Full Phase 5 stack: joint stereo + window switching + psycho, ABR.
        // On this fixture the stack's maximum quality undershoots 192 (disclosed
        // quality-ceiling behavior), so the ±3% bar is proven at constrained
        // targets (96/80) and 192 is asserted as no-overshoot.
        for kbps in [96u32, 80] {
            let enc = encode_with_options(
                &s,
                2,
                Preset::High,
                ProtectParams::widened(PROTECT_SCALE),
                SR,
                RateMode::Abr { kbps },
                EncodeOptions {
                    profile_id: PROFILE_PHASE5,
                    joint_stereo: true,
                    window_switching: true,
                    psycho: true,
                },
            )
            .unwrap();
            let h = Header::parse(&enc).unwrap();
            assert_eq!(h.profile_id, 3);
            assert_eq!(h.flags, 5, "joint + window flags (psycho is encoder-side)");
            assert_eq!(h.target_bitrate_kbps, kbps as u16);
            let achieved = enc.len() as f64 * 8.0 / 1000.0 / seconds;
            let err = (achieved - kbps as f64).abs() / kbps as f64;
            eprintln!(
                "PHASE5.3 c6 full-stack abr {kbps}: achieved {achieved:.1} kbps ({:.2}% off), {} B",
                err * 100.0,
                enc.len()
            );
            assert!(
                err <= 0.03,
                "full-stack ABR {kbps} off by {:.1}%",
                err * 100.0
            );
            let dec = decode(&enc).unwrap();
            assert_eq!(dec.len(), s.len());
            // Protect islands stay sample-exact under the full stack.
            let mut frame = 0usize;
            for unit in units_of(&enc).unwrap() {
                if matches!(unit.tag, TAG_LOSSLESS | TAG_BAND) {
                    let a = frame * 2;
                    let b = a + unit.n_frames * 2;
                    assert_eq!(&dec[a..b], &s[a..b], "protect island not sample-exact");
                }
                frame += unit.n_frames;
            }
        }
        // 192: must never overshoot; undershoot is the disclosed quality ceiling.
        let enc192 = encode_with_options(
            &s,
            2,
            Preset::High,
            ProtectParams::widened(PROTECT_SCALE),
            SR,
            RateMode::Abr { kbps: 192 },
            EncodeOptions {
                profile_id: PROFILE_PHASE5,
                joint_stereo: true,
                window_switching: true,
                psycho: true,
            },
        )
        .unwrap();
        let achieved192 = enc192.len() as f64 * 8.0 / 1000.0 / seconds;
        eprintln!(
            "PHASE5.3 c6 full-stack abr 192: achieved {achieved192:.1} kbps (quality-ceiling undershoot disclosed)",
        );
        assert!(achieved192 <= 192.0 * 1.03, "must not overshoot 192");
        let dec = decode(&enc192).unwrap();
        assert_eq!(dec.len(), s.len());
        // Protect islands stay sample-exact under the full stack.
        let mut frame = 0usize;
        for unit in units_of(&enc192).unwrap() {
            if matches!(unit.tag, TAG_LOSSLESS | TAG_BAND) {
                let a = frame * 2;
                let b = a + unit.n_frames * 2;
                assert_eq!(&dec[a..b], &s[a..b], "protect island not sample-exact");
            }
            frame += unit.n_frames;
        }
        // And the NMR screen is measurable through the same build.
        let report = crate::mp5c3::nmr_screen(&s, &dec, 2, SR).unwrap();
        eprintln!(
            "PHASE5.3 c6 full-stack nmr: max {:.2} dB trimmed {:.2} dB",
            report.max_nmr_db, report.trimmed_max_nmr_db
        );
        assert!(
            report.trimmed_max_nmr_db < 8.0,
            "full-stack NMR out of bounds"
        );
    }

    #[test]
    fn psycho_requires_profile_3() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        assert!(
            encode_with_options(
                &s,
                2,
                Preset::High,
                ProtectParams::widened(PROTECT_SCALE),
                SR,
                RateMode::Off,
                EncodeOptions {
                    profile_id: 2,
                    joint_stereo: false,
                    window_switching: false,
                    psycho: true,
                },
            )
            .is_err(),
            "psycho under profile 2 must be refused"
        );
    }

    #[test]
    fn magic_separation_both_directions() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        let c6 = encode(&s, 2, Preset::High, SR).unwrap();
        let c2 = mp5c2::encode(&s, 2, Preset::High);
        let c1 = mp5c::encode(&s, 2, Preset::High);

        assert!(mp5c2::decode(&c6).is_err(), "C2 must reject a C6 stream");
        assert!(
            mp5c::decode(&c6).is_err(),
            "classic must reject a C6 stream"
        );
        assert!(decode(&c2).is_err(), "C6 must reject a C2 stream");
        assert!(decode(&c1).is_err(), "C6 must reject a classic stream");
        assert!(
            decode(&mp5c3::encode(&s, 2, Preset::High)).is_err(),
            "C6 must reject a bare mp5c3 stream"
        );

        // Forever-decode: 1 and 5 still work.
        assert_eq!(mp5c2::decode(&c2).unwrap().len(), s.len());
        assert!(!mp5c::decode(&c1).unwrap().is_empty());
    }

    #[test]
    fn truncation_at_every_offset_fails_closed() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 6, 2);
        let enc = encode(&s, 2, Preset::High, SR).unwrap();
        let offsets = [
            1usize,
            2,
            HEADER_LEN - 1,
            HEADER_LEN,
            HEADER_LEN + 1,
            HEADER_LEN + UNIT_PREFIX_LEN,
            enc.len() / 3,
            enc.len() / 2,
            enc.len() - UNIT_CRC_LEN - 1,
            enc.len() - 1,
        ];
        for off in offsets {
            let cut = &enc[..off];
            let got = decode(cut);
            assert!(
                got.is_err(),
                "truncation at {off} must error, got {} samples",
                got.map(|v| v.len()).unwrap_or(0)
            );
        }
        // A stream cut mid-stream must never come back as short audio.
        for off in (HEADER_LEN..enc.len()).step_by(97) {
            assert!(decode(&enc[..off]).is_err(), "short decode at {off}");
        }
    }

    #[test]
    fn corrupt_header_crc_fails_closed() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        let mut enc = encode(&s, 2, Preset::High, SR).unwrap();
        enc[24] ^= 0xff;
        assert!(decode(&enc).is_err());
        assert!(inspect_unit_mix(&enc).is_err());
    }

    #[test]
    fn header_field_tampering_is_caught_by_crc() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        for byte in 0..HEADER_LEN - 4 {
            let mut enc = encode(&s, 2, Preset::High, SR).unwrap();
            enc[byte] ^= 0x01;
            assert!(
                decode(&enc).is_err(),
                "flipping header byte {byte} must fail closed"
            );
        }
    }

    #[test]
    fn corrupt_unit_crc_fails_closed() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 6, 2);
        let mut enc = encode(&s, 2, Preset::High, SR).unwrap();
        let last = enc.len() - 1;
        enc[last] ^= 0xff;
        assert!(decode(&enc).is_err());

        let mut enc2 = encode(&s, 2, Preset::High, SR).unwrap();
        // Flip a payload byte: the unit CRC must catch it before any decode.
        enc2[HEADER_LEN + UNIT_PREFIX_LEN + 3] ^= 0x40;
        assert!(decode(&enc2).is_err());
    }

    #[test]
    fn absurd_payload_length_fails_closed() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        let mut enc = encode(&s, 2, Preset::High, SR).unwrap();
        let len_at = HEADER_LEN + 5;
        enc[len_at..len_at + 4].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(decode(&enc).is_err());

        let mut enc2 = encode(&s, 2, Preset::High, SR).unwrap();
        let overshoot = enc2.len() as u32;
        enc2[len_at..len_at + 4].copy_from_slice(&overshoot.to_le_bytes());
        assert!(decode(&enc2).is_err());
    }

    #[test]
    fn frame_count_disagreement_fails_closed() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        let mut enc = encode(&s, 2, Preset::High, SR).unwrap();
        // Rewrite total_frames and repair the header CRC: the unit walk must still catch it.
        enc[8..12].copy_from_slice(&u32::MAX.to_le_bytes());
        let crc = crc32(&enc[..HEADER_LEN - 4]);
        enc[24..28].copy_from_slice(&crc.to_le_bytes());
        assert!(Header::parse(&enc).is_ok(), "CRC repaired");
        let err = decode(&enc).unwrap_err();
        assert!(err.contains("frames"), "unexpected error: {err}");
    }

    #[test]
    fn mdct_hop_count_disagreement_fails_closed() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 6, 2);
        let mut enc = encode(&s, 2, Preset::High, SR).unwrap();
        let declared = u32::from_le_bytes(enc[12..16].try_into().unwrap());
        enc[12..16].copy_from_slice(&(declared + 1).to_le_bytes());
        let crc = crc32(&enc[..HEADER_LEN - 4]);
        enc[24..28].copy_from_slice(&crc.to_le_bytes());
        let err = decode(&enc).unwrap_err();
        assert!(err.contains("MDCT hops"), "unexpected error: {err}");
    }

    #[test]
    fn unknown_tag_profile_flags_and_channels_fail_closed() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);

        let mut bad_tag = encode(&s, 2, Preset::High, SR).unwrap();
        bad_tag[HEADER_LEN] = 0x58; // 'X'
        let crc = crc32(&bad_tag[HEADER_LEN..HEADER_LEN + UNIT_PREFIX_LEN + payload_len(&bad_tag)]);
        let crc_at = HEADER_LEN + UNIT_PREFIX_LEN + payload_len(&bad_tag);
        bad_tag[crc_at..crc_at + 4].copy_from_slice(&crc.to_le_bytes());
        assert!(decode(&bad_tag).unwrap_err().contains("unsupported"));

        // Unknown profile, and a *known* profile that contradicts the MDCT
        // payload's self-describing scalefactor magic, both fail closed.
        for (offset, value, what) in [
            (3usize, 9u8, "unknown profile"),
            (3, PROFILE_TRANSITIONAL_LAB, "profile/payload mismatch"),
            (2, 4, "channels"),
        ] {
            let mut enc = encode(&s, 2, Preset::High, SR).unwrap();
            enc[offset] = value;
            let crc = crc32(&enc[..HEADER_LEN - 4]);
            enc[24..28].copy_from_slice(&crc.to_le_bytes());
            assert!(decode(&enc).is_err(), "{what} must fail closed");
        }

        let mut flagged = encode(&s, 2, Preset::High, SR).unwrap();
        flagged[20..22].copy_from_slice(&0x0010u16.to_le_bytes());
        let crc = crc32(&flagged[..HEADER_LEN - 4]);
        flagged[24..28].copy_from_slice(&crc.to_le_bytes());
        assert!(decode(&flagged).is_err(), "reserved flag must fail closed");
    }

    fn payload_len(stream: &[u8]) -> usize {
        u32::from_le_bytes(stream[HEADER_LEN + 5..HEADER_LEN + 9].try_into().unwrap()) as usize
    }

    #[test]
    fn sr_tag_is_rejected_in_codec_id_6() {
        let s = mixed_signal(UNIT_SIZE_FRAMES * 4, 2);
        let mut enc = encode(&s, 2, Preset::High, SR).unwrap();
        enc[HEADER_LEN] = TAG_SR;
        let end = HEADER_LEN + UNIT_PREFIX_LEN + payload_len(&enc);
        let crc = crc32(&enc[HEADER_LEN..end]);
        enc[end..end + 4].copy_from_slice(&crc.to_le_bytes());
        let err = decode(&enc).unwrap_err();
        assert!(err.contains("TAG_SR"), "unexpected error: {err}");
    }

    #[test]
    fn encoder_rejects_unsupported_geometry() {
        let s = mixed_signal(UNIT_SIZE_FRAMES, 2);
        assert!(encode(&s, 0, Preset::High, SR).is_err());
        assert!(encode(&s, 3, Preset::High, SR).is_err());
        assert!(encode(&s, 2, Preset::High, 4000).is_err());
    }

    #[test]
    fn inspect_unit_mix_reports_three_figures() {
        let ch = 2usize;
        let frames = UNIT_SIZE_FRAMES * 10;
        let s = mixed_signal(frames, ch);
        let enc = encode(&s, ch as u8, Preset::High, SR).unwrap();
        let mix = inspect_unit_mix(&enc).unwrap();

        assert_eq!(mix.codec_id, 6);
        assert_eq!(mix.total_frames, frames);
        assert_eq!(mix.declared_frames, frames);
        assert_eq!(mix.stream_bytes, enc.len());
        assert!(mix.mdct.units > 0);
        assert!(mix.lossless_l.units + mix.lossless_b.units > 0);
        assert_eq!(mix.signal_relative.units, 0);
        assert_eq!(mix.unknown.units, 0);
        assert!(mix.protected_sample_pct() > 0.0 && mix.protected_sample_pct() < 100.0);
        assert!(mix.protected_byte_pct() > 0.0);
        assert_eq!(mix.coded_path_bytes(), mix.mdct.payload_bytes);
        let kbps = mix.coded_path_kbps().unwrap();
        assert!(kbps > 0.0 && kbps.is_finite());

        let json = mix.to_json();
        assert!(json.starts_with("{\"codec_id\":6"));
        assert!(json.contains("\"protected_sample_pct\":"));
        assert!(json.contains("\"coded_path_kbps\":"));

        // Same call inspects an MP5-C2 stream for parity comparisons.
        let c2 = mp5c2::encode_mdct(&s, ch as u8, Preset::High);
        let c2mix = inspect_unit_mix(&c2).unwrap();
        assert_eq!(c2mix.codec_id, 5);
        assert_eq!(c2mix.total_frames, frames);
        assert_eq!(c2mix.coded_path_kbps(), None, "C2 carries no sample rate");
        // Protect planning is shared, so protect frame counts must agree exactly.
        assert_eq!(
            mix.lossless_l.frames + mix.lossless_b.frames,
            c2mix.lossless_l.frames + c2mix.lossless_b.frames,
            "CodecId 6 and MP5-C2 MDCT must plan identical protect islands"
        );
    }

    #[test]
    fn mdct_units_are_lossy_but_reconstruct_the_signal() {
        let ch = 2usize;
        let frames = UNIT_SIZE_FRAMES * 8;
        let s = interleave(frames, ch, |i, _| {
            ((i as f64 * 0.06).sin() * 0.5 * 32767.0) as i16
        });
        let enc = encode(&s, ch as u8, Preset::High, SR).unwrap();
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), s.len());
        assert_ne!(dec, s, "MDCT loud path is lossy by construction");
        let snr = pcm::snr_db(&pcm::i16_to_f32(&s), &pcm::i16_to_f32(&dec));
        assert!(snr > 10.0, "MDCT reconstruction unusable: {snr} dB");
    }

    #[test]
    fn empty_input_roundtrips_to_empty() {
        let enc = encode(&[], 2, Preset::High, SR).unwrap();
        assert_eq!(enc.len(), HEADER_LEN);
        assert!(decode(&enc).unwrap().is_empty());
    }

    // ---- Phase 5.4: boundary continuity + seek ----

    /// Alternating loud / near-silent segments with *ramped* transitions, so
    /// the only thing a boundary can expose is the zero-ramp artifact itself.
    fn boundary_signal(frames: usize, ch: usize) -> Vec<i16> {
        let mut s = vec![0i16; frames * ch];
        for i in 0..frames {
            let seg = i / UNIT_SIZE_FRAMES;
            let within = i % UNIT_SIZE_FRAMES;
            // Ramp level over the first/last 512 frames of each segment.
            let edge = within.min(UNIT_SIZE_FRAMES - within) as f64 / 512.0;
            let ramp = edge.min(1.0);
            let loud = if seg % 2 == 0 { 1.0 } else { 0.0002 };
            let level = ramp * loud + 0.0002;
            let v = (i as f64 * 0.055).sin() * 12000.0 * level
                + (i as f64 * 0.021).sin() * 6000.0 * level;
            let q = v.clamp(-32768.0, 32767.0) as i16;
            for c in 0..ch {
                s[i * ch + c] = q;
            }
        }
        s
    }

    /// RMS error of decoded vs source in a frame window, both channels.
    fn region_rms(src: &[i16], dec: &[i16], from: usize, to: usize, ch: usize) -> f64 {
        let mut err = 0f64;
        let mut n = 0usize;
        for i in from * ch..to * ch {
            let e = src[i] as f64 - dec[i] as f64;
            err += e * e;
            n += 1;
        }
        (err / n.max(1) as f64).sqrt()
    }

    #[test]
    fn unit_boundaries_are_continuous_with_context_seeding() {
        let frames = UNIT_SIZE_FRAMES * 12;
        let s = boundary_signal(frames, 2);
        let enc = encode(&s, 2, Preset::High, SR).unwrap();
        let dec = decode(&enc).unwrap();
        assert_eq!(dec.len(), s.len());

        let units = units_of(&enc).unwrap();
        let mut frame = 0usize;
        let mut boundaries = 0usize;
        for u in units.windows(2) {
            frame += u[0].n_frames;
            let tags_differ = (u[0].tag == TAG_MDCT) != (u[1].tag == TAG_MDCT);
            if !tags_differ || frame == 0 {
                continue;
            }
            boundaries += 1;
            // With the old zero-padding the MDCT side ramps up from silence
            // over ~HOP samples, spiking the boundary-region error. With
            // context seeding the boundary region must track the source about
            // as well as the segment interior does.
            let boundary_err = region_rms(&s, &dec, frame, frame + 128, 2);
            let inner_err = region_rms(
                &s,
                &dec,
                frame + UNIT_SIZE_FRAMES / 2,
                frame + UNIT_SIZE_FRAMES / 2 + 128,
                2,
            );
            eprintln!(
                "PHASE5.4 boundary at frame {frame}: boundary err {boundary_err:.1} vs interior {inner_err:.1}"
            );
            assert!(
                boundary_err <= inner_err * 2.0 + 16.0,
                "boundary error spike: {boundary_err:.1} vs interior {inner_err:.1} — zero-ramp artifact present"
            );
        }
        assert!(
            boundaries > 0,
            "fixture must contain protect↔MDCT boundaries"
        );
    }

    /// Direct proof that context seeding is what removes the ramp: encode one
    /// MDCT unit standalone with real context vs empty context and compare
    /// first-sample error against the source.
    #[test]
    fn context_seeding_removes_the_zero_ramp_directly() {
        // Loud content immediately before the unit (the worst case for the
        // zero-ramp artifact).
        let frames = UNIT_SIZE_FRAMES * 4;
        let mut s = vec![0i16; frames * 2];
        for i in 0..frames {
            let v = ((i as f64 * 0.045).sin() * 14000.0 + (i as f64 * 0.017).sin() * 8000.0)
                .clamp(-32768.0, 32767.0) as i16;
            s[i * 2] = v;
            s[i * 2 + 1] = v;
        }
        let unit = &s[UNIT_SIZE_FRAMES * 2..UNIT_SIZE_FRAMES * 3];
        let params = mp5c3::EncodeParams::full(
            mp5c3::SfMode::Coded,
            mp5c3::CoeffMode::Partitioned,
            mp5c3::RateControl::Off,
            mp5c3::StereoMode::Independent,
            false,
        );
        let seeded = mp5c3::encode_with_context(
            unit,
            2,
            Preset::High,
            params,
            (&s[..UNIT_SIZE_FRAMES * 2], &s[UNIT_SIZE_FRAMES * 3..]),
        );
        let unseeded = mp5c3::encode_with_context(unit, 2, Preset::High, params, (&[], &[]));
        let dec_seeded = mp5c3::decode(&seeded).unwrap();
        let dec_unseeded = mp5c3::decode(&unseeded).unwrap();
        let err_seeded = region_rms(unit, &dec_seeded, 0, 128, 2);
        let err_unseeded = region_rms(unit, &dec_unseeded, 0, 128, 2);
        eprintln!(
            "PHASE5.4 direct seeding: first-128 err seeded {err_seeded:.1} vs unseeded {err_unseeded:.1}"
        );
        assert!(
            err_seeded < err_unseeded * 0.5,
            "seeding must at least halve the boundary-region error ({err_seeded:.1} vs {err_unseeded:.1})"
        );
    }

    #[test]
    fn seek_decode_matches_full_decode_slices() {
        let frames = UNIT_SIZE_FRAMES * 10;
        let s = boundary_signal(frames, 2);
        let enc = encode(&s, 2, Preset::High, SR).unwrap();
        let full = decode(&enc).unwrap();

        // Whole-stream range equals full decode.
        let all = decode_range(&enc, 0, frames as u32).unwrap();
        assert_eq!(all, full);

        // Unit-aligned slices match.
        for (start, len) in [
            (0usize, UNIT_SIZE_FRAMES),
            (UNIT_SIZE_FRAMES, UNIT_SIZE_FRAMES * 2),
            (UNIT_SIZE_FRAMES * 7, UNIT_SIZE_FRAMES * 3),
        ] {
            let slice = decode_range(&enc, start as u32, len as u32).unwrap();
            assert_eq!(
                slice,
                full[start * 2..(start + len) * 2].to_vec(),
                "range [{start}, +{len}) must match full decode"
            );
        }

        // Sub-unit ranges (start mid-unit) match too.
        let mid = UNIT_SIZE_FRAMES / 2;
        let slice = decode_range(&enc, mid as u32, UNIT_SIZE_FRAMES as u32).unwrap();
        assert_eq!(slice, full[mid * 2..(mid + UNIT_SIZE_FRAMES) * 2].to_vec());

        // Past-end ranges fail closed.
        assert!(decode_range(&enc, frames as u32, 1).is_err());
        assert!(decode_range(&enc, (frames - 10) as u32, 100).is_err());
        // Truncated stream fails closed too.
        assert!(decode_range(&enc[..enc.len() / 2], 0, 1024).is_err());
    }

    #[test]
    fn seek_works_under_the_full_phase5_stack() {
        let frames = UNIT_SIZE_FRAMES * 10;
        let s = boundary_signal(frames, 2);
        let enc = encode_with_options(
            &s,
            2,
            Preset::High,
            ProtectParams::widened(PROTECT_SCALE),
            SR,
            RateMode::Abr { kbps: 192 },
            EncodeOptions {
                profile_id: PROFILE_PHASE5,
                joint_stereo: true,
                window_switching: true,
                psycho: true,
            },
        )
        .unwrap();
        let full = decode(&enc).unwrap();
        for start in [0usize, UNIT_SIZE_FRAMES, UNIT_SIZE_FRAMES * 5] {
            let slice = decode_range(&enc, start as u32, UNIT_SIZE_FRAMES as u32).unwrap();
            assert_eq!(
                slice,
                full[start * 2..(start + UNIT_SIZE_FRAMES) * 2].to_vec(),
                "full-stack range at {start} must match"
            );
        }
    }
}
