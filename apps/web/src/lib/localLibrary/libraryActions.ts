import type { PlaylistTrack } from "../../store/playerStore";
import { importMp5ToPlayer } from "../../player/playerImport";
import { openSavedAlbumInPlayer } from "../album/openSavedAlbum";
import { openSavedEmbeddedAlbumInPlayer } from "../album/openSavedEmbeddedAlbum";
import {
  saveMp5ToLibrary,
  libraryEntryToFile,
  loadLibraryEntry,
} from "./api";
import type { SaveToLibraryResult } from "./api";
import { downloadBlob } from "../performance/downloadBlob";
import {
  getSavedAlbum,
  savedAlbumToFile,
  type SavedAlbumPackage,
} from "./albumLibrary";
import {
  getEmbeddedAlbumBlob,
  getSavedEmbeddedAlbum,
  type SavedEmbeddedAlbumPackage,
} from "./embeddedAlbumLibrary";
import {
  recordRecentAlbumOpen,
  recordRecentTrackOpen,
} from "./recentLibrary";
import { manifestJsonByteSize } from "./albumCoverFromManifest";

export async function savePlaylistTrackToLibrary(track: PlaylistTrack): Promise<SaveToLibraryResult> {
  if (!track.file) {
    throw new Error("This track has no file data to save.");
  }
  return saveMp5ToLibrary(track.file, track.name, {
    allowUnreadable: !!track.parseError,
  });
}

export async function saveFileToLibrary(file: File): Promise<SaveToLibraryResult> {
  return saveMp5ToLibrary(file, file.name, { allowUnreadable: true });
}

export async function playLibraryEntry(id: string, opts?: { playFirst?: boolean }): Promise<void> {
  const entry = await loadLibraryEntry(id);
  if (!entry) throw new Error("Library track not found.");
  recordRecentTrackOpen({
    filename: entry.filename,
    title: entry.summary.title,
    artist: entry.summary.artist,
    album: entry.summary.album,
    sizeBytes: entry.fileSize,
    savedTrackId: entry.id,
  });
  const file = await libraryEntryToFile(entry);
  await importMp5ToPlayer([file], { playFirst: opts?.playFirst ?? true });
}

export async function addLibraryEntryToPlaylist(id: string): Promise<void> {
  const entry = await loadLibraryEntry(id);
  if (!entry) throw new Error("Library track not found.");
  recordRecentTrackOpen({
    filename: entry.filename,
    title: entry.summary.title,
    artist: entry.summary.artist,
    album: entry.summary.album,
    sizeBytes: entry.fileSize,
    savedTrackId: entry.id,
  });
  const file = await libraryEntryToFile(entry);
  await importMp5ToPlayer([file], { playFirst: false });
}

export function downloadLibraryEntry(entry: { data: ArrayBuffer; filename: string }): void {
  downloadBlob(new Blob([entry.data], { type: "audio/mp5" }), entry.filename);
}

export async function openManifestAlbumFromLibrary(
  savedId: string,
): Promise<{ saved: SavedAlbumPackage }> {
  const saved = getSavedAlbum(savedId);
  if (!saved) throw new Error("Saved album not found.");
  recordRecentAlbumOpen({
    manifest: saved.manifest,
    filename: saved.name,
    sizeBytes: manifestJsonByteSize(saved.manifest),
    packageType: "manifest",
    savedManifestAlbumId: saved.id,
  });
  await openSavedAlbumInPlayer(saved);
  return { saved };
}

export async function openEmbeddedAlbumFromLibrary(
  savedId: string,
): Promise<{ saved: SavedEmbeddedAlbumPackage }> {
  const saved = getSavedEmbeddedAlbum(savedId);
  if (!saved) throw new Error("Saved embedded album not found.");
  recordRecentAlbumOpen({
    manifest: saved.manifest,
    filename: saved.name,
    sizeBytes: saved.fileSize,
    packageType: "embedded",
    savedEmbeddedAlbumId: saved.id,
  });
  await openSavedEmbeddedAlbumInPlayer(saved);
  return { saved };
}

export async function downloadManifestAlbumPackage(savedId: string): Promise<void> {
  const saved = getSavedAlbum(savedId);
  if (!saved) throw new Error("Saved album not found.");
  const file = savedAlbumToFile(saved);
  downloadBlob(file, file.name);
}

export async function downloadEmbeddedAlbumPackage(savedId: string): Promise<void> {
  const saved = getSavedEmbeddedAlbum(savedId);
  if (!saved) throw new Error("Saved embedded album not found.");
  const file = await getEmbeddedAlbumBlob(saved);
  if (!file) throw new Error("Embedded package blob missing from local storage.");
  downloadBlob(file, file.name);
}

export async function reopenRecentLibraryItem(item: {
  trackRecordId?: string;
  manifestAlbumId?: string;
  embeddedAlbumId?: string;
}): Promise<void> {
  if (item.trackRecordId) {
    await playLibraryEntry(item.trackRecordId, { playFirst: true });
    return;
  }
  if (item.manifestAlbumId) {
    await openManifestAlbumFromLibrary(item.manifestAlbumId);
    return;
  }
  if (item.embeddedAlbumId) {
    await openEmbeddedAlbumFromLibrary(item.embeddedAlbumId);
    return;
  }
  throw new Error("This recent item cannot be reopened. Save it to your library or open the file again.");
}
