import type { StemDescriptor } from "@mp5/container";
import type { ParsedStemFile } from "./parseStems";
import { estimateStemsDecodedBytes } from "./stemLimits";
import { getStemWorkerClient, type StemDecodeProgress } from "./stemWorkerClient";

export interface DecodedStemPcm {
  stemId: string;
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  decodedBytes: number;
}

export interface StemDecodeCacheStats {
  loadedCount: number;
  decodedRamBytes: number;
  stemIds: string[];
}

export class StemDecodeCache {
  private readonly decoded = new Map<string, DecodedStemPcm>();
  private readonly order: string[] = [];
  private maxRamBytes = 384 * 1024 * 1024;

  setMaxRamBytes(bytes: number): void {
    this.maxRamBytes = Math.max(32 * 1024 * 1024, bytes);
  }

  get(stemId: string): DecodedStemPcm | undefined {
    return this.decoded.get(stemId);
  }

  has(stemId: string): boolean {
    return this.decoded.has(stemId);
  }

  stats(): StemDecodeCacheStats {
    let decodedRamBytes = 0;
    for (const d of this.decoded.values()) decodedRamBytes += d.decodedBytes;
    return {
      loadedCount: this.decoded.size,
      decodedRamBytes,
      stemIds: [...this.decoded.keys()],
    };
  }

  unload(stemId: string): void {
    this.decoded.delete(stemId);
    const i = this.order.indexOf(stemId);
    if (i >= 0) this.order.splice(i, 1);
  }

  unloadAll(): void {
    this.decoded.clear();
    this.order.length = 0;
  }

  private touch(stemId: string): void {
    const i = this.order.indexOf(stemId);
    if (i >= 0) this.order.splice(i, 1);
    this.order.push(stemId);
  }

  private evictIfNeeded(): void {
    let total = 0;
    for (const d of this.decoded.values()) total += d.decodedBytes;
    while (total > this.maxRamBytes && this.order.length) {
      const id = this.order.shift()!;
      const removed = this.decoded.get(id);
      if (removed) {
        total -= removed.decodedBytes;
        this.decoded.delete(id);
      }
    }
  }

  async decodeStem(
    file: ParsedStemFile,
    stem: StemDescriptor,
    stemIndex: number,
    signal?: AbortSignal,
    onProgress?: (p: StemDecodeProgress) => void,
    batch?: { currentIndex: number; total: number },
  ): Promise<DecodedStemPcm> {
    const cached = this.decoded.get(stem.stemId);
    if (cached) {
      this.touch(stem.stemId);
      return cached;
    }

    const entry = await getStemWorkerClient().decodeStem(file, stem, stemIndex, {
      signal,
      onProgress,
      currentIndex: batch?.currentIndex,
      total: batch?.total,
    });

    this.decoded.set(stem.stemId, entry);
    this.touch(stem.stemId);
    this.evictIfNeeded();
    return entry;
  }
}

export function decodedRamEstimate(stems: readonly StemDescriptor[]): number {
  return estimateStemsDecodedBytes(stems);
}
