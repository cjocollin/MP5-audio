import type { IngestResult } from "../player/playlistUtils";

interface Props {
  summary: IngestResult;
}

export function DropImportSummary({ summary }: Props) {
  const { addedCount, skippedCount, unreadableCount, dropErrors } = summary;
  if (addedCount === 0 && skippedCount === 0 && unreadableCount === 0) return null;

  return (
    <div
      className="rounded-lg border border-white/10 bg-surface-elevated/80 px-3 py-2 text-xs text-gray-300 space-y-1"
      data-testid="drop-import-summary"
    >
      {addedCount > 0 && (
        <p data-testid="drop-added-count">
          Added {addedCount} track{addedCount === 1 ? "" : "s"} to the playlist.
        </p>
      )}
      {skippedCount > 0 && (
        <p data-testid="drop-skipped-count">
          Skipped {skippedCount} file{skippedCount === 1 ? "" : "s"} (not .mp5).
        </p>
      )}
      {unreadableCount > 0 && (
        <p data-testid="drop-unreadable-count">
          {unreadableCount} file{unreadableCount === 1 ? "" : "s"} could not be read — still listed as
          unreadable in the queue.
        </p>
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
