import { useCallback, useEffect, useState } from "react";
import {
  deleteSavedAlbum,
  listSavedAlbums,
  type SavedAlbumPackage,
} from "../lib/localLibrary/albumLibrary";
import { openSavedAlbumInPlayer } from "../lib/album/openSavedAlbum";

interface Props {
  onAlbumOpened?: (saved: SavedAlbumPackage) => void;
}

export function SavedAlbumsPanel({ onAlbumOpened }: Props) {
  const [albums, setAlbums] = useState<SavedAlbumPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = useCallback(() => {
    setAlbums(listSavedAlbums());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handlePlay(saved: SavedAlbumPackage) {
    setBusy(true);
    setNote("");
    try {
      const { album, filesLoaded, missingRefs } = await openSavedAlbumInPlayer(saved);
      onAlbumOpened?.(saved);
      if (missingRefs.length) {
        setNote(
          `Opened "${saved.manifest.album.title}" — ${filesLoaded} file(s) from library; ${missingRefs.length} still missing (save matching .mp5 to library).`,
        );
      } else {
        setNote(`Opened "${saved.manifest.album.title}" (${album.resolvedCount} tracks).`);
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleDelete(id: string) {
    deleteSavedAlbum(id);
    refresh();
  }

  if (!albums.length) {
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
        {albums.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-lg border border-white/5 bg-surface/40 px-2 py-2"
            data-testid="saved-album-item"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-100 truncate">{a.manifest.album.title}</p>
              <p className="text-xs text-gray-500 truncate">
                {a.manifest.tracks.length} tracks · {a.name}
              </p>
            </div>
            <button
              type="button"
              className="px-2 py-1 rounded text-xs border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40"
              disabled={busy}
              onClick={() => void handlePlay(a)}
              data-testid="saved-album-play"
            >
              Play
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded text-xs text-gray-500 hover:text-red-300"
              disabled={busy}
              onClick={() => handleDelete(a.id)}
              data-testid="saved-album-delete"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {note && (
        <p className="text-xs text-gray-400" data-testid="saved-albums-note">
          {note}
        </p>
      )}
    </div>
  );
}
