import { parseMp5 } from "@mp5/container";
import type { BatchQueueItem } from "../../converter/batchTypes";
import { getBatchOutput } from "../../converter/batchOutputCache";

export interface BatchItemMp5Summary {
  byteLength: number;
  hasCover: boolean;
  hasLyrics: boolean;
  hasStems: boolean;
  hasVisu: boolean;
}

const summaryCache = new WeakMap<ArrayBuffer, BatchItemMp5Summary>();

function resolveItemBytes(item: BatchQueueItem): Uint8Array | undefined {
  return getBatchOutput(item.id) ?? item.mp5;
}

/** Parse completed MP5 bytes once per buffer; safe to call on every preview recompute. */
export function getBatchItemMp5Summary(item: BatchQueueItem): BatchItemMp5Summary | null {
  const bytes = resolveItemBytes(item);
  if (!bytes) return null;
  const buf = bytes.buffer as ArrayBuffer;
  const cached = summaryCache.get(buf);
  if (cached && cached.byteLength === bytes.byteLength) return cached;
  try {
    const parsed = parseMp5(bytes);
    const summary: BatchItemMp5Summary = {
      byteLength: bytes.byteLength,
      hasCover: !!(parsed.coverArt?.data.length || parsed.cover?.length),
      hasLyrics: parsed.optional.has("LYRC"),
      hasStems: parsed.optional.has("STEM"),
      hasVisu: parsed.optional.has("VISU"),
    };
    summaryCache.set(buf, summary);
    return summary;
  } catch {
    return {
      byteLength: bytes.byteLength,
      hasCover: false,
      hasLyrics: false,
      hasStems: false,
      hasVisu: false,
    };
  }
}
