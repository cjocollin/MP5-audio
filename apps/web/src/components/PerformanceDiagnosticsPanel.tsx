import { useEffect, useState } from "react";
import { APP_VERSION } from "../generated/appVersion";
import { exportPlaybackTraceReport } from "../lib/playback/playbackRegressionSnapshot";
import {
  clearPlaybackTrace,
  getPlaybackTraceBuffer,
  isPlaybackTraceEnabled,
  setPlaybackTraceEnabled,
} from "../lib/playback/playbackTrace";
import { formatBytes } from "../converter/exportSummary";
import { decodeCache, DECODE_CACHE_MAX_ENTRIES } from "../player/decodeCache";
import { getCodecLoadState } from "../wasm/codec";
import { getFfmpegLoadState } from "../converter/ffmpegLoader";
import { getLibraryStorageInfo, listLibraryRecords } from "../lib/localLibrary/api";
import { formatMemoryEstimate } from "../lib/performance/memoryEstimates";
import { getIngestDiagnostics } from "../lib/ingest/ingestDiagnostics";
import { activeConversionLabel, useConversionStore } from "../store/conversionStore";
import { usePlayerStore } from "../store/playerStore";
import {
  buildBetaDiagnosticsReport,
  getLastUserFacingError,
  supportedFeaturesList,
} from "../lib/sessionDiagnostics";
import { FEEDBACK_PRIVACY_NOTE, MP5_BUG_REPORT_URL } from "../lib/betaFeedback";

export function PerformanceDiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [libraryBytes, setLibraryBytes] = useState(0);
  const [libraryQuota, setLibraryQuota] = useState<number | null>(null);
  const [libraryCount, setLibraryCount] = useState(0);
  const [traceOn, setTraceOn] = useState(isPlaybackTraceEnabled);
  const [, setTraceTick] = useState(0);
  const conversion = useConversionStore();
  const tracks = usePlayerStore((s) => s.tracks);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const currentTrack = tracks[currentIndex];
  const lastError = getLastUserFacingError();

  async function copyDiagnostics() {
    const cacheStats = decodeCache.getStats(currentTrack?.id);
    const traceText =
      traceOn && getPlaybackTraceBuffer().length > 0 ? exportPlaybackTraceReport() : undefined;
    const text = buildBetaDiagnosticsReport({
      conversion,
      queueLength: tracks.length,
      currentFileLabel:
        currentTrack?.file?.size != null
          ? `${currentTrack.name ?? "track"} (${formatBytes(currentTrack.file.size)})`
          : (currentTrack?.name ?? "none"),
      decodeCacheSummary: `${cacheStats.entryCount}/${DECODE_CACHE_MAX_ENTRIES} (~${formatMemoryEstimate(cacheStats.estimatedBytes)})`,
      librarySummary: `${libraryCount} entries, ${formatBytes(libraryBytes)}`,
      includePlaybackTrace: traceText,
    });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be blocked */
    }
  }

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
    const id = setInterval(() => {
      void refresh();
      if (traceOn) setTraceTick((n) => n + 1);
    }, 3000);
    return () => clearInterval(id);
  }, [open, traceOn]);

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
          <span className="text-gray-600">App version:</span> {APP_VERSION}
        </p>
        <p>
          <span className="text-gray-600">Browser:</span>{" "}
          {typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}
        </p>
        <p>
          <span className="text-gray-600">Supported:</span>{" "}
          {supportedFeaturesList().join(" · ")}
        </p>
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
        <p className="text-[10px] text-gray-600 font-sans leading-relaxed">
          Estimates are approximate. Stem mix RAM is shown in the Stems panel when enabled.
        </p>
        <p>
          <span className="text-gray-600">Stem worker:</span>{" "}
          {typeof Worker !== "undefined" ? "available" : "unavailable"}
        </p>
        <p>
          <span className="text-gray-600">Last error:</span>{" "}
          {lastError ? `${lastError.source}: ${lastError.message}` : "none recorded this session"}
        </p>
        <p className="text-[10px] text-gray-600 font-sans leading-relaxed">{FEEDBACK_PRIVACY_NOTE}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-[10px] text-gray-500 hover:text-gray-300 font-sans border border-white/10 rounded px-2 py-1"
            onClick={() => void copyDiagnostics()}
            data-testid="diagnostics-copy-report"
          >
            Copy diagnostics
          </button>
          <a
            href={MP5_BUG_REPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-accent hover:underline font-sans inline-flex items-center min-h-[24px]"
            data-testid="diagnostics-bug-report-link"
          >
            Report a bug
          </a>
        </div>
        <p className="text-[10px] text-gray-600 font-sans leading-relaxed">
          <a
            href="https://github.com/cjocollin/MP5-audio/blob/main/docs/MP5_KNOWN_ISSUES.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
            data-testid="diagnostics-known-issues-link"
          >
            Known limitations (Public Beta)
          </a>
          {" · "}
          <a
            href="https://github.com/cjocollin/MP5-audio/blob/main/docs/MP5_PUBLIC_BETA_RELEASE_NOTES.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
            data-testid="diagnostics-release-notes-link"
          >
            Public Beta release notes
          </a>
        </p>
        <div className="border-t border-white/5 pt-2 space-y-2">
          <label className="flex items-center gap-2 text-gray-400 font-sans">
            <input
              type="checkbox"
              checked={traceOn}
              onChange={(e) => {
                setPlaybackTraceEnabled(e.target.checked);
                setTraceOn(e.target.checked);
              }}
              data-testid="playback-trace-toggle"
            />
            Playback trace (console + buffer)
          </label>
          {traceOn && (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-[10px] text-gray-500 hover:text-gray-300 font-sans"
                  onClick={async () => {
                    const text = exportPlaybackTraceReport();
                    try {
                      await navigator.clipboard.writeText(text);
                    } catch {
                      /* fallback below */
                    }
                  }}
                  data-testid="playback-trace-copy"
                >
                  Copy playback trace
                </button>
                <button
                  type="button"
                  className="text-[10px] text-gray-500 hover:text-gray-300 font-sans"
                  onClick={() => {
                    clearPlaybackTrace();
                    setTraceTick((n) => n + 1);
                  }}
                  data-testid="playback-trace-clear"
                >
                  Clear trace
                </button>
              </div>
              <pre
                className="max-h-40 overflow-auto text-[10px] text-gray-500 whitespace-pre-wrap"
                data-testid="playback-trace-log"
              >
                {getPlaybackTraceBuffer()
                  .slice(-24)
                  .map(
                    (e) =>
                      `${Math.round(e.t)}ms ${e.kind}: ${e.reason}${e.detail ? ` ${JSON.stringify(e.detail)}` : ""}`,
                  )
                  .join("\n") || "(no events yet)"}
              </pre>
            </>
          )}
        </div>
      </div>
    </details>
  );
}
