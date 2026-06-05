import type { PlaylistTrack } from "../../store/playerStore";
import { resolveTrackDurationMsFromRef } from "./albumDuration";
import type { ResolvedAlbumPackage, ResolvedAlbumTrack } from "./resolveAlbum";

export type PlaylistTrackWithEmbedded = PlaylistTrack;

export function buildEmbeddedPlaylistPlaceholders(
  album: ResolvedAlbumPackage,
): PlaylistTrackWithEmbedded[] {
  if (album.packageKind !== "embedded" || !album.embeddedSource) return [];
  const { file, index } = album.embeddedSource;
  return album.tracks.map((row) => rowToPlaceholder(row, file.name, index.tracks));
}

function rowToPlaceholder(
  row: ResolvedAlbumTrack,
  packageName: string,
  dirTracks: { trackId: string; logicalFile: string }[],
): PlaylistTrackWithEmbedded {
  const dir = dirTracks.find((t) => t.trackId === row.ref.trackId);
  const filename = dir?.logicalFile ?? row.ref.file;
  const durationMs = resolveTrackDurationMsFromRef(row.ref);
  return {
    id: row.ref.trackId,
    name: filename,
    durationSec: durationMs != null ? durationMs / 1000 : undefined,
    embeddedAlbum: {
      trackId: row.ref.trackId,
      filename,
    },
    parseError: undefined,
  };
}

export function isEmbeddedPlaceholderTrack(
  track: PlaylistTrack | undefined,
): track is PlaylistTrackWithEmbedded {
  return !!track?.embeddedAlbum && !track.file;
}
