import { formatBytes, type ExportSummary } from "../converter/exportSummary";
import { suggestDuplicateExportFilename } from "../converter/exportFilename";

interface Props {
  summary: ExportSummary;
  onDownloadAgain: () => void;
  onOpenInPlayer: () => void;
  onAddToPlaylist: () => void;
  onSaveToLibrary?: () => void;
}

export function ExportSummaryPanel({
  summary,
  onDownloadAgain,
  onOpenInPlayer,
  onAddToPlaylist,
  onSaveToLibrary,
}: Props) {
  return (
    <section
      className="rounded-xl border border-green-500/30 bg-green-950/20 p-4 space-y-3 text-sm"
      data-testid="export-summary-panel"
    >
      <p className="font-medium text-green-300">Export complete</p>
      {summary.exportCodec === "mp5l" && (
        <p className="text-[10px] text-gray-500" data-testid="export-duplicate-hint">
          Saving again? Your browser may keep both files — try{" "}
          <span className="text-gray-400">{suggestDuplicateExportFilename(summary.filename, "mp5l")}</span>
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-300">
        <dt className="text-gray-500">Filename</dt>
        <dd data-testid="export-summary-filename">{summary.filename}</dd>
        <dt className="text-gray-500">Codec / mode</dt>
        <dd data-testid="export-summary-codec">{summary.codecLabel}</dd>
        <dt className="text-gray-500">Output size</dt>
        <dd data-testid="export-summary-size">{formatBytes(summary.outputBytes)}</dd>
        {summary.sourceBytes != null && (
          <>
            <dt className="text-gray-500">Source size</dt>
            <dd data-testid="export-summary-source-size">{formatBytes(summary.sourceBytes)}</dd>
          </>
        )}
        {summary.containerVsPcmPercent != null && (
          <>
            <dt className="text-gray-500">vs uncompressed PCM</dt>
            <dd data-testid="export-summary-ratio">
              {summary.containerVsPcmPercent.toFixed(1)}%
              {summary.containerVsPcmPercent < 100 ? " (smaller)" : " (larger)"}
            </dd>
          </>
        )}
        <dt className="text-gray-500">Track metadata</dt>
        <dd data-testid="export-summary-meta">{summary.hasMetaTags ? "Yes" : "No"}</dd>
        <dt className="text-gray-500">Cover art</dt>
        <dd data-testid="export-summary-cover">{summary.hasCoverArt ? "Yes" : "No"}</dd>
        <dt className="text-gray-500">Lyrics</dt>
        <dd data-testid="export-summary-lyrics">{summary.hasLyrics ? "Yes" : "No"}</dd>
        <dt className="text-gray-500">Content guidance</dt>
        <dd data-testid="export-summary-guidance">{summary.hasContentGuidance ? "Yes" : "No"}</dd>
      </dl>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-accent text-black text-xs font-semibold hover:opacity-90"
          onClick={onDownloadAgain}
          data-testid="export-download-again"
        >
          Download again
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-accent/40 text-accent text-xs font-medium hover:bg-accent/10"
          onClick={onOpenInPlayer}
          data-testid="export-open-player"
        >
          Open in Player
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 text-xs hover:bg-white/5"
          onClick={onAddToPlaylist}
          data-testid="export-add-playlist"
        >
          Add to playlist
        </button>
        {onSaveToLibrary && (
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 text-xs hover:bg-white/5"
            onClick={onSaveToLibrary}
            data-testid="export-save-library"
          >
            Save to library
          </button>
        )}
      </div>
    </section>
  );
}
