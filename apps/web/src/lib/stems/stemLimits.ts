import { CodecId, type StemDescriptor } from "@mp5/container";

/** MVP limits for opt-in stem mixing (all stems decoded into RAM). */
export const STEM_MIX_LIMITS = {
  maxStemCount: 32,
  maxDurationSec: 600,
  warnDurationSec: 180,
  maxTotalDecodedBytes: 256 * 1024 * 1024,
  warnTotalDecodedBytes: 96 * 1024 * 1024,
  /** ~6 min stereo 16-bit @ 44.1 kHz */
  maxSingleStemDecodedBytes: 96 * 1024 * 1024,
} as const;

export function estimateStemDecodedBytes(stem: StemDescriptor): number {
  const ch = Math.max(1, stem.channels);
  const samples = Math.max(0, stem.durationSamples);
  return samples * ch * 2;
}

export function assessStemMixSafety(stems: StemDescriptor[]): {
  ok: boolean;
  warning?: string;
  block?: string;
} {
  if (!stems.length) {
    return { ok: false, block: "No stems to mix." };
  }
  if (stems.length > STEM_MIX_LIMITS.maxStemCount) {
    return {
      ok: false,
      block: `Too many stems (${stems.length}). MVP supports up to ${STEM_MIX_LIMITS.maxStemCount}.`,
    };
  }

  let totalBytes = 0;
  let maxDur = 0;
  for (const s of stems) {
    const bytes = estimateStemDecodedBytes(s);
    totalBytes += bytes;
    if (bytes > STEM_MIX_LIMITS.maxSingleStemDecodedBytes) {
      return {
        ok: false,
        block: `"${s.stemName}" is too large to decode for stem mix on this device.`,
      };
    }
    const dur =
      s.sampleRate > 0 && s.channels > 0
        ? s.durationSamples / s.sampleRate / s.channels
        : 0;
    maxDur = Math.max(maxDur, dur);
    if (s.codecId === CodecId.MP5C) {
      return {
        ok: false,
        block: `"${s.stemName}" uses MP5-C — stem mix is not supported for lab codecs.`,
      };
    }
  }

  if (totalBytes > STEM_MIX_LIMITS.maxTotalDecodedBytes) {
    return {
      ok: false,
      block:
        "These stems are too large to decode together. Use full mix playback or download stems individually.",
    };
  }

  const warnings: string[] = [];
  if (maxDur > STEM_MIX_LIMITS.warnDurationSec) {
    warnings.push(
      `Long stems (~${Math.ceil(maxDur)}s) — stem mix may use a lot of memory while enabled.`,
    );
  }
  if (totalBytes > STEM_MIX_LIMITS.warnTotalDecodedBytes) {
    warnings.push(
      `Estimated ~${Math.round(totalBytes / (1024 * 1024))} MB decoded audio in RAM when mixing.`,
    );
  }

  return {
    ok: true,
    warning: warnings.length ? warnings.join(" ") : undefined,
  };
}
