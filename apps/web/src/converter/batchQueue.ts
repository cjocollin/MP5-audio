import { buildExportFilename } from "./exportFilename";
import type { ExportPhase } from "./exportPipeline";
import {
  BATCH_CODEC,
  type BatchItemStatus,
  type BatchProgressSummary,
  type BatchQueueItem,
} from "./batchTypes";
import { formatLabelForExtension } from "./supportedSources";
import type { ManualMetadataEdits } from "./manualMetadata";

export function isBatchSourceSupported(filename: string): boolean {
  return !!formatLabelForExtension(filename);
}

export function createBatchItemsFromFiles(files: File[]): {
  items: BatchQueueItem[];
  skipped: BatchQueueItem[];
} {
  const items: BatchQueueItem[] = [];
  const skipped: BatchQueueItem[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const base: Omit<BatchQueueItem, "status"> = {
      id,
      sourceName: file.name,
      sourceSize: file.size,
      file,
    };
    if (!isBatchSourceSupported(file.name)) {
      skipped.push({
        ...base,
        status: "skipped",
        errorMessage: "Unsupported file type — use WAV, FLAC, MP3, M4A, AAC, OGG, or Opus.",
      });
    } else {
      items.push({ ...base, status: "pending" });
    }
  }
  return { items, skipped };
}

export function mergeBatchQueues(
  existing: BatchQueueItem[],
  incoming: BatchQueueItem[],
): BatchQueueItem[] {
  const seen = new Set(existing.map((i) => `${i.sourceName}:${i.sourceSize}`));
  const merged = [...existing];
  for (const item of incoming) {
    const key = `${item.sourceName}:${item.sourceSize}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export function mapExportPhaseToBatchStatus(phase: ExportPhase): BatchItemStatus {
  switch (phase) {
    case "building-waveform":
      return "metadata";
    case "encoding":
      return "encoding";
    case "writing-metadata":
      return "encoding";
    case "validating":
      return "validating";
    case "ready":
      return "complete";
    default:
      return "encoding";
  }
}

export function batchOutputFilename(
  edits: ManualMetadataEdits,
  sourceName: string,
): string {
  return buildExportFilename(
    { title: edits.meta.title, artist: edits.meta.artist },
    BATCH_CODEC,
    sourceName,
  );
}

export function clearCompletedItems(items: BatchQueueItem[]): BatchQueueItem[] {
  return items.filter((i) => i.status !== "complete");
}

export function retryFailedItems(items: BatchQueueItem[]): BatchQueueItem[] {
  return items.map((i) =>
    i.status === "failed" || i.status === "cancelled"
      ? {
          ...i,
          status: "pending" as const,
          errorMessage: undefined,
          outputFilename: undefined,
          outputBytes: undefined,
          mp5: undefined,
          librarySaved: undefined,
          libraryDuplicate: undefined,
          librarySkipped: undefined,
        }
      : i,
  );
}

export function cancelInProgressItems(items: BatchQueueItem[]): BatchQueueItem[] {
  return items.map((i) => {
    const active: BatchItemStatus[] = [
      "decoding",
      "metadata",
      "encoding",
      "validating",
    ];
    if (!active.includes(i.status)) return i;
    return {
      ...i,
      status: "cancelled",
      errorMessage: "Batch cancelled.",
    };
  });
}

const IN_PROGRESS: BatchItemStatus[] = [
  "decoding",
  "metadata",
  "encoding",
  "validating",
];

export function computeBatchSummary(items: BatchQueueItem[]): BatchProgressSummary {
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let cancelled = 0;
  let pending = 0;
  let inProgress = 0;
  let totalOutputBytes = 0;
  let librarySaves = 0;
  let libraryDuplicates = 0;

  for (const item of items) {
    switch (item.status) {
      case "complete":
        completed++;
        totalOutputBytes += item.outputBytes ?? 0;
        if (item.librarySaved) librarySaves++;
        if (item.libraryDuplicate) libraryDuplicates++;
        break;
      case "failed":
        failed++;
        break;
      case "skipped":
        skipped++;
        break;
      case "cancelled":
        cancelled++;
        break;
      case "pending":
        pending++;
        break;
      default:
        if (IN_PROGRESS.includes(item.status)) inProgress++;
        break;
    }
  }

  return {
    total: items.length,
    completed,
    failed,
    skipped,
    cancelled,
    pending,
    inProgress,
    totalOutputBytes,
    librarySaves,
    libraryDuplicates,
  };
}

export function nextPendingItem(items: BatchQueueItem[]): BatchQueueItem | undefined {
  return items.find((i) => i.status === "pending");
}

export function hasRetryableItems(items: BatchQueueItem[]): boolean {
  return items.some((i) => i.status === "failed" || i.status === "cancelled");
}

export function hasCompletedItems(items: BatchQueueItem[]): boolean {
  return items.some((i) => i.status === "complete");
}
