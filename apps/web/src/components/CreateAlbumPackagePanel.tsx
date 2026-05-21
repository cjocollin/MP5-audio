import { useEffect, useMemo, useState } from "react";
import type { PlaylistTrack } from "../store/playerStore";
import { trackDisplayInfo } from "../player/playlistUtils";
import {
  createAlbumManifestFromTracks,
  defaultAlbumPackageFilename,
  downloadAlbumManifest,
  suggestAlbumMetaFromTracks,
} from "../lib/album/createAlbumPackage";

interface Props {
  tracks: PlaylistTrack[];
}

export function CreateAlbumPackagePanel({ tracks }: Props) {
  const playable = useMemo(() => tracks.filter((t) => !t.parseError && t.file), [tracks]);
  const suggested = useMemo(() => suggestAlbumMetaFromTracks(playable), [playable]);
  const [ordered, setOrdered] = useState<PlaylistTrack[]>([]);
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumArtist, setAlbumArtist] = useState("");
  const [year, setYear] = useState("");
  const [genre, setGenre] = useState("");

  useEffect(() => {
    setOrdered(playable);
  }, [playable]);

  useEffect(() => {
    if (playable.length >= 2) {
      setAlbumTitle(suggested.albumTitle);
      setAlbumArtist(suggested.albumArtist ?? "");
      setYear(suggested.year ?? "");
      setGenre(suggested.genre ?? "");
    }
  }, [playable.length, suggested.albumTitle, suggested.albumArtist, suggested.year, suggested.genre]);

  if (playable.length < 2) {
    return (
      <div
        className="rounded-lg border border-white/5 bg-surface/40 px-3 py-2 text-xs text-gray-500"
        data-testid="create-album-hint"
      >
        Add at least two playable .mp5 tracks to create an album package manifest.
      </div>
    );
  }

  function moveTrack(index: number, direction: -1 | 1) {
    setOrdered((prev) => {
      const next = [...prev];
      const j = index + direction;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  }

  async function handleExport() {
    const manifest = await createAlbumManifestFromTracks(
      ordered,
      {
        albumTitle: albumTitle || suggested.albumTitle,
        albumArtist,
        year,
        genre,
      },
      { includeFileHashes: true },
    );
    if (!manifest) return;
    downloadAlbumManifest(manifest, defaultAlbumPackageFilename(manifest));
  }

  return (
    <div className="mp5-card p-4 space-y-3" data-testid="create-album-package-panel">
      <div>
        <p className="text-sm font-medium text-gray-200">Create album package</p>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Downloads a <span className="font-mono">.mp5p</span> JSON manifest — not a zip archive.
          Sidecar <span className="font-mono">.mp5</span> files stay separate; keep them in the same
          folder as the manifest when sharing.
        </p>
      </div>

      <div
        className="rounded-lg border border-amber-900/25 bg-amber-950/15 px-3 py-2 text-[10px] text-amber-100/80 leading-relaxed"
        data-testid="create-album-archive-warning"
      >
        Embedded album archives (single .mp5p blob with audio inside) are not supported in this
        MVP. Third-party players may ignore .mp5p manifests.
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <label className="block text-xs">
          <span className="text-gray-500">Album title</span>
          <input
            value={albumTitle}
            onChange={(e) => setAlbumTitle(e.target.value)}
            className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
            data-testid="create-album-title"
          />
        </label>
        <label className="block text-xs">
          <span className="text-gray-500">Album artist</span>
          <input
            value={albumArtist}
            onChange={(e) => setAlbumArtist(e.target.value)}
            className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
            data-testid="create-album-artist"
          />
        </label>
        <label className="block text-xs">
          <span className="text-gray-500">Year</span>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
            data-testid="create-album-year"
          />
        </label>
        <label className="block text-xs">
          <span className="text-gray-500">Genre</span>
          <input
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
            data-testid="create-album-genre"
          />
        </label>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-gray-500 font-medium">Track order (playlist → manifest)</p>
        <ol className="space-y-1 max-h-40 overflow-y-auto" data-testid="create-album-track-order">
          {ordered.map((t, index) => {
            const info = trackDisplayInfo(t);
            return (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded border border-white/5 bg-surface/30 px-2 py-1 text-xs"
                data-testid="create-album-track-row"
              >
                <span className="text-gray-600 font-mono w-5">{index + 1}</span>
                <span className="flex-1 min-w-0 truncate text-gray-300">{info.title}</span>
                <span className="font-mono text-gray-600 truncate max-w-[40%]" data-testid="create-album-track-filename">
                  {t.name}
                </span>
                <div className="flex flex-col shrink-0">
                  <button
                    type="button"
                    className="text-gray-600 hover:text-gray-300 disabled:opacity-30 text-[10px]"
                    disabled={index === 0}
                    onClick={() => moveTrack(index, -1)}
                    aria-label="Move up"
                    data-testid={`create-album-move-up-${index}`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="text-gray-600 hover:text-gray-300 disabled:opacity-30 text-[10px]"
                    disabled={index === ordered.length - 1}
                    onClick={() => moveTrack(index, 1)}
                    aria-label="Move down"
                    data-testid={`create-album-move-down-${index}`}
                  >
                    ▼
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <button
        type="button"
        className="mp5-btn-secondary text-sm"
        onClick={handleExport}
        data-testid="create-album-export"
      >
        Download .mp5p manifest
      </button>
    </div>
  );
}
