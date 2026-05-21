import type { CachedDecode } from "../../player/decodeCache";

/** Decoded PCM RAM: samples × 2 bytes (Int16). */
export function estimatePcmBytes(samples: Int16Array | undefined, channels = 2): number {
  if (!samples?.length) return 0;
  return samples.length * 2;
}

export function estimateCachedDecodeBytes(entry: CachedDecode): number {
  return estimatePcmBytes(entry.samples, entry.channels);
}

export function formatMemoryEstimate(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
