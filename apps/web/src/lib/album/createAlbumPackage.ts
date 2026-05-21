import {
  ALBUM_MANIFEST_FORMAT,
  manifestToJson,
  type AlbmPackageManifest,
  type AlbmTrackRef,
} from "@mp5/container";
import type { PlaylistTrack } from "../../store/playerStore";
import { trackDisplayInfo } from "../../player/playlistUtils";
import { sha256HexFromArrayBuffer } from "../fingerprint/sha256";
import { downloadBlob } from "../performance/downloadBlob";

export interface CreateAlbumInput {
  albumTitle: string;
  albumArtist?: string;
  year?: string;
  genre?: string;
  credits?: string;
  gaplessDefault?: boolean;
}

export function isAlbumPackageFileName(name: string): boolean {
  return name.toLowerCase().endsWith(".mp5p");
}

export async function buildAlbumTrackRefs(
  tracks: PlaylistTrack[],
  includeFileHashes: boolean,
): Promise<AlbmTrackRef[]> {
  const refs: AlbmTrackRef[] = [];
  for (let index = 0; index < tracks.length; index++) {
    const t = tracks[index]!;
    const info = trackDisplayInfo(t);
    let fileSha256: string | undefined;
    if (includeFileHashes && t.file) {
      try {
        fileSha256 = await sha256HexFromArrayBuffer(await t.file.arrayBuffer());
      } catch {
        /* skip hash */
      }
    }
    refs.push({
      trackId: t.id,
      file: t.name,
      trackNumber: index + 1,
      discNumber: 1,
      title: info.title,
      artist: info.artist || undefined,
      durationMs:
        info.durationSec != null ? Math.round(info.durationSec * 1000) : undefined,
      fileSha256,
    });
  }
  return refs;
}

export async function createAlbumManifestFromTracks(
  tracks: PlaylistTrack[],
  input: CreateAlbumInput,
  opts?: { includeFileHashes?: boolean },
): Promise<AlbmPackageManifest | null> {
  const playable = tracks.filter((t) => !t.parseError && t.file);
  if (playable.length < 1) return null;

  const albumTracks = await buildAlbumTrackRefs(playable, opts?.includeFileHashes ?? true);

  return {
    format: ALBUM_MANIFEST_FORMAT,
    version: 1,
    album: {
      title: input.albumTitle.trim() || "Untitled album",
      artist: input.albumArtist?.trim() || undefined,
      albumArtist: input.albumArtist?.trim() || undefined,
      year: input.year?.trim() || undefined,
      genre: input.genre?.trim() || undefined,
    },
    tracks: albumTracks,
    credits: input.credits?.trim() || undefined,
    gaplessDefault: input.gaplessDefault,
  };
}

export function suggestAlbumMetaFromTracks(tracks: PlaylistTrack[]): CreateAlbumInput {
  const first = tracks.find((t) => !t.parseError);
  const info = first ? trackDisplayInfo(first) : null;
  return {
    albumTitle: info?.album || info?.title || "My album",
    albumArtist: info?.artist || "",
    year: "",
    genre: info?.genre || "",
  };
}

export function downloadAlbumManifest(manifest: AlbmPackageManifest, filename: string): void {
  const json = manifestToJson(manifest, true);
  downloadBlob(
    new Blob([json], { type: "application/json" }),
    filename.endsWith(".mp5p") ? filename : `${filename}.mp5p`,
  );
}

export function defaultAlbumPackageFilename(manifest: AlbmPackageManifest): string {
  const artist = manifest.album.albumArtist ?? manifest.album.artist ?? "Album";
  const title = manifest.album.title;
  const safe = (s: string) =>
    s
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .trim()
      .slice(0, 80) || "Album";
  return `${safe(artist)} - ${safe(title)}.mp5p`;
}
