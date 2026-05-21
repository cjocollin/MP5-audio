import { CodecId, type StemDescriptor } from "@mp5/container";

/** Browser stem playback budgets (decoded PCM in RAM). */
export const STEM_PLAYBACK_LIMITS = {
  maxStemCount: 32,
  maxDurationSec: 600,
  warnDurationSec: 180,
  /** Large embedded set (STDF / many stems) — show adaptive UI, not a hard block. */
  largeEmbeddedBytes: 48 * 1024 * 1024,
  /** Warn when selected decode estimate exceeds this. */
  warnSelectedDecodedBytes: 96 * 1024 * 1024,
  warnTotalDecodedBytes: 96 * 1024 * 1024,
  /** Block preparing selected stems above this (likely browser crash). */
  blockSelectedDecodedBytes: 384 * 1024 * 1024,
  maxTotalDecodedBytes: 384 * 1024 * 1024,
  /** Block a single stem decode above this. */
  maxSingleStemDecodedBytes: 128 * 1024 * 1024,
  /** Block “prepare all stems” only above this extreme total. */
  blockAllStemsDecodedBytes: 512 * 1024 * 1024,
} as const;

/** @deprecated Use STEM_PLAYBACK_LIMITS */
export const STEM_MIX_LIMITS = STEM_PLAYBACK_LIMITS;

export function estimateStemDecodedBytes(stem: StemDescriptor): number {
  const ch = Math.max(1, stem.channels);
  const samples = Math.max(0, stem.durationSamples);
  return samples * ch * 2;
}

export function estimateStemsDecodedBytes(stems: readonly StemDescriptor[]): number {
  let total = 0;
  for (const s of stems) total += estimateStemDecodedBytes(s);
  return total;
}

export function isLargeEmbeddedStemFile(totalEmbeddedBytes: number): boolean {
  return totalEmbeddedBytes > STEM_PLAYBACK_LIMITS.largeEmbeddedBytes;
}

export interface StemSafetyResult {
  ok: boolean;
  warning?: string;
  block?: string;
}

/** Panel always opens — assess file tier for messaging only. */
export function assessStemFileTier(
  stems: readonly StemDescriptor[],
  totalEmbeddedBytes: number,
): { large: boolean; totalDecodedEstimate: number; warning?: string } {
  const totalDecodedEstimate = estimateStemsDecodedBytes(stems);
  const large = isLargeEmbeddedStemFile(totalEmbeddedBytes);
  const warnings: string[] = [];
  if (large) {
    warnings.push(
      `Large embedded stems (~${Math.round(totalEmbeddedBytes / (1024 * 1024))} MB in file). Full mix plays immediately; load or solo stems individually.`,
    );
  }
  let maxDur = 0;
  for (const s of stems) {
    const dur =
      s.sampleRate > 0 && s.channels > 0
        ? s.durationSamples / s.sampleRate / s.channels
        : 0;
    maxDur = Math.max(maxDur, dur);
  }
  if (maxDur > STEM_PLAYBACK_LIMITS.warnDurationSec) {
    warnings.push(`Long stems (~${Math.ceil(maxDur)}s) — decoding uses significant memory.`);
  }
  return { large, totalDecodedEstimate, warning: warnings.join(" ") || undefined };
}

/** Selected stems the user chose to prepare / solo / karaoke. */
export function assessSelectedStemsPrepare(stems: readonly StemDescriptor[]): StemSafetyResult {
  if (!stems.length) {
    return { ok: false, block: "Select at least one stem to prepare." };
  }
  if (stems.length > STEM_PLAYBACK_LIMITS.maxStemCount) {
    return {
      ok: false,
      block: `Too many stems (${stems.length}). Prepare up to ${STEM_PLAYBACK_LIMITS.maxStemCount} at a time.`,
    };
  }

  let totalBytes = 0;
  for (const s of stems) {
    if (s.codecId === CodecId.MP5C) {
      return {
        ok: false,
        block: `"${s.stemName}" uses MP5-C — stem playback is not supported for lab codecs.`,
      };
    }
    const bytes = estimateStemDecodedBytes(s);
    totalBytes += bytes;
    if (bytes > STEM_PLAYBACK_LIMITS.maxSingleStemDecodedBytes) {
      return {
        ok: false,
        block: `"${s.stemName}" is too large to decode in the browser (~${Math.round(bytes / (1024 * 1024))} MB). Download the stem or use full mix.`,
      };
    }
  }

  if (totalBytes > STEM_PLAYBACK_LIMITS.blockSelectedDecodedBytes) {
    return {
      ok: false,
      block: `Selected stems need ~${Math.round(totalBytes / (1024 * 1024))} MB decoded RAM — choose fewer stems or download individually.`,
    };
  }

  const warnings: string[] = [];
  if (totalBytes > STEM_PLAYBACK_LIMITS.warnSelectedDecodedBytes) {
    warnings.push(
      `Preparing ~${Math.round(totalBytes / (1024 * 1024))} MB decoded audio — may take a minute.`,
    );
  }

  return { ok: true, warning: warnings.join(" ") || undefined };
}

/** @deprecated Use assessSelectedStemsPrepare — kept for tests migrating from all-or-nothing mix. */
export function assessStemMixSafety(stems: readonly StemDescriptor[]): StemSafetyResult {
  if (!stems.length) return { ok: false, block: "No stems to mix." };
  const total = estimateStemsDecodedBytes(stems);
  if (total > STEM_PLAYBACK_LIMITS.blockAllStemsDecodedBytes) {
    return {
      ok: false,
      block:
        "Preparing every stem at once would use too much memory. Load or solo selected stems instead.",
    };
  }
  return assessSelectedStemsPrepare(stems);
}
