import type { StemDescriptor } from "@mp5/container";
import { StemDecodeCache, type DecodedStemPcm } from "./stemDecodeCache";
import type { ParsedStemFile } from "./parseStems";
import { yieldToMain } from "./stemFrameLoader";

import type { StemWorkerTaskPhase } from "./stemWorkerProtocol";

export interface StemPrepareProgress {
  phase: StemWorkerTaskPhase | "preparing" | "done" | "cancelled" | "error";
  currentStemName?: string;
  currentIndex: number;
  total: number;
  decodedRamBytes: number;
  percent?: number;
}

export interface PrepareStemsOptions {
  file: ParsedStemFile;
  stems: StemDescriptor[];
  cache: StemDecodeCache;
  signal?: AbortSignal;
  onProgress?: (p: StemPrepareProgress) => void;
}

export async function prepareStemsSequential(
  opts: PrepareStemsOptions,
): Promise<DecodedStemPcm[]> {
  const { file, stems, cache, signal, onProgress } = opts;
  const out: DecodedStemPcm[] = [];
  const total = stems.length;

  for (let i = 0; i < stems.length; i++) {
    if (signal?.aborted) throw new DOMException("Stem preparation cancelled", "AbortError");
    const stem = stems[i]!;
    const stemIndex = file.stems.findIndex((s) => s.stemId === stem.stemId);
    const decoded = await cache.decodeStem(
      file,
      stem,
      Math.max(0, stemIndex),
      signal,
      (p) => {
        onProgress?.({
          phase: p.phase === "idle" ? "preparing" : p.phase,
          currentStemName: p.stemName ?? stem.stemName,
          currentIndex: i + 1,
          total,
          decodedRamBytes: cache.stats().decodedRamBytes,
          percent: p.percent,
        });
      },
      { currentIndex: i + 1, total },
    );
    out.push(decoded);
    await yieldToMain();
  }

  onProgress?.({
    phase: "done",
    currentIndex: total,
    total,
    decodedRamBytes: cache.stats().decodedRamBytes,
  });
  return out;
}
