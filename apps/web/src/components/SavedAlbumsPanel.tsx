import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteSavedAlbum,
  listSavedAlbums,
  type SavedAlbumPackage,
} from "../lib/localLibrary/albumLibrary";
import {
  deleteSavedEmbeddedAlbum,
  listSavedEmbeddedAlbums,
  type SavedEmbeddedAlbumPackage,
} from "../lib/localLibrary/embeddedAlbumLibrary";
import { openSavedAlbumInPlayer } from "../lib/album/openSavedAlbum";
import { openSavedEmbeddedAlbumInPlayer } from "../lib/album/openSavedEmbeddedAlbum";
import { formatPackageBytes } from "../lib/album/albumPackageUi";

interface Props {
  onAlbumOpened?: (saved: SavedAlbumPackage | SavedEmbeddedAlbumPackage) => void;
}

type SavedAlbumRow =
  | { kind: "manifest"; saved: SavedAlbumPackage }
  | { kind: "embedded"; saved: SavedEmbeddedAlbumPackage };

function savedDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function SavedAlbumsPanel({ onAlbumOpened }: Props) {
  const [manifestAlbums, setManifestAlbums] = useState<SavedAlbumPackage[]>([]);
  const [embeddedAlbums, setEmbeddedAlbums] = useState<SavedEmbeddedAlbumPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = useCallback(() => {
    setManifestAlbums(listSavedAlbums());
    setEmbeddedAlbums(listSavedEmbeddedAlbums());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rows = useMemo((): SavedAlbumRow[] => {
    const manifest: SavedAlbumRow[] = manifestAlbums.map((saved) => ({
      kind: "manifest",
      saved,
    }));
    const embedded: SavedAlbumRow[] = embeddedAlbums.map((saved) => ({
      kind: "embedded",
      saved,
    }));
    return [...embedded, ...manifest].sort(
      (a, b) => b.saved.importedAt - a.saved.importedAt,
    );
  }, [manifestAlbums, embeddedAlbums]);

  async function handlePlay(row: SavedAlbumRow) {
    setBusy(true);
    setNote("");
    try {
      if (row.kind === "embedded") {
        const { album } = await openSavedEmbeddedAlbumInPlayer(row.saved);
        onAlbumOpened?.(row.saved);
        setNote(`Opened embedded album "${album.manifest.album.title}" (${album.tracks.length} tracks).`);
      } else {
        const { album, filesLoaded, missingRefs } = await openSavedAlbumInPlayer(row.saved);
        onAlbumOpened?.(row.saved);
        if (missingRefs.length) {
          setNote(
            `Opened "${row.saved.manifest.album.title}" — ${filesLoaded} sidecar(s) from library; ${missingRefs.length} still missing.`,
          );
        } else {
          setNote(`Opened "${row.saved.manifest.album.title}" (${album.resolvedCount} tracks).`);
        }
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleDelete(row: SavedAlbumRow) {
    if (row.kind === "embedded") {
      deleteSavedEmbeddedAlbum(row.saved.id);
    } else {
      deleteSavedAlbum(row.saved.id);
    }
    refresh();
  }

  if (!rows.length) {
    return (
      <p className="text-xs text-gray-500" data-testid="saved-albums-empty">
        No saved album packages. Import a .mp5p in the player and use Save album to library.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="saved-albums-panel">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Saved albums</p>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const { saved } = row;
          const title = saved.manifest.album.title;
          const artist = saved.manifest.album.albumArtist ?? saved.manifest.album.artist;
          const trackCount = saved.manifest.tracks.length;
          const packageKind = row.kind === "embedded" ? "Embedded" : "Manifest";
          const size =
            row.kind === "embedded"
              ? formatPackageBytes(row.saved.fileSize)
              : undefined;
          return (
            <li
              key={`${row.kind}-${saved.id}`}
              className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-white/5 bg-surface/40 px-2 py-2"
              data-testid="saved-album-item"
              data-album-kind={row.kind}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-100 truncate" data-testid="saved-album-title">
                  {title}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {artist && <span>{artist} · </span>}
                  <span data-testid="saved-album-meta">
                    {packageKind} · {trackCount} tracks
                    {size ? ` · ${size}` : ""}
                    {" · "}
                    Saved {savedDate(saved.importedAt)}
                  </span>
                </p>
                <p className="text-[10px] text-gray-600 truncate font-mono">{saved.name}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 shrink-0">
                <button
                  type="button"
                  className="px-2 py-1.5 rounded text-xs border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40 min-h-[32px]"
                  disabled={busy}
                  onClick={() => void handlePlay(row)}
                  data-testid="saved-album-play"
                >
                  Play album
                </button>
                <button
                  type="button"
                  className="px-2 py-1.5 rounded text-xs text-gray-500 hover:text-red-300 min-h-[32px]"
                  disabled={busy}
                  onClick={() => handleDelete(row)}
                  data-testid="saved-album-delete"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {note && (
        <p className="text-xs text-gray-400" data-testid="saved-albums-note">
          {note}
        </p>
      )}
    </div>
  );
}
