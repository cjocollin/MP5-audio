import type { PendingStemPcm } from "./stemValidation";

/** Mismatch under this is trimmed/padded without extra confirmation. */
export const STEM_SMALL_MISMATCH_SEC = 0.5;

/** After normalization, duration must be within this of the mix. */
export const STEM_POST_ALIGN_TOLERANCE_SEC = 0.05;

export type StemAlignmentStrategy = "trim-pad-stems" | "pad-mix";

export type StemDurationAction = "unchanged" | "padded" | "trimmed";

export interface MixPcmLike {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
}

export interface StemSourceSnapshot {
  sampleRate: number;
  channels: number;
  durationSec: number;
  fileName: string;
}

export interface StemNormalizeMeta {
  resampled: boolean;
  channelAdjusted: boolean;
  durationAction: StemDurationAction;
  trimRemovedSec?: number;
  padAddedSec?: number;
  largeTrim?: boolean;
}

export interface StemAlignmentStemInfo {
  stemId: string;
  stemName: string;
  longerBySec: number;
  shorterBySec: number;
  needsLargeTrimConfirm: boolean;
}

export interface StemAlignmentAnalysis {
  needsNormalization: boolean;
  hasSampleRateMismatch: boolean;
  hasDurationMismatch: boolean;
  hasChannelMismatch: boolean;
  suggestPadMix: boolean;
  suggestedMixDurationSec: number;
  mixDurationSec: number;
  perStem: StemAlignmentStemInfo[];
  anyLargeTrim: boolean;
}

export function pcmDurationSec(samples: Int16Array, channels: number, sampleRate: number): number {
  if (!sampleRate || !channels) return 0;
  return samples.length / channels / sampleRate;
}

export function ensureStemSourceSnapshot(stem: PendingStemPcm): PendingStemPcm {
  if (stem.sourceSnapshot && stem.originalSamples) return stem;
  return {
    ...stem,
    sourceSnapshot: {
      sampleRate: stem.sampleRate,
      channels: stem.channels,
      durationSec: pcmDurationSec(stem.samples, stem.channels, stem.sampleRate),
      fileName: stem.fileName,
    },
    originalSamples: stem.originalSamples ?? stem.samples.slice(),
  };
}

export function analyzeStemAlignment(
  mix: MixPcmLike,
  stems: PendingStemPcm[],
  mixDurationSecOverride?: number,
): StemAlignmentAnalysis {
  const mixDurationSec =
    mixDurationSecOverride ?? pcmDurationSec(mix.samples, mix.channels, mix.sampleRate);
  const perStem: StemAlignmentStemInfo[] = [];
  let hasSampleRateMismatch = false;
  let hasDurationMismatch = false;
  let hasChannelMismatch = false;
  let anyLargeTrim = false;
  let longerCount = 0;
  let maxStemDurationSec = mixDurationSec;

  for (const stem of stems) {
    const stemDur = pcmDurationSec(stem.samples, stem.channels, stem.sampleRate);
    maxStemDurationSec = Math.max(maxStemDurationSec, stemDur);
    if (stem.sampleRate !== mix.sampleRate) hasSampleRateMismatch = true;
    if (stem.channels !== mix.channels) hasChannelMismatch = true;
    const delta = stemDur - mixDurationSec;
    const longerBySec = delta > STEM_POST_ALIGN_TOLERANCE_SEC ? delta : 0;
    const shorterBySec = delta < -STEM_POST_ALIGN_TOLERANCE_SEC ? -delta : 0;
    if (longerBySec > 0 || shorterBySec > 0) hasDurationMismatch = true;
    if (longerBySec > STEM_SMALL_MISMATCH_SEC) longerCount += 1;
    const needsLargeTrimConfirm = longerBySec >= STEM_SMALL_MISMATCH_SEC;
    if (needsLargeTrimConfirm) anyLargeTrim = true;
    perStem.push({
      stemId: stem.id,
      stemName: stem.name || stem.fileName,
      longerBySec,
      shorterBySec,
      needsLargeTrimConfirm,
    });
  }

  const suggestPadMix =
    stems.length >= 2 &&
    longerCount === stems.length &&
    maxStemDurationSec > mixDurationSec + 0.1;

  return {
    needsNormalization:
      hasSampleRateMismatch || hasDurationMismatch || hasChannelMismatch,
    hasSampleRateMismatch,
    hasDurationMismatch,
    hasChannelMismatch,
    suggestPadMix,
    suggestedMixDurationSec: maxStemDurationSec,
    mixDurationSec,
    perStem,
    anyLargeTrim,
  };
}

/** Linear interpolation resample (interleaved Int16). */
export function resampleInterleavedPcm(
  samples: Int16Array,
  channels: number,
  fromRate: number,
  toRate: number,
): Int16Array {
  if (fromRate === toRate || !fromRate || !toRate) return samples;
  const inFrames = Math.floor(samples.length / channels);
  if (inFrames <= 0) return samples;
  const outFrames = Math.max(1, Math.round((inFrames * toRate) / fromRate));
  const out = new Int16Array(outFrames * channels);
  for (let ch = 0; ch < channels; ch++) {
    for (let i = 0; i < outFrames; i++) {
      const srcPos = (i * inFrames) / outFrames;
      const i0 = Math.min(Math.floor(srcPos), inFrames - 1);
      const i1 = Math.min(i0 + 1, inFrames - 1);
      const t = srcPos - i0;
      const s0 = samples[i0 * channels + ch] ?? 0;
      const s1 = samples[i1 * channels + ch] ?? 0;
      out[i * channels + ch] = Math.round(s0 * (1 - t) + s1 * t);
    }
  }
  return out;
}

/** Match mono ↔ stereo for stem export alignment (documented helper, not AI). */
export function adjustChannelLayout(
  samples: Int16Array,
  channels: number,
  targetChannels: number,
): Int16Array {
  if (channels === targetChannels) return samples;
  const frames = Math.floor(samples.length / channels);
  if (frames <= 0) return samples;

  if (channels === 1 && targetChannels === 2) {
    const out = new Int16Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      const s = samples[i] ?? 0;
      out[i * 2] = s;
      out[i * 2 + 1] = s;
    }
    return out;
  }

  if (channels === 2 && targetChannels === 1) {
    const out = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      out[i] = Math.round(((samples[i * 2] ?? 0) + (samples[i * 2 + 1] ?? 0)) / 2);
    }
    return out;
  }

  return samples.slice(0, frames * targetChannels);
}

export function alignStemDuration(
  samples: Int16Array,
  channels: number,
  sampleRate: number,
  targetDurationSec: number,
  allowLargeTrim: boolean,
): {
  samples: Int16Array;
  action: StemDurationAction;
  trimRemovedSec?: number;
  padAddedSec?: number;
  largeTrim?: boolean;
  blocked?: boolean;
} {
  const currentSec = pcmDurationSec(samples, channels, sampleRate);
  const delta = currentSec - targetDurationSec;
  if (Math.abs(delta) <= STEM_POST_ALIGN_TOLERANCE_SEC) {
    return { samples, action: "unchanged" };
  }

  const targetFrames = Math.max(1, Math.round(targetDurationSec * sampleRate));
  const currentFrames = Math.floor(samples.length / channels);

  if (delta < 0) {
    const padFrames = targetFrames - currentFrames;
    const out = new Int16Array(targetFrames * channels);
    out.set(samples);
    return {
      samples: out,
      action: "padded",
      padAddedSec: padFrames / sampleRate,
    };
  }

  const trimSec = delta;
  if (trimSec >= STEM_SMALL_MISMATCH_SEC && !allowLargeTrim) {
    return { samples, action: "unchanged", largeTrim: true, blocked: true };
  }

  const out = samples.slice(0, targetFrames * channels);
  return {
    samples: out,
    action: "trimmed",
    trimRemovedSec: trimSec,
    largeTrim: trimSec >= STEM_SMALL_MISMATCH_SEC,
  };
}

export function normalizeStemToMix(
  stem: PendingStemPcm,
  mix: MixPcmLike,
  opts: { allowLargeTrim: boolean },
): PendingStemPcm {
  const stored = ensureStemSourceSnapshot(stem);
  let samples = stored.originalSamples!.slice();
  let sampleRate = stored.sourceSnapshot!.sampleRate;
  let channels = stored.sourceSnapshot!.channels;

  const meta: StemNormalizeMeta = {
    resampled: false,
    channelAdjusted: false,
    durationAction: "unchanged",
  };

  if (sampleRate !== mix.sampleRate) {
    samples = Int16Array.from(
      resampleInterleavedPcm(samples, channels, sampleRate, mix.sampleRate),
    );
    sampleRate = mix.sampleRate;
    meta.resampled = true;
  }

  if (channels !== mix.channels) {
    samples = Int16Array.from(adjustChannelLayout(samples, channels, mix.channels));
    channels = mix.channels;
    meta.channelAdjusted = true;
  }

  const mixDur = pcmDurationSec(mix.samples, mix.channels, mix.sampleRate);
  const aligned = alignStemDuration(samples, channels, sampleRate, mixDur, opts.allowLargeTrim);
  if (aligned.blocked) {
    return { ...stored, normalizeMeta: { ...meta, largeTrim: true } };
  }

  samples = Int16Array.from(aligned.samples);
  meta.durationAction = aligned.action;
  meta.trimRemovedSec = aligned.trimRemovedSec;
  meta.padAddedSec = aligned.padAddedSec;
  meta.largeTrim = aligned.largeTrim;

  return {
    ...stored,
    samples,
    sampleRate,
    channels,
    normalizeMeta: meta,
  };
}

export function normalizeAllStemsToMix(
  mix: MixPcmLike,
  stems: PendingStemPcm[],
  allowLargeTrim: boolean,
): PendingStemPcm[] {
  return stems.map((s) => normalizeStemToMix(s, mix, { allowLargeTrim }));
}

/** Let the browser paint and GC between heavy stem normalizations. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export interface NormalizeStemsProgress {
  index: number;
  total: number;
  stem: PendingStemPcm;
  /** Stems normalized so far (same array reference updated each step). */
  working: PendingStemPcm[];
}

/** Normalize one stem at a time to avoid RAM spikes with large batches. */
export async function normalizeStemsToMixSequentially(
  mix: MixPcmLike,
  stems: PendingStemPcm[],
  allowLargeTrim: boolean,
  onProgress?: (progress: NormalizeStemsProgress) => void,
): Promise<PendingStemPcm[]> {
  const working = stems.map((s) => ensureStemSourceSnapshot(s));
  for (let i = 0; i < working.length; i++) {
    const stem = working[i]!;
    onProgress?.({ index: i, total: working.length, stem, working });
    await yieldToMain();
    working[i] = ensureStemSourceSnapshot(
      normalizeStemToMix(stem, mix, { allowLargeTrim }),
    );
    onProgress?.({
      index: i,
      total: working.length,
      stem: working[i]!,
      working,
    });
    await yieldToMain();
  }
  return working;
}

export function padMixToDuration(mix: MixPcmLike, targetDurationSec: number): MixPcmLike {
  const currentSec = pcmDurationSec(mix.samples, mix.channels, mix.sampleRate);
  if (targetDurationSec <= currentSec + STEM_POST_ALIGN_TOLERANCE_SEC) return mix;
  const targetFrames = Math.round(targetDurationSec * mix.sampleRate);
  const currentFrames = Math.floor(mix.samples.length / mix.channels);
  const padFrames = targetFrames - currentFrames;
  if (padFrames <= 0) return mix;
  const out = new Int16Array(targetFrames * mix.channels);
  out.set(mix.samples);
  return { ...mix, samples: out };
}

export function formatStemNormalizeSummary(meta: StemNormalizeMeta | undefined): string[] {
  if (!meta) return [];
  const lines: string[] = [];
  if (meta.resampled) lines.push("resampled");
  if (meta.channelAdjusted) lines.push("channels adjusted");
  if (meta.durationAction === "padded") {
    lines.push(
      meta.padAddedSec != null
        ? `padded (+${meta.padAddedSec.toFixed(2)}s silence)`
        : "padded",
    );
  }
  if (meta.durationAction === "trimmed") {
    lines.push(
      meta.trimRemovedSec != null
        ? `trimmed (−${meta.trimRemovedSec.toFixed(2)}s)`
        : "trimmed",
    );
  }
  if (meta.durationAction === "unchanged" && !meta.resampled && !meta.channelAdjusted) {
    lines.push("unchanged");
  }
  if (meta.largeTrim) lines.push("large trim");
  return lines;
}
