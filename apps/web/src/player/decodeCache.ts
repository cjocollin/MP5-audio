import type { Mp5File } from "@mp5/container";
import {
  estimateCachedDecodeBytes,
  estimatePinnedContainerBytes,
} from "../lib/performance/memoryEstimates";
import type { DecodePath, Mp5hDecodeInfo } from "./decodeMp5";

/** Hard upper bound on entry count; the byte budget is the primary limit. */
export const DECODE_CACHE_MAX_ENTRIES = 4;
export const DECODE_CACHE_DEFAULT_BUDGET_BYTES = 128 * 1024 * 1024;

/**
 * Byte budget for NON-protected entries.
 *
 * The protected (currently loaded) track is excluded because caching it costs
 * nothing extra — the audio engine's `pcmRef` already holds the very same
 * `Int16Array`. Only *evictable* entries consume budget, so the number means
 * "extra RAM the cache is allowed to hold on top of what's already live".
 *
 * Scaled by `navigator.deviceMemory` where available (Chromium); browsers that
 * don't report it keep the default rather than being penalised.
 */
export function defaultDecodeCacheBudgetBytes(): number {
  const nav =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & { deviceMemory?: number });
  const dm = nav?.deviceMemory;
  if (typeof dm === "number" && dm > 0) {
    if (dm <= 2) return 32 * 1024 * 1024;
    if (dm <= 4) return 64 * 1024 * 1024;
    if (dm >= 8) return 192 * 1024 * 1024;
  }
  return DECODE_CACHE_DEFAULT_BUDGET_BYTES;
}

export interface CachedDecode {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  parsed: Mp5File;
  decodePath: string;
  mp5h?: Mp5hDecodeInfo;
  duration: number;
}

export class DecodeCache {
  private entries = new Map<string, CachedDecode>();
  private order: string[] = [];
  /** Evictable bytes per entry (decoded PCM only — see memoryEstimates). */
  private byteSize = new Map<string, number>();
  private totalBytes = 0;
  /** The currently loaded track: never evicted, never counted against budget. */
  private protectedId: string | null = null;
  private budgetBytes = defaultDecodeCacheBudgetBytes();

  get(trackId: string): CachedDecode | undefined {
    const hit = this.entries.get(trackId);
    if (hit) {
      this.touch(trackId);
    }
    return hit;
  }

  /**
   * Insert/replace an entry. Returns false when the value is too large to admit
   * (and nothing was stored) so callers never trigger an insert-then-evict loop
   * that would re-decode the same track forever.
   */
  set(trackId: string, value: CachedDecode): boolean {
    const bytes = estimateCachedDecodeBytes(value);
    if (trackId !== this.protectedId && !this.canAdmit(bytes)) {
      return false;
    }
    if (this.entries.has(trackId)) {
      this.totalBytes -= this.byteSize.get(trackId) ?? 0;
    } else {
      this.order.push(trackId);
    }
    this.entries.set(trackId, value);
    this.byteSize.set(trackId, bytes);
    this.totalBytes += bytes;
    this.touch(trackId);
    this.evictToFit();
    return true;
  }

  /** Would an entry of this size fit the non-protected budget on its own? */
  canAdmit(projectedBytes: number): boolean {
    return projectedBytes <= this.budgetBytes;
  }

  /** Mark the currently loaded track so it is never evicted. */
  setProtected(trackId: string | null): void {
    this.protectedId = trackId;
    this.evictToFit();
  }

  /** Test seam / runtime downgrade under memory pressure. */
  setBudgetBytes(bytes: number): void {
    this.budgetBytes = Math.max(0, bytes);
    this.evictToFit();
  }

  /** Bytes held by entries that eviction could actually reclaim. */
  nonProtectedBytes(): number {
    const pinned =
      this.protectedId != null ? (this.byteSize.get(this.protectedId) ?? 0) : 0;
    return this.totalBytes - pinned;
  }

  clear(): void {
    this.entries.clear();
    this.byteSize.clear();
    this.order = [];
    this.totalBytes = 0;
  }

  /** Prioritize track ids (e.g. prev/current/next). */
  retain(trackIds: string[]): void {
    for (const id of trackIds) {
      if (this.entries.has(id)) this.touch(id);
    }
  }

  private delete(trackId: string): void {
    if (!this.entries.delete(trackId)) return;
    this.totalBytes -= this.byteSize.get(trackId) ?? 0;
    this.byteSize.delete(trackId);
    this.order = this.order.filter((id) => id !== trackId);
  }

  /** Evict LRU-first (never the protected entry) until within byte + count caps. */
  private evictToFit(): void {
    for (const id of [...this.order]) {
      if (
        this.nonProtectedBytes() <= this.budgetBytes &&
        this.entries.size <= DECODE_CACHE_MAX_ENTRIES
      ) {
        return;
      }
      if (id === this.protectedId) continue;
      this.delete(id);
    }
  }

  private touch(trackId: string): void {
    this.order = this.order.filter((id) => id !== trackId);
    this.order.push(trackId);
  }

  size(): number {
    return this.entries.size;
  }

  getStats(currentTrackId?: string): {
    entryCount: number;
    estimatedBytes: number;
    currentTrackBytes: number;
    trackIds: string[];
    budgetBytes: number;
    nonProtectedBytes: number;
    pinnedContainerBytes: number;
  } {
    let estimatedBytes = 0;
    let currentTrackBytes = 0;
    let pinnedContainerBytes = 0;
    for (const [id, entry] of this.entries) {
      const bytes = estimateCachedDecodeBytes(entry);
      estimatedBytes += bytes;
      pinnedContainerBytes += estimatePinnedContainerBytes(entry);
      if (id === currentTrackId) currentTrackBytes = bytes;
    }
    return {
      entryCount: this.entries.size,
      estimatedBytes,
      currentTrackBytes,
      trackIds: [...this.order],
      budgetBytes: this.budgetBytes,
      nonProtectedBytes: this.nonProtectedBytes(),
      pinnedContainerBytes,
    };
  }
}

export const decodeCache = new DecodeCache();
