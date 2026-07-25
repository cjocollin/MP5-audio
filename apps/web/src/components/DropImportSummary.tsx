import type { IngestResult } from "../player/playlistUtils";
import { usePlayerStore } from "../store/playerStore";

interface Props {
  summary: IngestResult;
  /** Skipped non-.mp5 source files available for Convert handoff. */
  skippedFiles?: File[];
}

export function DropImportSummary({ summary, skippedFiles = [] }: Props) {
  const { addedCount, skippedCount, unreadableCount, dropErrors } = summary;
  const setPendingConverterFiles = usePlayerStore((s) => s.setPendingConverterFiles);
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);

  if (addedCount === 0 && skippedCount === 0 && unreadableCount === 0) return null;

  const convertible = skippedFiles.length > 0 && skippedCount > 0;

  function handleConvertInstead() {
    if (!skippedFiles.length) return;
    setPendingConverterFiles(skippedFiles);
    setActiveTab("converter");
  }

  return (
    <div
      className="mp5-import-summary space-y-1 rounded-lg border border-white/10 bg-surface-elevated/95 px-3 py-2 text-xs text-gray-300"
      data-testid="drop-import-summary"
      role="status"
    >
      {addedCount > 0 && (
        <p data-testid="drop-added-count">
          Added {addedCount} track{addedCount === 1 ? "" : "s"} to the playlist.
        </p>
      )}
      {skippedCount > 0 && (
        <p data-testid="drop-skipped-count">
          Skipped {skippedCount} file{skippedCount === 1 ? "" : "s"} (not .mp5 / .mp5p).
        </p>
      )}
      {unreadableCount > 0 && (
        <p data-testid="drop-unreadable-count">
          {unreadableCount} file{unreadableCount === 1 ? "" : "s"} could not be read — still listed as
          unreadable in the queue.
        </p>
      )}
      {convertible && (
        <div className="pt-1 space-y-1.5" data-testid="drop-convert-handoff">
          <p className="text-gray-500">
            Player plays <strong className="text-gray-400 font-normal">.mp5 / .mp5p</strong> only;
            source audio goes to Converter (Public Beta).
          </p>
          <button
            type="button"
            className="mp5-btn-secondary text-xs min-h-[32px]"
            onClick={handleConvertInstead}
            data-testid="drop-convert-cta"
          >
            Convert these files instead
          </button>
        </div>
      )}
      {dropErrors.length > 0 && (
        <ul className="text-gray-500 space-y-0.5" data-testid="drop-skip-reasons">
          {dropErrors.map((e) => (
            <li key={e.name}>
              <span className="text-gray-400">{e.name}:</span> {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
