import { parseMp5 } from "@mp5/container";
import type { BatchQueueItem } from "../../converter/batchTypes";

export interface BatchItemMp5Summary {
  byteLength: number;
  hasCover: boolean;
  hasLyrics: boolean;
  hasStems: boolean;
  hasVisu: boolean;
}

const summaryCache = new WeakMap<ArrayBuffer, BatchItemMp5Summary>();

/** Parse completed MP5 bytes once per buffer; safe to call on every preview recompute. */
export function getBatchItemMp5Summary(item: BatchQueueItem): BatchItemMp5Summary | null {
  if (!item.mp5) return null;
  const buf = item.mp5.buffer as ArrayBuffer;
  const cached = summaryCache.get(buf);
  if (cached && cached.byteLength === item.mp5.byteLength) return cached;
  try {
    const parsed = parseMp5(item.mp5);
    const summary: BatchItemMp5Summary = {
      byteLength: item.mp5.byteLength,
      hasCover: !!(parsed.coverArt?.data.length || parsed.cover?.length),
      hasLyrics: parsed.optional.has("LYRC"),
      hasStems: parsed.optional.has("STEM"),
      hasVisu: parsed.optional.has("VISU"),
    };
    summaryCache.set(buf, summary);
    return summary;
  } catch {
    return {
      byteLength: item.mp5.byteLength,
      hasCover: false,
      hasLyrics: false,
      hasStems: false,
      hasVisu: false,
    };
  }
}
