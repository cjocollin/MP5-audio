import type { CachedDecode } from "../../player/decodeCache";

/** Decoded PCM RAM: samples × 2 bytes (Int16). */
export function estimatePcmBytes(samples: Int16Array | undefined, channels = 2): number {
  if (!samples?.length) return 0;
  return samples.length * 2;
}

/**
 * Bytes a cache eviction would actually reclaim: the decoded PCM only.
 *
 * Deliberately excludes `entry.parsed` — on the frames decode path that object
 * is the SAME `Mp5File` the playlist track holds, so dropping the cache entry
 * frees none of it. Counting it here would inflate the eviction budget with
 * memory eviction cannot return. Use `estimatePinnedContainerBytes` to report
 * that retention separately.
 */
export function estimateCachedDecodeBytes(entry: CachedDecode): number {
  return estimatePcmBytes(entry.samples, entry.channels);
}

/**
 * Compressed AUDI bytes reachable from a cache entry's container handle.
 * Usually shared with the playlist track (not reclaimed by eviction) — reported
 * for diagnostics so the panel doesn't understate real per-track retention.
 */
export function estimatePinnedContainerBytes(entry: CachedDecode): number {
  let bytes = 0;
  for (const frame of entry.parsed?.audioFrames ?? []) {
    bytes += frame.data?.byteLength ?? 0;
  }
  return bytes;
}

export function formatMemoryEstimate(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
