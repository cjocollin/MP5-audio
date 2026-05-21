import { formatLabelForExtension } from "./supportedSources";
import type { StemType } from "./stemTypes";
import { guessStemTypeFromFilename, defaultStemNameFromFile } from "./stemTypeGuess";
import type { PendingStemPcm } from "./stemValidation";
import {
  analyzeStemAlignment,
  pcmDurationSec,
  type StemAlignmentAnalysis,
} from "./stemNormalize";
import { STEM_MIX_LIMITS } from "../lib/stems/stemLimits";
import type { GuardrailMessage } from "../lib/performance/guardrails";
import {
  estimateSourceDurationSec,
  PERF_THRESHOLDS,
} from "../lib/performance/thresholds";

/** Extensions decoded via the same path as converter sources (WAV native, rest FFmpeg). */
export const STEM_IMPORT_EXTENSIONS = [
  ".wav",
  ".flac",
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
] as const;

export function stemFileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function isSupportedStemFile(name: string): boolean {
  return (STEM_IMPORT_EXTENSIONS as readonly string[]).includes(stemFileExtension(name));
}

export interface PartitionedStemFiles {
  toImport: File[];
  unsupported: string[];
  duplicates: string[];
}

export function partitionStemFiles(
  files: File[],
  existingFileNames: Iterable<string>,
): PartitionedStemFiles {
  const existing = new Set(
    [...existingFileNames].map((n) => n.toLowerCase()),
  );
  const seenInBatch = new Set<string>();
  const toImport: File[] = [];
  const unsupported: string[] = [];
  const duplicates: string[] = [];

  for (const file of files) {
    if (!isSupportedStemFile(file.name)) {
      unsupported.push(file.name);
      continue;
    }
    const key = file.name.toLowerCase();
    if (existing.has(key) || seenInBatch.has(key)) {
      duplicates.push(file.name);
      continue;
    }
    seenInBatch.add(key);
    toImport.push(file);
  }

  return { toImport, unsupported, duplicates };
}

export interface BatchStemImportSummary {
  imported: number;
  skipped: number;
  failed: string[];
  unsupported: string[];
  duplicates: string[];
  guessedTypes: { fileName: string; stemType: StemType }[];
  alignment: StemAlignmentAnalysis | null;
}

export function buildBatchStemImportSummary(opts: {
  imported: number;
  skipped: number;
  failed: string[];
  partition: PartitionedStemFiles;
  guessedTypes: { fileName: string; stemType: StemType }[];
  mix: { sampleRate: number; channels: number; durationSec: number } | null;
  stems: PendingStemPcm[];
}): BatchStemImportSummary {
  const alignment =
    opts.mix && opts.stems.length
      ? analyzeStemAlignment(
          {
            samples: new Int16Array(0),
            sampleRate: opts.mix.sampleRate,
            channels: opts.mix.channels,
          },
          opts.stems,
          opts.mix.durationSec,
        )
      : null;

  return {
    imported: opts.imported,
    skipped: opts.skipped,
    failed: opts.failed,
    unsupported: opts.partition.unsupported,
    duplicates: opts.partition.duplicates,
    guessedTypes: opts.guessedTypes,
    alignment,
  };
}

export function createPendingStemFromPcm(
  file: File,
  pcm: { samples: Int16Array; sampleRate: number; channels: number },
): PendingStemPcm {
  const stemType = guessStemTypeFromFilename(file.name);
  const name = defaultStemNameFromFile(file.name);
  return {
    id: crypto.randomUUID(),
    name,
    stemType,
    fileName: file.name,
    samples: pcm.samples,
    sampleRate: pcm.sampleRate,
    channels: pcm.channels,
    defaultVolume: 1,
    explicitContent: false,
    fileSize: file.size,
    originalSamples: pcm.samples.slice(),
    sourceSnapshot: {
      sampleRate: pcm.sampleRate,
      channels: pcm.channels,
      durationSec: pcmDurationSec(pcm.samples, pcm.channels, pcm.sampleRate),
      fileName: file.name,
    },
  };
}

/** PCM bytes estimate before decode (conservative for compressed sources). */
export function estimateStemFileDecodedBytes(file: File): number {
  const ext = stemFileExtension(file.name);
  if (ext === ".wav") {
    return file.size;
  }
  const pcmFromDuration = Math.round(
    estimateSourceDurationSec(file.size) * 44_100 * 2 * 2,
  );
  return Math.max(file.size * 6, pcmFromDuration);
}

export function estimatePendingStemDecodedBytes(stems: PendingStemPcm[]): number {
  let total = 0;
  for (const s of stems) {
    total += s.samples.length * 2;
    if (s.originalSamples && s.originalSamples !== s.samples) {
      total += s.originalSamples.length * 2;
    }
  }
  return total;
}

export function assessBatchStemImport(
  existingStemCount: number,
  filesToImport: File[],
  existingDecodedBytes: number,
): GuardrailMessage[] {
  const out: GuardrailMessage[] = [];
  const count = existingStemCount + filesToImport.length;

  if (count > STEM_MIX_LIMITS.maxStemCount) {
    out.push({
      level: "block",
      message: `Too many stems (${count}). Import at most ${STEM_MIX_LIMITS.maxStemCount} total.`,
    });
  } else if (count >= 12) {
    out.push({
      level: "warn",
      message: `${count} stems — decoding and normalization may take a while and use significant memory.`,
    });
  } else if (filesToImport.length >= 6) {
    out.push({
      level: "warn",
      message: `Importing ${filesToImport.length} stems at once — expect slower decode and higher RAM use.`,
    });
  }

  /** Pre-import: one PCM copy per new file (originals may add more after decode — warn, do not block). */
  let importDecodedEst = 0;
  let importFileBytes = 0;
  for (const f of filesToImport) {
    importFileBytes += f.size;
    const decodedEst = estimateStemFileDecodedBytes(f);
    importDecodedEst += decodedEst;

    if (f.size > PERF_THRESHOLDS.blockSourceFileBytes) {
      out.push({
        level: "block",
        message: `"${f.name}" is too large to import as a stem in the browser.`,
      });
    } else if (decodedEst > STEM_MIX_LIMITS.maxSingleStemDecodedBytes) {
      out.push({
        level: "block",
        message: `"${f.name}" may decode too large for a stem on this device. Try a shorter clip or lower sample rate.`,
      });
    }
  }

  const estimatedDecoded = existingDecodedBytes + importDecodedEst;
  const estimatedMb = Math.round(estimatedDecoded / (1024 * 1024));
  if (estimatedDecoded > STEM_MIX_LIMITS.maxTotalDecodedBytes) {
    out.push({
      level: "warn",
      message: `Estimated ~${estimatedMb} MB decoded audio in RAM after import. Large sessions may be slow or unstable on low-memory devices — you can still import.`,
    });
  } else if (estimatedDecoded > STEM_MIX_LIMITS.warnTotalDecodedBytes) {
    out.push({
      level: "warn",
      message: `Estimated ~${estimatedMb} MB decoded audio in RAM after import.`,
    });
  }

  const totalFileMb = importFileBytes / (1024 * 1024);
  if (totalFileMb > 80) {
    out.push({
      level: "warn",
      message: `Large stem files selected (~${Math.round(totalFileMb)} MB). Batch decode may take several minutes.`,
    });
  }

  return out;
}

export function formatStemSourceHint(fileName: string): string {
  const info = formatLabelForExtension(fileName);
  if (info?.label) return info.label;
  const ext = stemFileExtension(fileName).slice(1).toUpperCase();
  return ext || "Audio";
}

export function alignmentStatusLines(
  alignment: StemAlignmentAnalysis | null,
  mix: { sampleRate: number; durationSec: number } | null,
): string[] {
  if (!alignment || !mix) return [];
  const lines: string[] = [];
  if (!alignment.needsNormalization) {
    lines.push("All stems match the full mix sample rate and duration.");
    return lines;
  }
  if (alignment.hasSampleRateMismatch) {
    lines.push(`Some stems need resampling to ${mix.sampleRate} Hz.`);
  }
  if (alignment.hasChannelMismatch) {
    lines.push("Some stems have a different channel layout than the full mix.");
  }
  if (alignment.hasDurationMismatch) {
    const trim = alignment.perStem.filter((p) => p.longerBySec > 0);
    const pad = alignment.perStem.filter((p) => p.shorterBySec > 0);
    if (pad.length) lines.push(`${pad.length} stem(s) shorter — will pad with silence when normalized.`);
    if (trim.length) {
      const large = trim.filter((p) => p.needsLargeTrimConfirm).length;
      lines.push(
        `${trim.length} stem(s) longer than mix (${mix.durationSec.toFixed(1)}s)${
          large ? ` — ${large} need trim confirmation (≥500 ms)` : ""}.`,
      );
    }
  }
  if (alignment.suggestPadMix) {
    lines.push(
      `Stems are consistently longer — consider padding the full mix to ${alignment.suggestedMixDurationSec.toFixed(1)}s.`,
    );
  }
  return lines;
}
