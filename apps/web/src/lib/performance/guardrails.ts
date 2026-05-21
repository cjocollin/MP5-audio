import { STEM_MIX_LIMITS, assessStemMixSafety, estimateStemDecodedBytes } from "../stems/stemLimits";
import type { StemDescriptor } from "@mp5/container";
import {
  PERF_THRESHOLDS,
  estimateSourceDurationSec,
} from "./thresholds";

export type GuardrailLevel = "info" | "warn" | "block";

export interface GuardrailMessage {
  level: GuardrailLevel;
  message: string;
}

export function assessSourceFile(file: File): GuardrailMessage[] {
  const out: GuardrailMessage[] = [];
  const dur = estimateSourceDurationSec(file.size);
  if (file.size >= PERF_THRESHOLDS.blockSourceFileBytes) {
    out.push({
      level: "block",
      message: `This source is very large (${formatMb(file.size)}). Conversion may fail or freeze the tab. Try a shorter clip or WAV export from your DAW.`,
    });
  } else if (file.size >= PERF_THRESHOLDS.warnSourceFileBytes) {
    out.push({
      level: "warn",
      message: `Large source file (${formatMb(file.size)}). Browser conversion can take several minutes and use a lot of memory.`,
    });
  }
  if (dur >= PERF_THRESHOLDS.blockSourceDurationSec) {
    out.push({
      level: "block",
      message: `This file may be very long (~${Math.round(dur / 60)}+ min). Consider splitting before batch or single export.`,
    });
  } else if (dur >= PERF_THRESHOLDS.warnSourceDurationSec) {
    out.push({
      level: "warn",
      message: `Long track (~${Math.round(dur / 60)} min estimated). Encoding and waveform build will be slower.`,
    });
  }
  return out;
}

export function assessMp5File(file: File): GuardrailMessage[] {
  if (file.size < PERF_THRESHOLDS.warnMp5FileBytes) return [];
  return [
    {
      level: "warn",
      message: `Large MP5 file (${formatMb(file.size)}). Playback decode and library save use more RAM.`,
    },
  ];
}

export function assessBatchQueue(pendingCount: number, totalCount: number): GuardrailMessage[] {
  const out: GuardrailMessage[] = [];
  if (totalCount >= PERF_THRESHOLDS.blockBatchQueueCount) {
    out.push({
      level: "block",
      message: `Queue has ${totalCount} files — too many for one browser session. Split into smaller batches.`,
    });
  } else if (totalCount >= PERF_THRESHOLDS.warnBatchQueueCount) {
    out.push({
      level: "warn",
      message: `${totalCount} files queued. Batch runs sequentially and may take a long time; keep this tab open.`,
    });
  } else if (pendingCount >= PERF_THRESHOLDS.warnBatchQueueCount) {
    out.push({
      level: "warn",
      message: `${pendingCount} files still pending. Large batches are CPU- and memory-heavy.`,
    });
  }
  return out;
}

export function assessLibraryStorage(usedBytes: number, quotaBytes: number | null): GuardrailMessage[] {
  if (!quotaBytes || quotaBytes <= 0) return [];
  const ratio = usedBytes / quotaBytes;
  if (ratio >= PERF_THRESHOLDS.blockLibraryUsageRatio) {
    return [
      {
        level: "block",
        message: `Browser storage is almost full (${Math.round(ratio * 100)}% used). Remove library items before saving more.`,
      },
    ];
  }
  if (ratio >= PERF_THRESHOLDS.warnLibraryUsageRatio) {
    return [
      {
        level: "warn",
        message: `Library storage is ${Math.round(ratio * 100)}% full on this device. Large saves may fail.`,
      },
    ];
  }
  return [];
}

export function assessStemDescriptors(stems: StemDescriptor[]): GuardrailMessage[] {
  const safety = assessStemMixSafety(stems);
  const out: GuardrailMessage[] = [];
  if (safety.block) {
    out.push({ level: "block", message: safety.block });
  } else if (safety.warning) {
    out.push({ level: "warn", message: safety.warning });
  }
  let total = 0;
  for (const s of stems) total += estimateStemDecodedBytes(s);
  if (total > STEM_MIX_LIMITS.warnTotalDecodedBytes && !safety.block) {
    out.push({
      level: "warn",
      message: `Stem mix may use ~${Math.round(total / (1024 * 1024))} MB decoded audio in RAM.`,
    });
  }
  return out;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
