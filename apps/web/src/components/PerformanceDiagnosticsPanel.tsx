import { useEffect, useState } from "react";
import { formatBytes } from "../converter/exportSummary";
import { decodeCache, DECODE_CACHE_MAX_ENTRIES } from "../player/decodeCache";
import { getCodecLoadState } from "../wasm/codec";
import { getFfmpegLoadState } from "../converter/ffmpegLoader";
import { getLibraryStorageInfo, listLibraryRecords } from "../lib/localLibrary/api";
import { formatMemoryEstimate } from "../lib/performance/memoryEstimates";
import { getIngestDiagnostics } from "../lib/ingest/ingestDiagnostics";
import { activeConversionLabel, useConversionStore } from "../store/conversionStore";
import { usePlayerStore } from "../store/playerStore";

export function PerformanceDiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [libraryBytes, setLibraryBytes] = useState(0);
  const [libraryQuota, setLibraryQuota] = useState<number | null>(null);
  const [libraryCount, setLibraryCount] = useState(0);
  const conversion = useConversionStore();
  const tracks = usePlayerStore((s) => s.tracks);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const currentTrack = tracks[currentIndex];

  useEffect(() => {
    if (!open) return;
    const refresh = async () => {
      try {
        const [storage, records] = await Promise.all([
          getLibraryStorageInfo(),
          listLibraryRecords(),
        ]);
        setLibraryBytes(storage.usedBytes);
        setLibraryQuota(storage.quotaBytes);
        setLibraryCount(records.length);
      } catch {
        /* diagnostics are best-effort */
      }
    };
    void refresh();
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [open]);

  const ingest = getIngestDiagnostics();
  const cacheStats = decodeCache.getStats(currentTrack?.id);
  const wasmState = getCodecLoadState();
  const ffmpegState = getFfmpegLoadState();

  return (
    <details
      className="rounded-lg border border-white/5 bg-surface/40"
      data-testid="performance-diagnostics"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer px-3 py-2 text-sm text-gray-400 hover:text-gray-300">
        Diagnostics (optional)
      </summary>
      <div className="px-3 pb-3 pt-1 text-xs text-gray-500 space-y-2 font-mono leading-relaxed">
        <p>
          <span className="text-gray-600">Playlist queue:</span> {tracks.length} track
          {tracks.length === 1 ? "" : "s"}
        </p>
        <p>
          <span className="text-gray-600">Decode cache:</span> {cacheStats.entryCount} /{" "}
          {DECODE_CACHE_MAX_ENTRIES} · ~{formatMemoryEstimate(cacheStats.estimatedBytes)}
        </p>
        <p>
          <span className="text-gray-600">Library:</span> {libraryCount} entries ·{" "}
          {formatBytes(libraryBytes)}
          {libraryQuota != null ? ` / ${formatBytes(libraryQuota)}` : ""}
        </p>
        <p>
          <span className="text-gray-600">Current file:</span>{" "}
          {currentTrack?.file?.size != null
            ? formatBytes(currentTrack.file.size)
            : currentTrack?.name ?? "—"}
        </p>
        <p>
          <span className="text-gray-600">Ingest mode:</span> {ingest.ingestMode}
        </p>
        <p>
          <span className="text-gray-600">Chunks indexed:</span> {ingest.chunkCount} · STDF indexed{" "}
          {ingest.stdfIndexed} · STDF loaded {ingest.stdfLoaded}
        </p>
        <p>
          <span className="text-gray-600">Loaded binary (est.):</span>{" "}
          {ingest.loadedBinaryMb.toFixed(2)} MB · AUDI loaded:{" "}
          {ingest.audiLoaded ? "yes" : "no"}
        </p>
        <p>
          <span className="text-gray-600">Integrity:</span> {ingest.integrityStatus}
          {ingest.scanMs != null ? ` · scan ${ingest.scanMs}ms` : ""}
          {ingest.readyMixMs != null ? ` · mix ready ${ingest.readyMixMs}ms` : ""}
        </p>
        <p>
          <span className="text-gray-600">Current decode RAM (est.):</span>{" "}
          {formatMemoryEstimate(cacheStats.currentTrackBytes)}
        </p>
        <p>
          <span className="text-gray-600">Conversion:</span> {activeConversionLabel(conversion)}
        </p>
        <p>
          <span className="text-gray-600">WASM codecs:</span> {wasmState}
        </p>
        <p>
          <span className="text-gray-600">FFmpeg:</span> {ffmpegState}
        </p>
        <p className="text-[10px] text-gray-600 font-sans leading-relaxed pt-1">
          Estimates are approximate. Stem mix RAM is shown in the Stems panel when enabled.
        </p>
      </div>
    </details>
  );
}
