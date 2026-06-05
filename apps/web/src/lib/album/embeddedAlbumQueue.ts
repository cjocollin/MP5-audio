import type { PlaylistTrack } from "../../store/playerStore";
import { resolveTrackDurationMsFromRef } from "./albumDuration";
import { albumPackageMetaFromManifest } from "./embeddedPlaylistMetadata";
import type { ResolvedAlbumPackage, ResolvedAlbumTrack } from "./resolveAlbum";

export type PlaylistTrackWithEmbedded = PlaylistTrack;

export function buildEmbeddedPlaylistPlaceholders(
  album: ResolvedAlbumPackage,
): PlaylistTrackWithEmbedded[] {
  if (album.packageKind !== "embedded" || !album.embeddedSource) return [];
  const { file, index } = album.embeddedSource;
  const packageMeta = albumPackageMetaFromManifest(album.manifest);
  return album.tracks.map((row) =>
    rowToPlaceholder(row, index.tracks, packageMeta, album.manifest.album.title),
  );
}

function rowToPlaceholder(
  row: ResolvedAlbumTrack,
  dirTracks: { trackId: string; logicalFile: string }[],
  packageMeta: ReturnType<typeof albumPackageMetaFromManifest>,
  albumTitle: string,
): PlaylistTrackWithEmbedded {
  const dir = dirTracks.find((t) => t.trackId === row.ref.trackId);
  const filename = dir?.logicalFile ?? row.ref.file;
  const durationMs = resolveTrackDurationMsFromRef(row.ref);
  const title = row.displayTitle;
  const artist = row.displayArtist;
  return {
    id: row.ref.trackId,
    name: filename,
    durationSec: durationMs != null ? durationMs / 1000 : undefined,
    embeddedAlbum: {
      trackId: row.ref.trackId,
      filename,
      display: {
        title,
        artist,
        album: albumTitle,
      },
      packageMeta,
    },
    parseError: undefined,
  };
}

export function isEmbeddedPlaceholderTrack(
  track: PlaylistTrack | undefined,
): track is PlaylistTrackWithEmbedded {
  return !!track?.embeddedAlbum && !track.file;
}
