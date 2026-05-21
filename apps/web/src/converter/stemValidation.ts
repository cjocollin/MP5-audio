import type { StemType } from "@mp5/container";
import type { StemNormalizeMeta, StemSourceSnapshot } from "./stemNormalize";
import { STEM_POST_ALIGN_TOLERANCE_SEC } from "./stemNormalize";

export interface PendingStemPcm {
  id: string;
  name: string;
  stemType: StemType;
  fileName: string;
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  defaultVolume: number;
  explicitContent: boolean;
  fileSize: number;
  /** Original PCM before normalization (non-destructive working copy). */
  originalSamples?: Int16Array;
  sourceSnapshot?: StemSourceSnapshot;
  normalizeMeta?: StemNormalizeMeta;
}

export interface StemValidationIssue {
  level: "error" | "warning";
  message: string;
}

const MAX_STEM_BYTES = 500 * 1024 * 1024;
const DURATION_TOLERANCE = 0.02;
const DURATION_ABS_MS = 500;

export function stemsAreAlignedToMix(
  mix: { sampleRate: number; channels: number; durationSec: number },
  stems: PendingStemPcm[],
): boolean {
  if (!stems.length) return true;
  return stems.every((stem) => {
    if (stem.sampleRate !== mix.sampleRate) return false;
    const stemDur = stem.samples.length / stem.channels / stem.sampleRate;
    return Math.abs(stemDur - mix.durationSec) <= STEM_POST_ALIGN_TOLERANCE_SEC;
  });
}

export function validateStemsForExport(
  mix: { sampleRate: number; channels: number; durationSec: number },
  stems: PendingStemPcm[],
): { issues: StemValidationIssue[]; canExport: boolean } {
  const issues: StemValidationIssue[] = [];

  if (!stems.length) {
    return { issues, canExport: true };
  }

  for (const stem of stems) {
    if (!stem.name.trim()) {
      issues.push({ level: "error", message: `Stem "${stem.fileName}" needs a name.` });
    }
    if (stem.fileSize > MAX_STEM_BYTES) {
      issues.push({
        level: "error",
        message: `Stem "${stem.name || stem.fileName}" is too large (max ${Math.round(MAX_STEM_BYTES / (1024 * 1024))} MB).`,
      });
    }
    if (stem.sampleRate !== mix.sampleRate) {
      issues.push({
        level: "error",
        message: `"${stem.name}" sample rate (${stem.sampleRate} Hz) does not match full mix (${mix.sampleRate} Hz).`,
      });
    }
    if (stem.channels !== mix.channels && !stem.normalizeMeta?.channelAdjusted) {
      issues.push({
        level: "warning",
        message: `"${stem.name}" has ${stem.channels} channel(s); full mix has ${mix.channels}. Use Normalize stems to align channels.`,
      });
    }
    const stemDur = stem.samples.length / stem.channels / stem.sampleRate;
    const delta = Math.abs(stemDur - mix.durationSec);
    const tol = stem.normalizeMeta
      ? STEM_POST_ALIGN_TOLERANCE_SEC
      : Math.max(DURATION_ABS_MS / 1000, mix.durationSec * DURATION_TOLERANCE);
    if (delta > tol) {
      const level = stem.normalizeMeta ? "error" : "warning";
      issues.push({
        level,
        message: stem.normalizeMeta
          ? `"${stem.name}" is still not aligned (${stemDur.toFixed(1)}s vs ${mix.durationSec.toFixed(1)}s) — normalize again or remove.`
          : `"${stem.name}" duration (${stemDur.toFixed(1)}s) differs from full mix (${mix.durationSec.toFixed(1)}s). Use Normalize stems.`,
      });
    }
  }

  const hasError = issues.some((i) => i.level === "error");
  return { issues, canExport: !hasError };
}
