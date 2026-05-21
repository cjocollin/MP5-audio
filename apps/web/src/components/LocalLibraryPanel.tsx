import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBytes } from "../converter/exportSummary";
import { FileDropZone } from "../player/FileDropZone";
import { formatDuration } from "../player/playlistUtils";
import {
  addLibraryEntryToPlaylist,
  downloadLibraryEntry,
  playLibraryEntry,
  saveFileToLibrary,
} from "../lib/localLibrary/libraryActions";
import {
  clearLocalLibrary,
  deleteLibraryEntry,
  getLibraryStorageInfo,
  listLibraryRecords,
  loadLibraryEntry,
} from "../lib/localLibrary/api";
import { LibraryStorageError } from "../lib/localLibrary/errors";
import { filterLibraryRecords } from "../lib/localLibrary/search";
import type { LibraryCodecFilter, LibrarySearchFilters, LocalLibraryRecord } from "../lib/localLibrary/types";
import { isMp5FileName } from "../player/playlistUtils";
import { SavedAlbumsPanel } from "./SavedAlbumsPanel";
import { decodeCache } from "../player/decodeCache";
import { assessLibraryStorage, type GuardrailMessage } from "../lib/performance/guardrails";
import { GuardrailNotice } from "./GuardrailNotice";

const EMPTY_MESSAGE =
  "Save MP5 files to your local library so you can play them again later on this device.";

function useCoverThumbUrl(record: LocalLibraryRecord): string | undefined {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    if (!record.coverThumbnail?.length) {
      setUrl(undefined);
      return;
    }
    const mime = record.coverMime ?? "image/jpeg";
    const blob = new Blob([new Uint8Array(record.coverThumbnail)], { type: mime });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [record.id, record.coverThumbnail, record.coverMime]);
  return url;
}

function LibraryRow({
  record,
  onPlay,
  onAdd,
  onDownload,
  onDelete,
  busy,
}: {
  record: LocalLibraryRecord;
  onPlay: () => void;
  onAdd: () => void;
  onDownload: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const coverUrl = useCoverThumbUrl(record);
  const s = record.summary;
  const unreadable = !!s.parseError;

  return (
    <li
      className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${
        unreadable ? "border-red-900/30 bg-red-950/10" : "border-white/5 bg-surface/40"
      }`}
      data-testid="local-library-item"
      data-library-id={record.id}
    >
      <span className="relative w-12 h-12 shrink-0 rounded-md bg-surface-elevated overflow-hidden flex items-center justify-center">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm opacity-40">♪</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-100 truncate" data-testid="local-library-title">
          {s.title || "Untitled"}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {s.artist || "Unknown artist"}
          {s.album ? ` · ${s.album}` : ""}
        </p>
        <p className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] text-gray-600">
          <span className="font-semibold text-accent/90">{s.codecLabel}</span>
          <span className="font-mono">{formatDuration(s.durationSec)}</span>
          <span>{formatBytes(record.fileSize)}</span>
          <span>{new Date(record.importedAt).toLocaleDateString()}</span>
          {s.hasContentGuidance && (
            <span
              className="px-1.5 py-0 rounded bg-gray-800 text-gray-400 border border-gray-700"
              data-testid="local-library-guidance-badge"
            >
              Content
            </span>
          )}
          {s.hasStems && (
            <span
              className="px-1.5 py-0 rounded bg-purple-900/40 text-purple-200/90 border border-purple-800/40"
              data-testid="local-library-stems-badge"
            >
              Stems{s.stemCount > 0 ? ` (${s.stemCount})` : ""}
            </span>
          )}
          {unreadable && (
            <span className="text-red-300/90" data-testid="local-library-unreadable">
              Unreadable
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-1 shrink-0">
        <button
          type="button"
          className="px-2 py-1 rounded text-xs border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40"
          onClick={onPlay}
          disabled={busy || unreadable}
          data-testid="local-library-play"
        >
          Play
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded text-xs border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-40"
          onClick={onAdd}
          disabled={busy || unreadable}
          data-testid="local-library-add-playlist"
        >
          Queue
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded text-xs border border-white/10 text-gray-400 hover:bg-white/5 disabled:opacity-40"
          onClick={onDownload}
          disabled={busy}
          data-testid="local-library-download"
        >
          Download
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded text-xs text-gray-500 hover:text-red-300 disabled:opacity-40"
          onClick={onDelete}
          disabled={busy}
          aria-label="Remove from library"
          data-testid="local-library-delete"
        >
          ✕
        </button>
      </div>
    </li>
  );
}

export function LocalLibraryPanel() {
  const [records, setRecords] = useState<LocalLibraryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [storageLine, setStorageLine] = useState("");
  const [query, setQuery] = useState("");
  const [codec, setCodec] = useState<LibraryCodecFilter>("all");
  const [contentGuidanceOnly, setContentGuidanceOnly] = useState(false);
  const [hasCoverOnly, setHasCoverOnly] = useState(false);
  const [hasLyricsOnly, setHasLyricsOnly] = useState(false);
  const [storageGuardrails, setStorageGuardrails] = useState<GuardrailMessage[]>([]);

  const filters: LibrarySearchFilters = useMemo(
    () => ({ query, codec, contentGuidanceOnly, hasCoverOnly, hasLyricsOnly }),
    [query, codec, contentGuidanceOnly, hasCoverOnly, hasLyricsOnly],
  );

  const filtered = useMemo(() => filterLibraryRecords(records, filters), [records, filters]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, storage] = await Promise.all([listLibraryRecords(), getLibraryStorageInfo()]);
      setRecords(list);
      if (storage.usageSupported && storage.quotaBytes != null) {
        setStorageLine(
          `Storage: ${formatBytes(storage.usedBytes)} used of ${formatBytes(storage.quotaBytes)} available on this device.`,
        );
        setStorageGuardrails(assessLibraryStorage(storage.usedBytes, storage.quotaBytes));
      } else {
        setStorageLine(`Library size on this device: ${formatBytes(storage.usedBytes)}.`);
        setStorageGuardrails([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleImport = async (files: FileList) => {
    setError("");
    setStatus("");
    const mp5Files = Array.from(files).filter((f) => isMp5FileName(f.name));
    if (!mp5Files.length) {
      setError("No .mp5 files selected.");
      return;
    }
    setBusy(true);
    let saved = 0;
    let skipped = 0;
    try {
      for (const file of mp5Files) {
        const result = await saveFileToLibrary(file);
        if (result.duplicate) skipped += 1;
        else saved += 1;
      }
      await refresh();
      setStatus(
        saved > 0
          ? `Saved ${saved} file${saved === 1 ? "" : "s"} to library.${skipped ? ` ${skipped} already saved.` : ""}`
          : skipped
            ? "Those files are already in your library."
            : "",
      );
    } catch (e) {
      if (e instanceof LibraryStorageError && e.code === "quota") {
        setError("Not enough browser storage to save. Remove older library items or free disk space.");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    if (!records.length) return;
    if (
      !window.confirm(
        "Clear all saved MP5 files from this library? Saved album manifests in this browser will remain until you remove them separately. This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    void clearLocalLibrary()
      .then(() => {
        decodeCache.clear();
      })
      .then(() => refresh())
      .then(() => setStatus("Library cleared."))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  const runAction = (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    fn()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-5" data-testid="local-library-panel">
      <div className="mp5-card p-4 sm:p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">Local Library</h2>
        <p className="text-sm text-gray-400 leading-relaxed" data-testid="local-library-intro">
          {EMPTY_MESSAGE}
        </p>
        <div
          className="text-xs text-gray-500 space-y-1 leading-relaxed border border-white/5 rounded-lg p-3 bg-surface/50"
          data-testid="local-library-storage-honesty"
        >
          <p>Library is stored locally on this device and browser profile.</p>
          <p>Clearing browser data may remove saved MP5 files.</p>
          <p>Large audio files can use significant storage.</p>
          <p>No files are uploaded to a server.</p>
          {storageLine && <p className="text-gray-400 pt-1">{storageLine}</p>}
          <GuardrailNotice messages={storageGuardrails} testId="library-storage-guardrails" />
        </div>
      </div>

      <FileDropZone
        accept=".mp5,audio/*"
        label="Add .mp5 files to library"
        onFiles={(files) => void handleImport(files)}
        disabled={busy}
        testId="local-library-file-input"
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, artist, album, filename, genre, mood, vibe…"
          className="flex-1 min-w-[200px] bg-surface rounded-lg px-3 py-2 text-sm text-gray-200 border border-white/5"
          data-testid="local-library-search"
        />
        <select
          value={codec}
          onChange={(e) => setCodec(e.target.value as LibraryCodecFilter)}
          className="bg-surface rounded-lg px-2 py-2 text-xs border border-white/5"
          aria-label="Codec filter"
          data-testid="local-library-codec-filter"
        >
          <option value="all">All codecs</option>
          <option value="mp5l">MP5-L</option>
          <option value="mp5c">MP5-C</option>
          <option value="mp5h">MP5-H</option>
          <option value="pcm">PCM</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={contentGuidanceOnly}
            onChange={(e) => setContentGuidanceOnly(e.target.checked)}
            data-testid="local-library-filter-guidance"
          />
          Content guidance
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={hasCoverOnly}
            onChange={(e) => setHasCoverOnly(e.target.checked)}
            data-testid="local-library-filter-cover"
          />
          Has cover
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={hasLyricsOnly}
            onChange={(e) => setHasLyricsOnly(e.target.checked)}
            data-testid="local-library-filter-lyrics"
          />
          Has lyrics
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-400">
          {loading ? "Loading…" : `${filtered.length} of ${records.length} saved`}
        </p>
        {records.length > 0 && (
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-red-300"
            onClick={handleClear}
            disabled={busy}
            data-testid="local-library-clear"
          >
            Clear library
          </button>
        )}
      </div>

      {status && (
        <p className="text-sm text-green-400/90" data-testid="local-library-status">
          {status}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-400" data-testid="local-library-error">
          {error}
        </p>
      )}

      {!loading && records.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500" data-testid="local-library-empty">
          {EMPTY_MESSAGE}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-6 text-center" data-testid="local-library-no-matches">
          No matching tracks.
        </p>
      ) : (
        <ul className="space-y-2 max-h-[28rem] overflow-y-auto" data-testid="local-library-list">
          {filtered.map((record) => (
            <LibraryRow
              key={record.id}
              record={record}
              busy={busy}
              onPlay={() => runAction(() => playLibraryEntry(record.id, { playFirst: true }))}
              onAdd={() => runAction(() => addLibraryEntryToPlaylist(record.id))}
              onDownload={() =>
                runAction(async () => {
                  const entry = await loadLibraryEntry(record.id);
                  if (entry) downloadLibraryEntry(entry);
                })
              }
              onDelete={() =>
                runAction(async () => {
                  await deleteLibraryEntry(record.id);
                  await refresh();
                })
              }
            />
          ))}
        </ul>
      )}

      <div className="mp5-card p-4">
        <SavedAlbumsPanel />
      </div>
    </div>
  );
}
