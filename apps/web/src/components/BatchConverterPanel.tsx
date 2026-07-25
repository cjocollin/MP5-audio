import { useEffect, useMemo, useRef, useState } from "react";

import { getCodec, getCodecLoadState } from "../wasm/codec";
import { FileDropZone } from "../player/FileDropZone";
import { SupportedSourcesNote } from "./SupportedSourcesNote";
import { formatBytes } from "../converter/exportSummary";
import {
  BATCH_ITEM_STATUS_LABELS,
  BATCH_LIMITATIONS,
  type BatchQueueItem,
} from "../converter/batchTypes";
import {
  cancelInProgressItems,
  clearCompletedItems,
  computeBatchSummary,
  createBatchItemsFromFiles,
  hasCompletedItems,
  hasRetryableItems,
  mergeBatchQueues,
  nextPendingItem,
  retryFailedItems,
} from "../converter/batchQueue";
import { runBatchItemConversion } from "../converter/runBatchItem";
import {
  deleteBatchOutput,
  getBatchOutput,
  setBatchOutput,
} from "../converter/batchOutputCache";
import { saveMp5ToLibrary } from "../lib/localLibrary/api";
import { LibraryStorageError } from "../lib/localLibrary/errors";
import { downloadBlob } from "../lib/performance/downloadBlob";
import { dedupeExportFilenames } from "../converter/exportFilename";
import { redactLocalPaths } from "../lib/album/exportReview";
import { APP_VERSION } from "../generated/appVersion";
import { assessBatchQueue, type GuardrailMessage } from "../lib/performance/guardrails";
import { GuardrailNotice } from "./GuardrailNotice";
import { useConversionStore } from "../store/conversionStore";
import { BatchAlbumBuilderSection } from "./BatchAlbumBuilderSection";
import {
  emptyAlbumMeta,
  trackMetaToManualEdits,
  type BatchAlbumLevelMeta,
  type BatchTrackAlbumMeta,
} from "../lib/album/batchAlbumMetadata";
import { batchOutputFilenameForTrack } from "../lib/album/batchAlbumMetadata";

function statusClass(status: BatchQueueItem["status"]): string {
  switch (status) {
    case "complete":
      return "text-green-400";
    case "failed":
      return "text-red-400";
    case "skipped":
    case "cancelled":
      return "text-amber-300/90";
    case "pending":
      return "text-gray-500";
    default:
      return "text-accent";
  }
}

function patchItem(
  items: BatchQueueItem[],
  id: string,
  patch: Partial<BatchQueueItem>,
): BatchQueueItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

interface BatchConverterPanelProps {
  seedFiles?: File[] | null;
  onSeedConsumed?: () => void;
}

export function BatchConverterPanel({
  seedFiles = null,
  onSeedConsumed,
}: BatchConverterPanelProps = {}) {
  const [items, setItems] = useState<BatchQueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [autoSaveLibrary, setAutoSaveLibrary] = useState(false);
  const [loadState, setLoadState] = useState(getCodecLoadState());
  const [batchError, setBatchError] = useState("");
  const [queueGuardrails, setQueueGuardrails] = useState<GuardrailMessage[]>([]);
  const [batchAlbumMode, setBatchAlbumMode] = useState(false);
  const [album, setAlbum] = useState<BatchAlbumLevelMeta>(() => emptyAlbumMeta());
  const [trackMetas, setTrackMetas] = useState<Record<string, BatchTrackAlbumMeta>>({});
  const [trackOrder, setTrackOrder] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const seedAppliedRef = useRef(false);
  const { bumpCancelGeneration, setBatchActivity } = useConversionStore();
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const codecUnavailable = loadState === "unavailable";
  const codecReady = loadState === "ready";
  const summary = useMemo(() => computeBatchSummary(items), [items]);
  const hasPending = items.some((i) => i.status === "pending");
  const canStart = codecReady && !running && hasPending;

  useEffect(() => {
    getCodec()
      .then(() => setLoadState(getCodecLoadState()))
      .catch(() => setLoadState("unavailable"));
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function handleAddFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const { items: added, skipped } = createBatchItemsFromFiles(list);
    setItems((prev) => {
      const merged = mergeBatchQueues(prev, [...added, ...skipped]);
      const pending = merged.filter((i) => i.status === "pending").length;
      setQueueGuardrails(
        assessBatchQueue(pending, merged.length),
      );
      return merged;
    });
    setBatchError("");
  }

  useEffect(() => {
    if (!seedFiles?.length || seedAppliedRef.current) return;
    seedAppliedRef.current = true;
    handleAddFiles(seedFiles);
    onSeedConsumed?.();
  }, [seedFiles, onSeedConsumed]);

  useEffect(() => {
    const pending = items.filter((i) => i.status === "pending").length;
    setQueueGuardrails(assessBatchQueue(pending, items.length));
  }, [items]);

  async function saveItemToLibrary(item: BatchQueueItem): Promise<Partial<BatchQueueItem>> {
    const bytes = getBatchOutput(item.id) ?? item.mp5;
    if (!bytes || !item.outputFilename) return {};
    const blob = new Blob([new Uint8Array(bytes)], { type: "audio/mp5" });
    const file = new File([blob], item.outputFilename, { type: "audio/mp5" });
    try {
      const result = await saveMp5ToLibrary(file, item.outputFilename, {
        skipIfDuplicate: autoSaveLibrary,
      });
      if (result.status === "failed") {
        return {
          errorMessage:
            result.errorCode === "quota" ? "Storage quota exceeded" : result.message,
        };
      }
      if (result.status === "duplicate") {
        if (result.skipped) {
          return { libraryDuplicate: true, librarySkipped: true };
        }
        return { libraryDuplicate: true, librarySaved: false };
      }
      /* Drop retained bytes after a successful library write. */
      deleteBatchOutput(item.id);
      return { librarySaved: true, libraryDuplicate: false };
    } catch (e) {
      const msg =
        e instanceof LibraryStorageError && e.code === "quota"
          ? "Storage quota exceeded"
          : e instanceof Error
            ? e.message
            : String(e);
      return { errorMessage: msg };
    }
  }

  async function handleStartBatch() {
    if (!codecReady) {
      setBatchError("MP5-L v4 batch export requires WASM codecs. Run pnpm wasm:build and refresh.");
      return;
    }
    if (queueGuardrails.some((g) => g.level === "block")) {
      setBatchError("Batch queue is too large for a safe browser session. Remove files or split into smaller batches.");
      return;
    }
    setRunning(true);
    setPaused(false);
    setBatchError("");
    const controller = new AbortController();
    abortRef.current = controller;
    const startGen = useConversionStore.getState().cancelGeneration;
    setBatchActivity({ running: true, pendingCount: items.filter((i) => i.status === "pending").length });

    /* Serialize FFmpeg decode; one item in flight (encode pool is separate). */
    const batchConcurrency = 1;

    try {
      while (!controller.signal.aborted) {
        if (useConversionStore.getState().cancelGeneration !== startGen) break;
        if (pausedRef.current) break;

        const claimed: BatchQueueItem[] = [];
        await new Promise<void>((resolve) => {
          setItems((prev) => {
            let next = prev;
            for (let i = 0; i < batchConcurrency; i++) {
              const item = nextPendingItem(next);
              if (!item) break;
              claimed.push(item);
              next = patchItem(next, item.id, { status: "decoding", errorMessage: undefined });
            }
            resolve();
            return next;
          });
        });

        if (!claimed.length) break;

        setBatchActivity({
          running: true,
          currentName: claimed.map((c) => c.file.name).join(", "),
          pendingCount: Math.max(0, items.filter((i) => i.status === "pending").length - claimed.length),
        });

        await Promise.all(
          claimed.map(async (current) => {
            const id = current.id;
            const file = current.file;
            const meta = trackMetas[id];
            const itemSnapshot = {
              ...current,
              file,
              ...(batchAlbumMode && meta
                ? {
                    outputFilename: batchOutputFilenameForTrack(meta, album, file.name),
                    detectedTitle: meta.title,
                    detectedArtist: meta.artist,
                  }
                : {}),
            };
            const edits =
              batchAlbumMode && meta
                ? trackMetaToManualEdits(meta, album)
                : undefined;
            try {
              const result = await runBatchItemConversion(itemSnapshot, {
                signal: controller.signal,
                edits,
                onProgress: (patch) => {
                  if (useConversionStore.getState().cancelGeneration !== startGen) return;
                  setItems((prev) => patchItem(prev, id, patch));
                },
              });

              if (useConversionStore.getState().cancelGeneration !== startGen) {
                return;
              }

              let libraryPatch: Partial<BatchQueueItem> = {};
              if (result.status === "complete" && result.mp5 && result.outputFilename) {
                setBatchOutput(id, result.mp5);
                if (autoSaveLibrary) {
                  libraryPatch = await saveItemToLibrary({
                    ...itemSnapshot,
                    outputFilename: result.outputFilename,
                    outputBytes: result.outputBytes,
                    status: "complete",
                  });
                  if (useConversionStore.getState().cancelGeneration !== startGen) return;
                }
              }

              if (useConversionStore.getState().cancelGeneration !== startGen) return;

              setItems((prev) =>
                patchItem(prev, id, {
                  status: result.status,
                  detectedTitle: result.detectedTitle,
                  detectedArtist: result.detectedArtist,
                  outputFilename: result.outputFilename,
                  outputBytes: result.outputBytes,
                  errorMessage: result.errorMessage,
                  ...libraryPatch,
                }),
              );
            } catch (e) {
              if (e instanceof DOMException && e.name === "AbortError") throw e;
              if (useConversionStore.getState().cancelGeneration !== startGen) return;
              setItems((prev) =>
                patchItem(prev, id, {
                  status: "failed",
                  errorMessage: e instanceof Error ? e.message : String(e),
                }),
              );
            }
          }),
        );
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setBatchError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      setBatchActivity({ running: false, currentName: null, pendingCount: 0 });
    }
  }

  function handlePause() {
    setPaused(true);
  }

  function handleResume() {
    setPaused(false);
    if (!running) void handleStartBatch();
  }

  function handleCancel() {
    bumpCancelGeneration();
    abortRef.current?.abort();
    setRunning(false);
    setPaused(false);
    setItems((prev) => cancelInProgressItems(prev));
  }

  function handleClearCompleted() {
    setItems((prev) => clearCompletedItems(prev));
  }

  function handleRetryFailed() {
    setItems((prev) => retryFailedItems(prev));
  }

  function handleDownloadItem(item: BatchQueueItem) {
    const bytes = getBatchOutput(item.id) ?? item.mp5;
    if (!bytes || !item.outputFilename) return;
    downloadBlob(new Blob([new Uint8Array(bytes)], { type: "audio/mp5" }), item.outputFilename);
    deleteBatchOutput(item.id);
    setItems((prev) => [...prev]);
  }

  async function handleDownloadAll() {
    const done = items.filter(
      (i) => i.status === "complete" && i.outputFilename && (getBatchOutput(i.id) || i.mp5),
    );
    const names = dedupeExportFilenames(done.map((i) => i.outputFilename!));
    for (let i = 0; i < done.length; i++) {
      const item = done[i]!;
      const bytes = getBatchOutput(item.id) ?? item.mp5;
      if (!bytes) continue;
      downloadBlob(new Blob([new Uint8Array(bytes)], { type: "audio/mp5" }), names[i]!);
      deleteBatchOutput(item.id);
      if (i < done.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    setItems((prev) => [...prev]);
  }

  async function handleSaveAllToLibrary() {
    for (const item of items) {
      if (item.status !== "complete" || item.librarySaved) continue;
      if (!getBatchOutput(item.id) && !item.mp5) continue;
      const patch = await saveItemToLibrary(item);
      setItems((prev) => patchItem(prev, item.id, patch));
    }
  }

  async function handleSaveOne(item: BatchQueueItem) {
    const patch = await saveItemToLibrary(item);
    setItems((prev) => patchItem(prev, item.id, patch));
  }

  async function handleCopyErrorSummary() {
    const failed = items.filter((i) => i.status === "failed" || i.status === "cancelled");
    if (!failed.length) return;
    const lines = [
      "MP5 batch export — failed items",
      `App version: ${APP_VERSION}`,
      `Failed: ${failed.length} of ${items.length}`,
      "",
      ...failed.map((i) => `- ${i.sourceName}: ${i.errorMessage ?? "unknown error"}`),
      "",
      "Processed locally in-browser; no upload.",
    ];
    const text = redactLocalPaths(lines.join("\n"));
    try {
      await navigator.clipboard?.writeText(text);
      setBatchError("Error summary copied to clipboard.");
    } catch {
      setBatchError("Could not copy error summary.");
    }
  }

  return (
    <div className="space-y-5" data-testid="batch-converter-panel">
      <div className="mp5-card p-4 sm:p-5 space-y-3 border-accent/15">
        <h2 className="text-lg font-semibold text-white">Batch convert to MP5-L v4</h2>
        <p className="text-sm text-gray-400 leading-relaxed">
          Drop or select multiple source files. Each export uses{" "}
          <strong className="text-gray-300">MP5-L v4</strong> with detected metadata, waveform,
          seek data, and FING/HASH when possible. Edit metadata per file in{" "}
          <strong className="text-gray-300">Single file</strong> mode.
        </p>
      </div>

      <div
        className="text-xs text-amber-200/90 bg-amber-950/40 rounded-lg p-3 space-y-1"
        data-testid="batch-honesty-warning"
      >
        <p>
          <strong>Local browser conversion</strong> — files never upload to a server. Conversion is
          CPU- and memory-heavy; large batches can be slow. Closing this tab cancels active batch
          work.
        </p>
      </div>

      {loadState === "loading" && (
        <p className="text-xs text-gray-400 bg-surface-elevated rounded-lg p-2">Loading WASM codecs…</p>
      )}

      {codecUnavailable && (
        <p
          className="text-xs text-amber-200/90 bg-amber-950/40 rounded-lg p-2"
          data-testid="batch-codec-unavailable"
        >
          <strong>Batch requires WASM for MP5-L v4.</strong> Run{" "}
          <code className="text-accent">pnpm wasm:build</code> and refresh. Single-file mode still
          offers PCM reference export without WASM.
        </p>
      )}

      {codecReady && (
        <p className="text-xs text-green-400/90 bg-green-950/30 rounded-lg p-2" data-testid="batch-codec-ready">
          <strong>Batch default: MP5-L v4</strong> — lossless, bit-exact. MP5-C (lab) and MP5-H are not
          used in batch mode.
        </p>
      )}

      <SupportedSourcesNote />

      <label
        className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"
        data-testid="batch-album-mode-toggle"
      >
        <input
          type="checkbox"
          checked={batchAlbumMode}
          onChange={(e) => setBatchAlbumMode(e.target.checked)}
          disabled={running}
          className="rounded border-white/20"
        />
        Batch album export — metadata table and .mp5p packaging
      </label>

      {batchAlbumMode && (
        <BatchAlbumBuilderSection
          items={items}
          setItems={setItems}
          running={running}
          album={album}
          setAlbum={setAlbum}
          trackMetas={trackMetas}
          setTrackMetas={setTrackMetas}
          trackOrder={trackOrder}
          setTrackOrder={setTrackOrder}
        />
      )}

      <GuardrailNotice messages={queueGuardrails} testId="batch-queue-guardrails" />

      <FileDropZone
        accept="audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg,.opus"
        label="Drop or select multiple source files (WAV, FLAC, MP3, M4A, OGG…)"
        onFiles={handleAddFiles}
        disabled={running}
        testId="batch-file-input"
      />

      <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={autoSaveLibrary}
          onChange={(e) => setAutoSaveLibrary(e.target.checked)}
          disabled={running}
          className="rounded border-white/20"
          data-testid="batch-auto-save-library"
        />
        Auto-save successful exports to local library (skip duplicates via FING)
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleStartBatch()}
          disabled={!canStart}
          className="px-4 py-2 rounded-lg bg-accent text-black text-sm font-semibold disabled:opacity-40"
          data-testid="batch-start"
        >
          {running ? "Running…" : "Start batch"}
        </button>
        {running && !paused && (
          <button
            type="button"
            onClick={handlePause}
            className="px-4 py-2 rounded-lg bg-surface-elevated text-sm text-gray-200 border border-white/10"
            data-testid="batch-pause"
          >
            Pause after current
          </button>
        )}
        {paused && (
          <button
            type="button"
            onClick={handleResume}
            className="px-4 py-2 rounded-lg bg-surface-elevated text-sm text-gray-200 border border-white/10"
            data-testid="batch-resume"
          >
            Resume
          </button>
        )}
        {(running || paused) && (
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg bg-red-950/50 text-sm text-red-300 border border-red-500/30"
            data-testid="batch-cancel"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleClearCompleted}
          disabled={!hasCompletedItems(items) || running}
          className="px-4 py-2 rounded-lg bg-surface-elevated text-sm text-gray-300 border border-white/10 disabled:opacity-40"
          data-testid="batch-clear-completed"
        >
          Clear completed
        </button>
        <button
          type="button"
          onClick={handleRetryFailed}
          disabled={!hasRetryableItems(items) || running}
          className="px-4 py-2 rounded-lg bg-surface-elevated text-sm text-gray-300 border border-white/10 disabled:opacity-40"
          data-testid="batch-retry-failed"
        >
          Retry failed
        </button>
        <button
          type="button"
          onClick={() => void handleCopyErrorSummary()}
          disabled={!hasRetryableItems(items)}
          className="px-4 py-2 rounded-lg bg-surface-elevated text-sm text-gray-300 border border-white/10 disabled:opacity-40"
          data-testid="batch-copy-errors"
        >
          Copy error summary
        </button>
        <button
          type="button"
          onClick={() => void handleDownloadAll()}
          disabled={!hasCompletedItems(items)}
          className="px-4 py-2 rounded-lg bg-surface-elevated text-sm text-gray-300 border border-white/10 disabled:opacity-40"
          data-testid="batch-download-all"
        >
          Download all
        </button>
        <button
          type="button"
          onClick={() => void handleSaveAllToLibrary()}
          disabled={!hasCompletedItems(items) || running}
          className="px-4 py-2 rounded-lg bg-surface-elevated text-sm text-gray-300 border border-white/10 disabled:opacity-40"
          data-testid="batch-save-all-library"
        >
          Save all to library
        </button>
      </div>

      {items.length > 0 && (
        <div
          className="mp5-card p-4 space-y-2 text-sm"
          data-testid="batch-progress-summary"
        >
          <p className="font-medium text-gray-300">Progress</p>
          <ul className="text-gray-400 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <li>Total: {summary.total}</li>
            <li>Completed: {summary.completed}</li>
            <li>Failed: {summary.failed}</li>
            <li>Skipped: {summary.skipped}</li>
            <li>Pending: {summary.pending}</li>
            <li>In progress: {summary.inProgress}</li>
            <li>Output size: {formatBytes(summary.totalOutputBytes)}</li>
            <li>Library saves: {summary.librarySaves}</li>
            <li>Duplicates: {summary.libraryDuplicates}</li>
          </ul>
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-2" data-testid="batch-queue-list">
          {items.map((item) => (
            <li
              key={item.id}
              className="mp5-card p-3 space-y-1 text-sm"
              data-testid={`batch-queue-item-${item.id}`}
              data-batch-status={item.status}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-gray-200 truncate">{item.sourceName}</span>
                <span className={`text-xs uppercase tracking-wide ${statusClass(item.status)}`}>
                  {BATCH_ITEM_STATUS_LABELS[item.status]}
                </span>
              </div>
              {(item.detectedArtist || item.detectedTitle) && (
                <p className="text-xs text-gray-500">
                  {[item.detectedArtist, item.detectedTitle].filter(Boolean).join(" — ")}
                </p>
              )}
              {item.outputFilename && (
                <p className="text-xs text-gray-500">→ {item.outputFilename}</p>
              )}
              {item.outputBytes != null && item.status === "complete" && (
                <p className="text-xs text-gray-500">{formatBytes(item.outputBytes)}</p>
              )}
              {item.librarySaved && (
                <p className="text-xs text-green-400/80">Saved to library</p>
              )}
              {item.libraryDuplicate && (
                <p className="text-xs text-amber-300/80">Duplicate in library (FING / name+size)</p>
              )}
              {item.errorMessage && (
                <p className="text-xs text-red-400/90">{item.errorMessage}</p>
              )}
              {item.status === "complete" &&
                item.outputFilename &&
                (getBatchOutput(item.id) || item.mp5) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleDownloadItem(item)}
                    className="text-xs text-accent hover:underline"
                    data-testid={`batch-download-${item.id}`}
                  >
                    Download MP5
                  </button>
                  {!item.librarySaved && (
                    <button
                      type="button"
                      onClick={() => void handleSaveOne(item)}
                      className="text-xs text-gray-400 hover:underline"
                      data-testid={`batch-save-library-${item.id}`}
                    >
                      Save to library
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer text-gray-400">Batch limitations</summary>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          {BATCH_LIMITATIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      {batchError && (
        <p className="text-sm text-red-400" data-testid="batch-error">
          {batchError}
        </p>
      )}
    </div>
  );
}
