// Claim-discipline flags for the LAME-matched harness.
//
// Phase 4.3 flipped RATE_CONTROL_READY: deterministic ABR/CBR rate control
// hits ladder targets (320/192/128) within ±3% track-average, proven by
// `abr_ladder_hits_targets_with_protect_consuming_budget` and
// `cbr_ladder_hits_targets_at_container_level` in rust/mp5-codec/src/mp5c6.rs.
// Matched-bitrate wording is allowed only for streams actually encoded at a
// rate target; "beats MP3" remains forbidden until preregistered listening.

/** True since Phase 4.3: deterministic rate control hits targets ±3%. */
export const RATE_CONTROL_READY = true;

/**
 * Format an MP5 bitrate label under claim discipline.
 * @param {number} kbps operating-point estimate (coded-path or total)
 */
export function mp5RateLabel(kbps) {
  const n = Number(kbps);
  if (!Number.isFinite(n)) return "operating point ~unknown kbps";
  return `operating point ~${n.toFixed(1)} kbps`;
}

/**
 * Whether matched-bitrate LAME comparison verdicts are allowed.
 * Enforced in code — not just a comment.
 */
export function allowMatchedBitrateLameVerdict() {
  return RATE_CONTROL_READY === true;
}

/** Size-gate tolerance vs a LAME CBR anchor at the matched rate (Phase 4.4). */
export const SIZE_GATE_TOLERANCE = 0.02;

/**
 * Build (or refuse) a matched-bitrate verdict block.
 * Always returns an object safe to embed in JSON artifacts.
 *
 * When rate control is ready and both byte counts are supplied, the verdict
 * is the Phase 4.4 size gate: MP5 total size must not exceed the LAME CBR
 * anchor at the matched rate by more than SIZE_GATE_TOLERANCE. Quality
 * verdicts stay out of scope until preregistered listening (Phase 6).
 */
export function matchedBitrateVerdict({ mp5Kbps, lameKbps, metricDeltas } = {}) {
  if (!allowMatchedBitrateLameVerdict()) {
    return {
      allowed: false,
      verdict: null,
      reason:
        "RATE_CONTROL_READY=false — no matched-bitrate LAME comparison verdict until Phase 4 rate control. " +
        "Report objective deltas as informational only; label MP5 as an operating point.",
      mp5Label: mp5RateLabel(mp5Kbps),
      lameAnchorKbps: lameKbps ?? null,
      informationalDeltas: metricDeltas ?? null,
    };
  }
  const sizeRatio = Number(metricDeltas?.sizeRatioMp5OverLame);
  let verdict = "pending-size-figures";
  let reason =
    "Rate control ready — matched-bitrate wording allowed. Size gate needs mp5AudiBytes and lameBytes.";
  if (Number.isFinite(sizeRatio) && sizeRatio > 0) {
    const pass = sizeRatio <= 1 + SIZE_GATE_TOLERANCE;
    verdict = pass ? "size-gate-pass" : "size-gate-fail";
    reason = pass
      ? `MP5 total size is ${(sizeRatio * 100).toFixed(1)}% of LAME CBR ${lameKbps} (gate: <= ${(100 + SIZE_GATE_TOLERANCE * 100).toFixed(0)}%). Size only — not a quality claim.`
      : `MP5 total size is ${(sizeRatio * 100).toFixed(1)}% of LAME CBR ${lameKbps}, over the +${(SIZE_GATE_TOLERANCE * 100).toFixed(0)}% gate.`;
  }
  return {
    allowed: true,
    verdict,
    reason,
    mp5Label: Number.isFinite(Number(mp5Kbps))
      ? `${Number(mp5Kbps).toFixed(1)} kbps`
      : "unknown kbps",
    lameAnchorKbps: lameKbps ?? null,
    sizeRatioMp5OverLame: Number.isFinite(sizeRatio) ? sizeRatio : null,
    informationalDeltas: metricDeltas ?? null,
  };
}
