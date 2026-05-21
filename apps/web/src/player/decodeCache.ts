import type { Mp5File } from "@mp5/container";
import { estimateCachedDecodeBytes } from "../lib/performance/memoryEstimates";
import type { DecodePath, Mp5hDecodeInfo } from "./decodeMp5";

export const DECODE_CACHE_MAX_ENTRIES = 3;

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

  get(trackId: string): CachedDecode | undefined {
    const hit = this.entries.get(trackId);
    if (hit) {
      this.touch(trackId);
    }
    return hit;
  }

  set(trackId: string, value: CachedDecode): void {
    if (this.entries.has(trackId)) {
      this.entries.set(trackId, value);
      this.touch(trackId);
      return;
    }
    while (this.order.length >= DECODE_CACHE_MAX_ENTRIES) {
      const evict = this.order.shift();
      if (evict) this.entries.delete(evict);
    }
    this.entries.set(trackId, value);
    this.order.push(trackId);
  }

  clear(): void {
    this.entries.clear();
    this.order = [];
  }

  /** Prioritize track ids (e.g. prev/current/next). */
  retain(trackIds: string[]): void {
    for (const id of trackIds) {
      if (this.entries.has(id)) this.touch(id);
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
  } {
    let estimatedBytes = 0;
    let currentTrackBytes = 0;
    for (const [id, entry] of this.entries) {
      const bytes = estimateCachedDecodeBytes(entry);
      estimatedBytes += bytes;
      if (id === currentTrackId) currentTrackBytes = bytes;
    }
    return {
      entryCount: this.entries.size,
      estimatedBytes,
      currentTrackBytes,
      trackIds: [...this.order],
    };
  }
}

export const decodeCache = new DecodeCache();
