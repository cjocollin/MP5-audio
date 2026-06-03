import { useEffect, useMemo, useState } from "react";
import type { BatchQueueItem } from "../converter/batchTypes";
import type { ManualMetadataEdits } from "../converter/manualMetadata";
import { extractSourceMetadata } from "../converter/extractSourceMetadata";
import { formatBytes } from "../converter/exportSummary";
import {
  applyAlbumMetaToTracks,
  BATCH_ALBUM_LIMITATIONS,
  completedBatchItems,
  emptyAlbumMeta,
  initTrackMetaFromSource,
  moveInOrder,
  sortItemIdsByFilename,
  sortItemIdsByTrackNumber,
  suggestAlbumMetaFromBatch,
  trackMetaToManualEdits,
  type BatchAlbumLevelMeta,
  type BatchTrackAlbumMeta,
} from "../lib/album/batchAlbumMetadata";
import {
  computeBatchAlbumPreview,
  coverArtFromFile,
  exportBatchAlbumPackage,
  batchItemsToPlaylistTracks,
  syncBatchOutputFilenames,
} from "../lib/album/buildAlbumFromBatchItems";
import { usePlayerStore } from "../store/playerStore";

interface Props {
  items: BatchQueueItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchQueueItem[]>>;
  running: boolean;
  album: BatchAlbumLevelMeta;
  setAlbum: React.Dispatch<React.SetStateAction<BatchAlbumLevelMeta>>;
  trackMetas: Record<string, BatchTrackAlbumMeta>;
  setTrackMetas: React.Dispatch<React.SetStateAction<Record<string, BatchTrackAlbumMeta>>>;
  trackOrder: string[];
  setTrackOrder: React.Dispatch<React.SetStateAction<string[]>>;
}

export function BatchAlbumBuilderSection({
  items,
  setItems,
  running,
  album,
  setAlbum,
  trackMetas,
  setTrackMetas,
  trackOrder,
  setTrackOrder,
}: Props) {
  const [exportBusy, setExportBusy] = useState(false);
  const [exportNote, setExportNote] = useState("");
  const { appendTracks, setActiveTab, setCurrentIndex } = usePlayerStore();

  const queueIds = useMemo(
    () => items.filter((i) => i.status !== "skipped").map((i) => i.id),
    [items],
  );

  useEffect(() => {
    setTrackOrder((prev) => {
      const kept = prev.filter((id) => queueIds.includes(id));
      const added = queueIds.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [queueIds.join(",")]);

  useEffect(() => {
    const pending = items.filter((i) => i.status === "pending" && !trackMetas[i.id]);
    if (!pending.length) return;
    let cancelled = false;
    void (async () => {
      const updates: Record<string, BatchTrackAlbumMeta> = {};
      for (const item of pending) {
        const extracted = await extractSourceMetadata(item.file).catch(() => undefined);
        if (cancelled) return;
        updates[item.id] = initTrackMetaFromSource(item, extracted, album);
      }
      if (cancelled) return;
      setTrackMetas((prev) => {
        const merged = { ...prev, ...updates };
        const metas = Object.values(merged);
        if (!album.title.trim() && metas.length) {
          const suggested = suggestAlbumMetaFromBatch(
            metas,
            items.map((i) => i.file),
          );
          setAlbum((a) => ({
            ...a,
            title: a.title || suggested.title,
            artist: a.artist || suggested.artist,
            albumArtist: a.albumArtist || suggested.albumArtist,
            year: a.year || suggested.year,
            genre: a.genre || suggested.genre,
          }));
        }
        return merged;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [items, album.title, album.artist, album.albumArtist, album.year, album.genre]);

  const preview = useMemo(
    () => computeBatchAlbumPreview(items, trackOrder, album, trackMetas),
    [items, trackOrder, album, trackMetas],
  );

  const doneCount = completedBatchItems(items).length;
  const canExportAlbum =
    !running &&
    !exportBusy &&
    album.exportTarget !== "individual" &&
    doneCount >= 2 &&
    !preview.warnings.some((w) => w.includes("need at least two"));

  function updateTrack(id: string, patch: Partial<BatchTrackAlbumMeta>) {
    setTrackMetas((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  }

  function handleAlbumField<K extends keyof BatchAlbumLevelMeta>(
    key: K,
    value: BatchAlbumLevelMeta[K],
  ) {
    setAlbum((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "title" || key === "artist" || key === "albumArtist" || key === "genre" || key === "year") {
        setTrackMetas((tm) => applyAlbumMetaToTracks(tm, next));
      }
      return next;
    });
  }

  async function handleAlbumCover(file: File | undefined) {
    if (!file) {
      setAlbum((a) => ({ ...a, cover: undefined }));
      return;
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const cover = coverArtFromFile(file, buf);
    setAlbum((a) => ({ ...a, cover, useAlbumCoverForAll: true }));
  }

  function applySort(by: "filename" | "track") {
    setTrackOrder((order) =>
      by === "filename"
        ? sortItemIdsByFilename(items, order)
        : sortItemIdsByTrackNumber(items, order, trackMetas),
    );
  }

  async function handleExport() {
    setExportBusy(true);
    setExportNote("");
    try {
      if (album.exportTarget === "embedded") {
        const mb = preview.estimatedEmbeddedBytes / (1024 * 1024);
        if (mb > 50) {
          const ok = window.confirm(
            `Embedded album package is about ${mb.toFixed(0)} MB. This may be slow to build and download. Continue?`,
          );
          if (!ok) return;
        }
      }
      const synced = syncBatchOutputFilenames(items, trackMetas, album);
      setItems(synced);
      const result = await exportBatchAlbumPackage(synced, trackOrder, album, trackMetas);
      if (!result.ok) {
        setExportNote(result.message ?? "Export failed.");
      } else if (album.exportTarget === "manifest") {
        setExportNote("Downloaded manifest .mp5p and sidecar .mp5 files (staggered). Keep them together.");
      } else if (album.exportTarget === "embedded") {
        setExportNote("Downloaded self-contained embedded .mp5p.");
      } else {
        setExportNote("Downloaded individual MP5 files.");
      }
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleOpenInPlayer() {
    const done = completedBatchItems(items);
    const tracks = batchItemsToPlaylistTracks(done, trackOrder);
    if (!tracks.length) {
      setExportNote("No completed tracks to open.");
      return;
    }
    appendTracks(tracks);
    setCurrentIndex(0);
    setActiveTab("player");
    setExportNote(`Added ${tracks.length} track(s) to the player playlist.`);
  }

  return (
    <div
      className="mp5-card p-4 space-y-4 border-accent/20"
      data-testid="batch-album-builder"
    >
      <div>
        <p className="text-sm font-medium text-gray-200">Batch album export</p>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Import multiple sources, edit album and track metadata, then export as individual MP5
          files, a manifest <span className="font-mono">.mp5p</span>, or one embedded{" "}
          <span className="font-mono">.mp5p</span>.
        </p>
      </div>

      <fieldset className="space-y-2 text-xs" data-testid="batch-album-export-target">
        <legend className="text-gray-500 font-medium mb-1">Export as</legend>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="batch-album-target"
            checked={album.exportTarget === "individual"}
            onChange={() => handleAlbumField("exportTarget", "individual")}
            data-testid="batch-album-target-individual"
          />
          <span>
            <strong className="text-gray-300">Individual MP5 files</strong> — one download per track
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="batch-album-target"
            checked={album.exportTarget === "manifest"}
            onChange={() => handleAlbumField("exportTarget", "manifest")}
            data-testid="batch-album-target-manifest"
          />
          <span>
            <strong className="text-gray-300">Manifest album package</strong> — small JSON{" "}
            <span className="font-mono">.mp5p</span> plus sidecar <span className="font-mono">.mp5</span>{" "}
            files
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="batch-album-target"
            checked={album.exportTarget === "embedded"}
            onChange={() => handleAlbumField("exportTarget", "embedded")}
            data-testid="batch-album-target-embedded"
          />
          <span>
            <strong className="text-gray-300">Embedded album package</strong> — one self-contained{" "}
            <span className="font-mono">.mp5p</span> (can be very large)
          </span>
        </label>
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-2">
        <label className="block text-xs sm:col-span-2">
          <span className="text-gray-500">Album title</span>
          <input
            value={album.title}
            onChange={(e) => handleAlbumField("title", e.target.value)}
            className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
            data-testid="batch-album-title"
          />
        </label>
        <label className="block text-xs">
          <span className="text-gray-500">Album artist</span>
          <input
            value={album.artist}
            onChange={(e) => handleAlbumField("artist", e.target.value)}
            className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
            data-testid="batch-album-artist"
          />
        </label>
        <label className="block text-xs">
          <span className="text-gray-500">Album artist (album)</span>
          <input
            value={album.albumArtist}
            onChange={(e) => handleAlbumField("albumArtist", e.target.value)}
            className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
            data-testid="batch-album-album-artist"
          />
        </label>
        <label className="block text-xs">
          <span className="text-gray-500">Year</span>
          <input
            value={album.year}
            onChange={(e) => handleAlbumField("year", e.target.value)}
            className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
            data-testid="batch-album-year"
          />
        </label>
        <label className="block text-xs">
          <span className="text-gray-500">Genre</span>
          <input
            value={album.genre}
            onChange={(e) => handleAlbumField("genre", e.target.value)}
            className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
            data-testid="batch-album-genre"
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-gray-500">Album cover (optional)</span>
          <input
            type="file"
            accept="image/*"
            className="mt-0.5 w-full text-xs text-gray-400"
            onChange={(e) => void handleAlbumCover(e.target.files?.[0])}
            data-testid="batch-album-cover-input"
          />
        </label>
        <label className="flex items-center gap-2 text-xs sm:col-span-2 cursor-pointer">
          <input
            type="checkbox"
            checked={album.useAlbumCoverForAll}
            onChange={(e) => handleAlbumField("useAlbumCoverForAll", e.target.checked)}
            data-testid="batch-album-cover-inherit"
          />
          Apply album cover to tracks that inherit cover
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-gray-200"
          onClick={() => applySort("filename")}
          data-testid="batch-album-sort-filename"
        >
          Sort by filename
        </button>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-gray-200"
          onClick={() => applySort("track")}
          data-testid="batch-album-sort-track"
        >
          Sort by track #
        </button>
      </div>

      {trackOrder.length > 0 && (
        <div className="overflow-x-auto" data-testid="batch-album-track-table">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-gray-500 text-left border-b border-white/10">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Source</th>
                <th className="py-1 pr-2">Title</th>
                <th className="py-1 pr-2">Artist</th>
                <th className="py-1 pr-2">Trk</th>
                <th className="py-1 pr-2">Disc</th>
                <th className="py-1">Order</th>
              </tr>
            </thead>
            <tbody>
              {trackOrder.map((id, index) => {
                const item = items.find((i) => i.id === id);
                const meta = trackMetas[id];
                if (!item || !meta) return null;
                return (
                  <tr
                    key={id}
                    className="border-b border-white/5"
                    data-testid="batch-album-track-row"
                  >
                    <td className="py-1 pr-2 text-gray-600">{index + 1}</td>
                    <td className="py-1 pr-2 text-gray-500 max-w-[8rem] truncate">{item.sourceName}</td>
                    <td className="py-1 pr-2">
                      <input
                        value={meta.title}
                        onChange={(e) => updateTrack(id, { title: e.target.value })}
                        className="w-full min-w-[6rem] bg-surface rounded px-1 py-0.5 border border-white/5"
                        data-testid={`batch-album-track-title-${index}`}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        value={meta.artist}
                        onChange={(e) => updateTrack(id, { artist: e.target.value })}
                        className="w-full min-w-[5rem] bg-surface rounded px-1 py-0.5 border border-white/5"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        value={meta.trackNumber}
                        onChange={(e) => updateTrack(id, { trackNumber: e.target.value })}
                        className="w-10 bg-surface rounded px-1 py-0.5 border border-white/5"
                        data-testid={`batch-album-track-num-${index}`}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        value={meta.discNumber}
                        onChange={(e) => updateTrack(id, { discNumber: e.target.value })}
                        className="w-10 bg-surface rounded px-1 py-0.5 border border-white/5"
                      />
                    </td>
                    <td className="py-1 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => setTrackOrder((o) => moveInOrder(o, index, -1))}
                        data-testid={`batch-album-move-up-${index}`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-30"
                        disabled={index === trackOrder.length - 1}
                        onClick={() => setTrackOrder((o) => moveInOrder(o, index, 1))}
                        data-testid={`batch-album-move-down-${index}`}
                      >
                        ▼
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div
        className="rounded-lg border border-white/5 bg-surface/30 px-3 py-2 text-xs space-y-1"
        data-testid="batch-album-preview"
      >
        <p className="text-gray-400 font-medium">Package preview</p>
        <p>
          Type: <span data-testid="batch-album-preview-type">{album.exportTarget}</span> · Tracks:{" "}
          {preview.trackCount} completed / {doneCount} · Size: {formatBytes(preview.totalBytes)}
          {album.exportTarget === "embedded" && (
            <> · Est. embedded: {formatBytes(preview.estimatedEmbeddedBytes)}</>
          )}
        </p>
        <p className="text-gray-500">
          Cover: {preview.features.withCover} · Lyrics: {preview.features.withLyrics} · Stems:{" "}
          {preview.features.withStems} · VISU: {preview.features.withVisu}
        </p>
        {preview.warnings.length > 0 && (
          <ul className="text-amber-200/80 list-disc pl-4" data-testid="batch-album-warnings">
            {preview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="mp5-btn-primary text-sm"
          disabled={
            exportBusy ||
            running ||
            (album.exportTarget === "individual"
              ? doneCount < 1
              : !canExportAlbum)
          }
          onClick={() => void handleExport()}
          data-testid={
            album.exportTarget === "embedded"
              ? "batch-album-export-embedded"
              : album.exportTarget === "manifest"
                ? "batch-album-export-manifest"
                : "batch-album-export"
          }
        >
          {exportBusy
            ? "Exporting…"
            : album.exportTarget === "embedded"
              ? "Download embedded .mp5p"
              : album.exportTarget === "manifest"
                ? "Download manifest + MP5s"
                : "Download all MP5s"}
        </button>
        <button
          type="button"
          className="mp5-btn-secondary text-sm"
          disabled={running || doneCount < 1}
          onClick={() => void handleOpenInPlayer()}
          data-testid="batch-album-open-player"
        >
          Open in Player
        </button>
      </div>

      {exportNote && (
        <p className="text-xs text-gray-400" data-testid="batch-album-export-note">
          {exportNote}
        </p>
      )}

      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer text-gray-400">Batch album limitations</summary>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          {BATCH_ALBUM_LIMITATIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// Re-export for parent getEditsForItem wiring
export { trackMetaToManualEdits };
