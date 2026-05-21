/** Calm guardrail thresholds — warn before hard limits where possible. */
export const PERF_THRESHOLDS = {
  /** Source audio file size (bytes). */
  warnSourceFileBytes: 80 * 1024 * 1024,
  blockSourceFileBytes: 256 * 1024 * 1024,

  /** Rough duration from file size heuristic (44.1k stereo 16-bit ≈ 176 KB/s). */
  warnSourceDurationSec: 12 * 60,
  blockSourceDurationSec: 45 * 60,

  warnMp5FileBytes: 120 * 1024 * 1024,

  warnBatchQueueCount: 12,
  blockBatchQueueCount: 48,

  warnLibraryUsageRatio: 0.85,
  blockLibraryUsageRatio: 0.98,

  /** Re-export stem limits for tests. */
  stemWarnTotalBytes: 48 * 1024 * 1024,
  stemBlockTotalBytes: 120 * 1024 * 1024,
} as const;

/** ~176400 bytes/s for 44.1 kHz stereo s16le (conservative for compressed sources). */
export function estimateSourceDurationSec(fileSizeBytes: number): number {
  if (fileSizeBytes <= 0) return 0;
  return fileSizeBytes / 176_400;
}
