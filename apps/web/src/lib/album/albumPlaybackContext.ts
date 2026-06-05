import type { ResolvedAlbumPackage } from "./resolveAlbum";
import type { PlaylistTrack } from "../../store/playerStore";

export interface AlbumPlaybackContext {
  packageTitle: string;
  packageArtist?: string;
  packageKind: "manifest" | "embedded";
  trackNumber: number;
  trackCount: number;
}

export function albumPlaybackContext(
  album: ResolvedAlbumPackage | null,
  track: PlaylistTrack | undefined,
): AlbumPlaybackContext | null {
  if (!album || !track) return null;
  const rowIndex = album.tracks.findIndex(
    (t) =>
      t.playlistTrack?.id === track.id ||
      t.ref.trackId === track.id ||
      t.ref.trackId === track.embeddedAlbum?.trackId,
  );
  if (rowIndex < 0) return null;
  const row = album.tracks[rowIndex]!;
  return {
    packageTitle: album.manifest.album.title,
    packageArtist: album.manifest.album.albumArtist ?? album.manifest.album.artist,
    packageKind: album.packageKind,
    trackNumber: row.trackNumber,
    trackCount: album.tracks.length,
  };
}
