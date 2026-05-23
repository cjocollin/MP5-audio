import {
  loadEmbeddedTrackBytes,
  type EmbeddedAlbumPackageIndex,
} from "@mp5/container";
import type { PlaylistTrack } from "../../store/playerStore";
import { ingestMp5Files } from "../../player/playlistUtils";
import type { ResolvedAlbumPackage } from "./resolveAlbum";

function bytesToFile(bytes: Uint8Array, filename: string): File {
  const copy = bytes.slice();
  return new File([copy.buffer], filename, { type: "audio/mp5" });
}

export async function loadEmbeddedTrackAsPlaylistTrack(
  source: File | Blob,
  index: EmbeddedAlbumPackageIndex,
  trackId: string,
  filename: string,
): Promise<PlaylistTrack | null> {
  const bytes = await loadEmbeddedTrackBytes(source, index, trackId);
  const file = bytesToFile(bytes, filename);
  const result = await ingestMp5Files([file]);
  const track = result.tracks[0];
  if (track) {
    track.id = trackId;
  }
  return track ?? null;
}

export async function ensureEmbeddedTracksLoaded(
  album: ResolvedAlbumPackage,
  trackIds?: string[],
): Promise<ResolvedAlbumPackage> {
  if (album.packageKind !== "embedded" || !album.embeddedSource) return album;
  const want = trackIds ?? album.tracks.map((t) => t.ref.trackId);
  const wantSet = new Set(want);
  const { file, index } = album.embeddedSource;
  const updatedTracks = [...album.tracks];
  let changed = false;
  for (let i = 0; i < updatedTracks.length; i++) {
    const row = updatedTracks[i]!;
    if (!wantSet.has(row.ref.trackId) || row.playlistTrack) continue;
    const dir = index.tracks.find((t) => t.trackId === row.ref.trackId);
    const filename = dir?.logicalFile ?? row.ref.file;
    const loaded = await loadEmbeddedTrackAsPlaylistTrack(
      file,
      index,
      row.ref.trackId,
      filename,
    );
    if (loaded) {
      updatedTracks[i] = { ...row, playlistTrack: loaded, missing: false };
      changed = true;
    }
  }
  if (!changed) return album;
  const resolvedCount = updatedTracks.filter((t) => t.playlistTrack).length;
  return {
    ...album,
    tracks: updatedTracks,
    resolvedCount,
    missingCount: updatedTracks.length - resolvedCount,
    foundFiles: updatedTracks.filter((t) => t.playlistTrack).map((t) => t.ref.file),
    missingFiles: updatedTracks.filter((t) => !t.playlistTrack).map((t) => t.ref.file),
  };
}
