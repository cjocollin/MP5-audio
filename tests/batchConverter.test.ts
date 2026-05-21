import { describe, it, expect } from "vitest";
import {
  batchOutputFilename,
  clearCompletedItems,
  computeBatchSummary,
  createBatchItemsFromFiles,
  hasCompletedItems,
  hasRetryableItems,
  isBatchSourceSupported,
  mapExportPhaseToBatchStatus,
  mergeBatchQueues,
  retryFailedItems,
} from "../apps/web/src/converter/batchQueue";
import { BATCH_CODEC, type BatchQueueItem } from "../apps/web/src/converter/batchTypes";
import { manualEditsFromSource } from "../apps/web/src/converter/manualMetadata";
import { buildExportFilename } from "../apps/web/src/converter/exportFilename";

function mockFile(name: string, size = 1000): File {
  return new File([new Uint8Array(Math.min(size, 8))], name, { type: "audio/wav" });
}

describe("batch source support", () => {
  it("accepts known audio extensions", () => {
    expect(isBatchSourceSupported("song.flac")).toBe(true);
    expect(isBatchSourceSupported("song.mp3")).toBe(true);
    expect(isBatchSourceSupported("track.m4a")).toBe(true);
  });

  it("rejects unknown extensions", () => {
    expect(isBatchSourceSupported("notes.txt")).toBe(false);
  });
});

describe("batch queue creation", () => {
  it("creates pending items for supported files", () => {
    const { items, skipped } = createBatchItemsFromFiles([
      mockFile("a.wav"),
      mockFile("b.flac"),
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.status === "pending")).toBe(true);
    expect(skipped).toHaveLength(0);
  });

  it("marks unsupported files as skipped", () => {
    const { items, skipped } = createBatchItemsFromFiles([
      mockFile("ok.wav"),
      mockFile("bad.xyz"),
    ]);
    expect(items).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.status).toBe("skipped");
    expect(skipped[0]!.errorMessage).toContain("Unsupported");
  });

  it("merges without duplicate source name+size", () => {
    const a = createBatchItemsFromFiles([mockFile("x.wav", 500)]).items;
    const b = createBatchItemsFromFiles([mockFile("x.wav", 500), mockFile("y.wav")]).items;
    const merged = mergeBatchQueues(a, b);
    expect(merged).toHaveLength(2);
  });
});

describe("batch status transitions", () => {
  it("maps export phases to queue statuses", () => {
    expect(mapExportPhaseToBatchStatus("building-waveform")).toBe("metadata");
    expect(mapExportPhaseToBatchStatus("encoding")).toBe("encoding");
    expect(mapExportPhaseToBatchStatus("validating")).toBe("validating");
    expect(mapExportPhaseToBatchStatus("ready")).toBe("complete");
  });
});

describe("batch queue maintenance", () => {
  const base = (status: BatchQueueItem["status"]): BatchQueueItem => ({
    id: "1",
    sourceName: "a.wav",
    sourceSize: 1,
    file: mockFile("a.wav"),
    status,
  });

  it("clears completed items", () => {
    const items = [base("complete"), base("pending"), base("failed")];
    expect(clearCompletedItems(items)).toHaveLength(2);
  });

  it("retries failed and cancelled", () => {
    const items = [base("failed"), base("cancelled"), base("complete")];
    const retried = retryFailedItems(items);
    expect(retried[0]!.status).toBe("pending");
    expect(retried[1]!.status).toBe("pending");
    expect(retried[2]!.status).toBe("complete");
    expect(hasRetryableItems(items)).toBe(true);
    expect(hasCompletedItems(items)).toBe(true);
  });
});

describe("batch output summary", () => {
  it("aggregates completed, failed, skipped, and library stats", () => {
    const items: BatchQueueItem[] = [
      {
        id: "1",
        sourceName: "a.wav",
        sourceSize: 1,
        file: mockFile("a.wav"),
        status: "complete",
        outputBytes: 1000,
        librarySaved: true,
      },
      {
        id: "2",
        sourceName: "b.wav",
        sourceSize: 1,
        file: mockFile("b.wav"),
        status: "complete",
        outputBytes: 2000,
        libraryDuplicate: true,
      },
      {
        id: "3",
        sourceName: "c.xyz",
        sourceSize: 1,
        file: mockFile("c.xyz"),
        status: "skipped",
      },
      {
        id: "4",
        sourceName: "d.wav",
        sourceSize: 1,
        file: mockFile("d.wav"),
        status: "failed",
      },
      {
        id: "5",
        sourceName: "e.wav",
        sourceSize: 1,
        file: mockFile("e.wav"),
        status: "pending",
      },
    ];
    const s = computeBatchSummary(items);
    expect(s.total).toBe(5);
    expect(s.completed).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.totalOutputBytes).toBe(3000);
    expect(s.librarySaves).toBe(1);
    expect(s.libraryDuplicates).toBe(1);
  });
});

describe("batch safe filenames", () => {
  it("uses MP5-L v3 naming from detected metadata", () => {
    const edits = manualEditsFromSource({
      meta: { artist: "Artist", title: "Title" },
    });
    expect(batchOutputFilename(edits, "source.flac")).toBe(
      buildExportFilename({ artist: "Artist", title: "Title" }, BATCH_CODEC, "source.flac"),
    );
  });

  it("falls back to source basename", () => {
    const edits = manualEditsFromSource({ meta: {} });
    expect(batchOutputFilename(edits, "my_track.mp3")).toBe("my_track.mp5");
  });
});
