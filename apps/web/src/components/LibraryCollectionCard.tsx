import { useEffect, useState } from "react";
import { formatBytes } from "../converter/exportSummary";
import { formatDuration } from "../player/playlistUtils";
import type { UnifiedLibraryItem } from "../lib/localLibrary/unifiedLibraryTypes";
import { isLargePackageItem, packageBadgeLabel } from "../lib/localLibrary/unifiedLibrarySearch";

function useCoverUrl(item: UnifiedLibraryItem): string | undefined {
  const [url, setUrl] = useState<string | undefined>(item.coverDataUrl);
  useEffect(() => {
    if (item.coverDataUrl) {
      setUrl(item.coverDataUrl);
      return;
    }
    if (!item.coverThumbnail?.length) {
      setUrl(undefined);
      return;
    }
    const mime = item.coverMime ?? "image/jpeg";
    const blob = new Blob([new Uint8Array(item.coverThumbnail)], { type: mime });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [item.id, item.coverDataUrl, item.coverThumbnail, item.coverMime]);
  return url;
}

function formatDate(ts: number | null): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export interface LibraryCardActions {
  onPlay?: () => void;
  onQueue?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onCopySummary?: () => void;
  onReopen?: () => void;
  onRemoveRecent?: () => void;
  onOpenAlbum?: () => void;
}

export function LibraryCollectionCard({
  item,
  busy,
  actions,
}: {
  item: UnifiedLibraryItem;
  busy: boolean;
  actions: LibraryCardActions;
}) {
  const coverUrl = useCoverUrl(item);
  const badge = packageBadgeLabel(item);
  const large = isLargePackageItem(item);
  const unreadable = item.integrityStatus === "unreadable";
  const isRecent = item.source === "recent";
  const isAlbum = item.type === "album";
  const rowTestId = isRecent ? "library-card" : isAlbum ? "saved-album-item" : "local-library-item";

  return (
    <li
      className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border px-2 py-2 ${
        unreadable ? "border-red-900/30 bg-red-950/10" : "border-white/5 bg-surface/40"
      }`}
      data-testid={rowTestId}
      data-library-id={item.id}
      data-item-type={item.type}
      data-package-type={item.packageType}
      data-source={item.source}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="relative w-12 h-12 shrink-0 rounded-md bg-surface-elevated overflow-hidden flex items-center justify-center">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm opacity-40">{isAlbum ? "▣" : "♪"}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-100 truncate" data-testid="library-card-title">
            {item.title || "Untitled"}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {item.artist || "Unknown artist"}
            {item.album && item.album !== item.title ? ` · ${item.album}` : ""}
            {item.year ? ` · ${item.year}` : ""}
            {item.genre ? ` · ${item.genre}` : ""}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] text-gray-600">
            <span className="font-semibold text-accent/90" data-testid="library-package-badge">
              {badge}
            </span>
            {isRecent && (
              <span className="px-1.5 py-0 rounded bg-gray-800/80 text-gray-300 border border-gray-700/60">
                Recent
              </span>
            )}
            {!isRecent && (
              <span className="px-1.5 py-0 rounded bg-emerald-900/30 text-emerald-200/90 border border-emerald-800/40">
                Saved locally
              </span>
            )}
            {large && (
              <span className="px-1.5 py-0 rounded bg-amber-900/30 text-amber-200/90 border border-amber-800/40">
                Large package
              </span>
            )}
            {item.integrityStatus === "ok" && (
              <span className="text-emerald-400/80">Integrity OK</span>
            )}
            {item.integrityStatus === "unknown" && (
              <span className="text-gray-500">Integrity unknown</span>
            )}
            {unreadable && <span className="text-red-300/90">Unreadable</span>}
            {isAlbum && item.trackCount > 0 && <span>{item.trackCount} tracks</span>}
            {item.durationMs != null && item.durationMs > 0 && (
              <span className="font-mono">{formatDuration(item.durationMs / 1000)}</span>
            )}
            {item.codecLabel && !isAlbum && (
              <span className="font-semibold text-accent/70">{item.codecLabel}</span>
            )}
            <span>{formatBytes(item.sizeBytes)}</span>
            <span>{isRecent ? "Opened" : "Added"} {formatDate(item.lastOpenedAt ?? item.addedAt)}</span>
          </p>
          <p className="text-[10px] text-gray-600 truncate font-mono">{item.filename}</p>
          {item.reopenHint && (
            <p className="text-[10px] text-amber-200/80 mt-0.5" data-testid="library-reopen-hint">
              {item.reopenHint}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 shrink-0">
        {isRecent ? (
          <>
            {actions.onReopen && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40 min-h-[32px]"
                disabled={busy || !item.canReopen}
                onClick={actions.onReopen}
                data-testid="library-reopen"
              >
                Reopen
              </button>
            )}
            {actions.onRemoveRecent && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs border border-white/10 text-gray-400 hover:bg-white/5 min-h-[32px]"
                disabled={busy}
                onClick={actions.onRemoveRecent}
                data-testid="library-remove-recent"
              >
                Remove
              </button>
            )}
          </>
        ) : isAlbum ? (
          <>
            {actions.onOpenAlbum && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs border border-white/10 text-gray-200 hover:bg-white/5 disabled:opacity-40 min-h-[32px]"
                disabled={busy}
                onClick={actions.onOpenAlbum}
                data-testid="saved-album-open"
              >
                Open
              </button>
            )}
            {actions.onPlay && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40 min-h-[32px]"
                disabled={busy}
                onClick={actions.onPlay}
                data-testid="saved-album-play"
              >
                Play album
              </button>
            )}
            {actions.onDownload && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-40 min-h-[32px]"
                disabled={busy}
                onClick={actions.onDownload}
                data-testid="library-album-download"
              >
                Download
              </button>
            )}
            {actions.onCopySummary && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs border border-white/10 text-gray-400 hover:bg-white/5 disabled:opacity-40 min-h-[32px]"
                disabled={busy}
                onClick={actions.onCopySummary}
                data-testid="library-copy-summary"
              >
                Copy
              </button>
            )}
            {actions.onDelete && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs text-gray-500 hover:text-red-300 min-h-[32px]"
                disabled={busy}
                onClick={actions.onDelete}
                data-testid="saved-album-delete"
              >
                Delete
              </button>
            )}
          </>
        ) : (
          <>
            {actions.onPlay && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40 min-h-[32px]"
                disabled={busy || unreadable}
                onClick={actions.onPlay}
                data-testid="local-library-play"
              >
                Play
              </button>
            )}
            {actions.onQueue && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-40 min-h-[32px]"
                disabled={busy || unreadable}
                onClick={actions.onQueue}
                data-testid="local-library-add-playlist"
              >
                Queue
              </button>
            )}
            {actions.onDownload && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs border border-white/10 text-gray-400 hover:bg-white/5 disabled:opacity-40 min-h-[32px]"
                disabled={busy}
                onClick={actions.onDownload}
                data-testid="local-library-download"
              >
                Download
              </button>
            )}
            {actions.onCopySummary && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs border border-white/10 text-gray-400 hover:bg-white/5 disabled:opacity-40 min-h-[32px]"
                disabled={busy}
                onClick={actions.onCopySummary}
                data-testid="library-copy-summary"
              >
                Copy
              </button>
            )}
            {actions.onDelete && (
              <button
                type="button"
                className="px-2 py-1 rounded text-xs text-gray-500 hover:text-red-300 min-h-[32px]"
                disabled={busy}
                onClick={actions.onDelete}
                data-testid="local-library-delete"
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
