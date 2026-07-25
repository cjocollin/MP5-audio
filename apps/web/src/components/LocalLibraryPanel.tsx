import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { formatBytes } from "../converter/exportSummary";
import { FileDropZone } from "../player/FileDropZone";
import {
  addLibraryEntryToPlaylist,
  downloadEmbeddedAlbumPackage,
  downloadLibraryEntry,
  downloadManifestAlbumPackage,
  openEmbeddedAlbumFromLibrary,
  openManifestAlbumFromLibrary,
  importLibraryFile,
  playLibraryEntry,
  reopenRecentLibraryItem,
} from "../lib/localLibrary/libraryActions";
import { clearAllLibraryData, deleteLibraryEntry, loadLibraryEntry } from "../lib/localLibrary/api";
import { deleteSavedAlbum } from "../lib/localLibrary/albumLibrary";
import { deleteSavedEmbeddedAlbum } from "../lib/localLibrary/embeddedAlbumLibrary";
import { computeLibraryStorageStats } from "../lib/localLibrary/libraryStorageStats";
import { formatLibraryItemSummary } from "../lib/localLibrary/libraryItemSummary";
import { removeRecentLibraryEntry } from "../lib/localLibrary/recentLibrary";
import {
  filterAndSortUnifiedLibraryItems,
} from "../lib/localLibrary/unifiedLibrarySearch";
import { groupUnifiedLibraryItems, listUnifiedLibraryItems } from "../lib/localLibrary/unifiedLibrary";
import type {
  LibraryKindFilter,
  LibrarySortOption,
  UnifiedLibraryItem,
} from "../lib/localLibrary/unifiedLibraryTypes";
import { LibraryStorageError } from "../lib/localLibrary/errors";
import { isAlbumPackageFileName } from "../lib/album/createAlbumPackage";
import { isMp5FileName } from "../player/playlistUtils";
import { decodeCache } from "../player/decodeCache";
import { assessLibraryStorage, type GuardrailMessage } from "../lib/performance/guardrails";
import { GuardrailNotice } from "./GuardrailNotice";
import { USER_ERRORS } from "../lib/userFacingErrors";
import { LibraryCollectionCard } from "./LibraryCollectionCard";

const EMPTY_MESSAGE =
  "Save MP5 tracks and album packages to build a collection on this device. Nothing is uploaded.";

function confirmDeleteTrack(item: UnifiedLibraryItem): boolean {
  return window.confirm(
    `Remove "${item.title}" from your library? This deletes the browser-local saved copy only.`,
  );
}

function confirmDeleteManifestAlbum(item: UnifiedLibraryItem): boolean {
  return window.confirm(
    `Remove manifest album "${item.title}" from your library? Sidecar tracks stay saved unless you delete them separately.`,
  );
}

function confirmDeleteEmbeddedAlbum(item: UnifiedLibraryItem): boolean {
  return window.confirm(
    `Remove embedded album "${item.title}" and its saved package from this browser? Your original file on disk is not affected.`,
  );
}

function LibrarySection({
  title,
  items,
  testId,
  busy,
  renderActions,
}: {
  title: string;
  items: UnifiedLibraryItem[];
  testId: string;
  busy: boolean;
  renderActions: (item: UnifiedLibraryItem) => ComponentProps<typeof LibraryCollectionCard>["actions"];
}) {
  if (!items.length) return null;
  return (
    <section className="space-y-2" data-testid={testId}>
      <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <LibraryCollectionCard key={item.id} item={item} busy={busy} actions={renderActions(item)} />
        ))}
      </ul>
    </section>
  );
}

export function LocalLibraryPanel() {
  const [items, setItems] = useState<UnifiedLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [storageLine, setStorageLine] = useState("");
  const [storageStatsLine, setStorageStatsLine] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<LibraryKindFilter>("all");
  const [sort, setSort] = useState<LibrarySortOption>("added-desc");
  const [moodTag, setMoodTag] = useState("");
  const [vibeTag, setVibeTag] = useState("");
  const [storageGuardrails, setStorageGuardrails] = useState<GuardrailMessage[]>([]);

  const moodTagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const item of items) {
      for (const t of item.moodTags ?? []) tags.add(t);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const vibeTagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const item of items) {
      for (const t of item.vibeTags ?? []) tags.add(t);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(
    () => filterAndSortUnifiedLibraryItems(items, { query, kind, sort, moodTag, vibeTag }),
    [items, query, kind, sort, moodTag, vibeTag],
  );
  const grouped = useMemo(() => groupUnifiedLibraryItems(filtered), [filtered]);
  const savedCount = useMemo(
    () => items.filter((i) => i.source === "saved").length,
    [items],
  );
  const isEmpty = !loading && savedCount === 0 && grouped.recent.length === 0;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([listUnifiedLibraryItems(), computeLibraryStorageStats()]);
      setItems(list);
      setStorageStatsLine(
        `${stats.savedTrackCount} tracks · ${stats.savedManifestAlbumCount} manifest albums · ${stats.savedEmbeddedAlbumCount} embedded packages · ${formatBytes(stats.knownBytes)} known`,
      );
      if (stats.quotaSupported && stats.browserQuotaBytes != null) {
        const used = stats.browserUsedBytes ?? stats.knownBytes;
        setStorageLine(
          `Browser storage: ${formatBytes(used)} used of ${formatBytes(stats.browserQuotaBytes)} available.`,
        );
        setStorageGuardrails(assessLibraryStorage(used, stats.browserQuotaBytes));
      } else {
        setStorageLine(`App-managed library data: ${formatBytes(stats.knownBytes)}.`);
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
    const libraryFiles = Array.from(files).filter(
      (f) => isMp5FileName(f.name) || isAlbumPackageFileName(f.name),
    );
    if (!libraryFiles.length) {
      setError("No .mp5 or .mp5p files selected.");
      return;
    }
    setBusy(true);
    let saved = 0;
    let skipped = 0;
    let albums = 0;
    try {
      for (const file of libraryFiles) {
        const imported = await importLibraryFile(file);
        if (imported.kind === "track") {
          if (imported.result.status === "failed") {
            if (imported.result.errorCode === "quota") throw new LibraryStorageError(imported.result.message, "quota");
            throw new Error(imported.result.message);
          }
          if (imported.result.status === "duplicate") skipped += 1;
          else saved += 1;
        } else {
          albums += 1;
        }
      }
      await refresh();
      const parts: string[] = [];
      if (saved > 0) parts.push(`Saved ${saved} track${saved === 1 ? "" : "s"}`);
      if (albums > 0) parts.push(`saved ${albums} album package${albums === 1 ? "" : "s"}`);
      if (skipped > 0) parts.push(`${skipped} already in library`);
      setStatus(
        parts.length
          ? `${parts.join("; ")}.`
          : skipped
            ? "Those files are already in your library."
            : "",
      );
    } catch (e) {
      if (e instanceof LibraryStorageError && e.code === "quota") {
        setError(USER_ERRORS.libraryQuota);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    if (savedCount === 0) return;
    if (
      !window.confirm(
        "Clear all saved tracks, album packages, and recently opened entries from this browser? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    void clearAllLibraryData()
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
      .then(() => refresh())
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  const copySummary = async (item: UnifiedLibraryItem) => {
    const text = formatLibraryItemSummary(item);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied library summary.");
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const trackActions = (item: UnifiedLibraryItem) => ({
    onPlay: () => runAction(() => playLibraryEntry(item.trackRecordId!, { playFirst: true })),
    onQueue: () => runAction(() => addLibraryEntryToPlaylist(item.trackRecordId!)),
    onDownload: () =>
      runAction(async () => {
        const entry = await loadLibraryEntry(item.trackRecordId!);
        if (entry) downloadLibraryEntry(entry);
      }),
    onCopySummary: () => void copySummary(item),
    onDelete: () => {
      if (!confirmDeleteTrack(item)) return;
      runAction(async () => {
        await deleteLibraryEntry(item.trackRecordId!);
      });
    },
  });

  const albumActions = (item: UnifiedLibraryItem) => ({
    onOpenAlbum: () =>
      runAction(async () => {
        if (item.manifestAlbumId) await openManifestAlbumFromLibrary(item.manifestAlbumId);
        else if (item.embeddedAlbumId) await openEmbeddedAlbumFromLibrary(item.embeddedAlbumId);
      }),
    onPlay: () =>
      runAction(async () => {
        if (item.manifestAlbumId) await openManifestAlbumFromLibrary(item.manifestAlbumId);
        else if (item.embeddedAlbumId) await openEmbeddedAlbumFromLibrary(item.embeddedAlbumId);
      }),
    onDownload: () =>
      runAction(async () => {
        if (item.manifestAlbumId) await downloadManifestAlbumPackage(item.manifestAlbumId);
        else if (item.embeddedAlbumId) await downloadEmbeddedAlbumPackage(item.embeddedAlbumId);
      }),
    onCopySummary: () => void copySummary(item),
    onDelete: () => {
      const ok =
        item.packageType === "embedded"
          ? confirmDeleteEmbeddedAlbum(item)
          : confirmDeleteManifestAlbum(item);
      if (!ok) return;
      runAction(async () => {
        if (item.manifestAlbumId) deleteSavedAlbum(item.manifestAlbumId);
        else if (item.embeddedAlbumId) deleteSavedEmbeddedAlbum(item.embeddedAlbumId);
      });
    },
  });

  const recentActions = (item: UnifiedLibraryItem) => ({
    onReopen: () => runAction(() => reopenRecentLibraryItem(item)),
    onRemoveRecent: () => {
      if (!item.recentId) return;
      removeRecentLibraryEntry(item.recentId);
      void refresh();
    },
  });

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
          <p>Files are stored locally in this browser only. MP5 does not upload your audio.</p>
          <p>Clearing site data or browser storage may delete saved MP5 files and packages.</p>
          <p>Large embedded .mp5p packages can use significant space — keep originals backed up.</p>
          <p>MP5 does not verify rights ownership. Avoid saving private files on shared devices.</p>
          {storageLine && <p className="text-gray-400 pt-1">{storageLine}</p>}
          {storageStatsLine && (
            <p className="text-gray-400" data-testid="library-storage-stats">
              {storageStatsLine}
            </p>
          )}
          <GuardrailNotice messages={storageGuardrails} testId="library-storage-guardrails" />
        </div>
      </div>

      <FileDropZone
        accept=".mp5,.mp5p,audio/mp5"
        label="Add .mp5 tracks or .mp5p album packages to library"
        onFiles={(files) => void handleImport(files)}
        disabled={busy}
        testId="local-library-file-input"
      />

      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, artist, album, filename…"
          className="flex-1 min-w-[200px] bg-surface rounded-lg px-3 py-2 text-sm text-gray-200 border border-white/5"
          data-testid="local-library-search"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as LibraryKindFilter)}
          className="bg-surface rounded-lg px-2 py-2 text-xs border border-white/5 min-h-[40px]"
          aria-label="Library kind filter"
          data-testid="library-kind-filter"
        >
          <option value="all">All items</option>
          <option value="tracks">Tracks</option>
          <option value="albums">Albums</option>
          <option value="embedded">Embedded packages</option>
          <option value="manifest">Manifest albums</option>
          <option value="recent">Recently opened</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as LibrarySortOption)}
          className="bg-surface rounded-lg px-2 py-2 text-xs border border-white/5 min-h-[40px]"
          aria-label="Library sort"
          data-testid="library-sort"
        >
          <option value="added-desc">Recently added</option>
          <option value="opened-desc">Recently opened</option>
          <option value="title-asc">Title A–Z</option>
          <option value="artist-asc">Artist A–Z</option>
          <option value="size-desc">Largest size</option>
          <option value="duration-desc">Longest duration</option>
        </select>
        <select
          value={moodTag}
          onChange={(e) => setMoodTag(e.target.value)}
          className="bg-surface rounded-lg px-2 py-2 text-xs border border-white/5 min-h-[40px]"
          aria-label="Mood tag filter"
          data-testid="library-mood-filter"
        >
          <option value="">All moods</option>
          {moodTagOptions.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <select
          value={vibeTag}
          onChange={(e) => setVibeTag(e.target.value)}
          className="bg-surface rounded-lg px-2 py-2 text-xs border border-white/5 min-h-[40px]"
          aria-label="Vibe tag filter"
          data-testid="library-vibe-filter"
        >
          <option value="">All vibes</option>
          {vibeTagOptions.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-400">
          {loading ? "Loading…" : `${filtered.length} shown · ${savedCount} saved`}
        </p>
        {savedCount > 0 && (
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

      {isEmpty ? (
        <div className="py-8 text-center text-sm text-gray-500" data-testid="local-library-empty">
          {EMPTY_MESSAGE}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-6 text-center" data-testid="local-library-no-matches">
          No matching items.
        </p>
      ) : (
        <div className="space-y-5 max-h-[32rem] overflow-y-auto" data-testid="local-library-list">
          <LibrarySection
            title="Recently opened"
            items={grouped.recent}
            testId="library-section-recent"
            busy={busy}
            renderActions={recentActions}
          />
          <LibrarySection
            title="Saved tracks"
            items={grouped.tracks}
            testId="library-section-tracks"
            busy={busy}
            renderActions={trackActions}
          />
          <LibrarySection
            title="Saved albums"
            items={grouped.albums}
            testId="library-section-albums"
            busy={busy}
            renderActions={albumActions}
          />
        </div>
      )}
    </div>
  );
}
