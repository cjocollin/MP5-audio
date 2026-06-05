import type { AlbmPackageManifest, Mp5File } from "@mp5/container";
import { getMetaValue } from "@mp5/container";
import type { EmbeddedAlbumPackageMeta, PlaylistTrack } from "../../store/playerStore";
import {
  headDurationMs,
  resolveTrackDurationMsFromRef,
} from "./albumDuration";
import { readEmbeddedTrackMetadataPrefix } from "./embeddedTrackMetadata";
import { parseMp5MetadataPrefix } from "./parseMp5MetadataPrefix";
import type { ResolvedAlbumPackage } from "./resolveAlbum";

export function albumPackageMetaFromManifest(
  manifest: AlbmPackageManifest,
): EmbeddedAlbumPackageMeta {
  return {
    albumTitle: manifest.album.title,
    albumArtist: manifest.album.albumArtist ?? manifest.album.artist,
    year: manifest.album.year?.trim() || undefined,
    genre: manifest.album.genre?.trim() || undefined,
  };
}

export function mp5PreviewFromMetadataPrefix(
  prefix: ReturnType<typeof parseMp5MetadataPrefix>,
): Mp5File {
  return {
    header: { majorVersion: 1, fileFlags: 0 },
    meta: prefix.meta ?? [],
    head: prefix.head,
    cover: prefix.cover,
    coverArt: prefix.coverArt,
    audioFrames: [],
    seek: [],
    waveform: [],
    info: [],
    corr: [],
    optional: new Map(),
    stdfFragments: [],
    warnings: [],
  };
}

export async function buildEmbeddedPlaylistMetadataPatch(
  album: ResolvedAlbumPackage,
  trackId: string,
): Promise<Partial<PlaylistTrack>> {
  if (album.packageKind !== "embedded" || !album.embeddedSource) return {};
  const row = album.tracks.find((t) => t.ref.trackId === trackId);
  if (!row) return {};

  const { file, index } = album.embeddedSource;
  const prefix = await readEmbeddedTrackMetadataPrefix(file, index, trackId);
  const parsed = mp5PreviewFromMetadataPrefix(prefix);
  const headMs = prefix.head ? headDurationMs(prefix.head) : null;
  const durationMs = resolveTrackDurationMsFromRef(row.ref, headMs);
  const packageMeta = albumPackageMetaFromManifest(album.manifest);

  const title =
    getMetaValue(parsed.meta, "title") ?? row.displayTitle ?? row.ref.title;
  const artist =
    getMetaValue(parsed.meta, "artist") ?? row.displayArtist ?? row.ref.artist;
  const albumName =
    getMetaValue(parsed.meta, "album") ?? packageMeta.albumTitle;

  return {
    parsed,
    durationSec: durationMs != null ? durationMs / 1000 : undefined,
    embeddedAlbum: {
      trackId,
      filename: row.ref.file,
      display: { title, artist, album: albumName },
      packageMeta,
    },
  };
}

export async function prefetchEmbeddedPlaylistMetadata(
  album: ResolvedAlbumPackage,
  onUpdate: (trackId: string, patch: Partial<PlaylistTrack>) => void,
  opts?: { isCancelled?: () => boolean },
): Promise<void> {
  if (album.packageKind !== "embedded" || !album.embeddedSource) return;
  for (const row of album.tracks) {
    if (opts?.isCancelled?.()) return;
    const trackId = row.ref.trackId;
    try {
      const patch = await buildEmbeddedPlaylistMetadataPatch(album, trackId);
      if (opts?.isCancelled?.()) return;
      if (Object.keys(patch).length) onUpdate(trackId, patch);
    } catch {
      /* skip unreadable prefix */
    }
    await new Promise((r) => setTimeout(r, 40));
  }
}
