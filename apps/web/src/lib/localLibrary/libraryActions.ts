import {
  detectMp5pPackageKind,
  indexEmbeddedAlbumPackage,
  parseAlbmPackageJson,
} from "@mp5/container";
import type { PlaylistTrack } from "../../store/playerStore";
import { importMp5ToPlayer } from "../../player/playerImport";
import { isAlbumPackageFileName } from "../album/createAlbumPackage";
import { openSavedAlbumInPlayer } from "../album/openSavedAlbum";
import { openSavedEmbeddedAlbumInPlayer } from "../album/openSavedEmbeddedAlbum";
import {
  saveMp5ToLibrary,
  libraryEntryToFile,
  loadLibraryEntry,
} from "./api";
import type { LibraryPersistResult } from "./api";
import { downloadBlob } from "../performance/downloadBlob";
import {
  getSavedAlbum,
  saveAlbumPackage,
  savedAlbumToFile,
  type SavedAlbumPackage,
} from "./albumLibrary";
import {
  getEmbeddedAlbumBlob,
  getSavedEmbeddedAlbum,
  saveEmbeddedAlbumPackage,
  type SavedEmbeddedAlbumPackage,
} from "./embeddedAlbumLibrary";
import {
  recordRecentAlbumOpen,
  recordRecentTrackOpen,
} from "./recentLibrary";
import { manifestJsonByteSize } from "./albumCoverFromManifest";
import { isMp5FileName } from "../../player/playlistUtils";
import { LibraryStorageError } from "./errors";

export type LibraryImportResult =
  | { kind: "track"; result: LibraryPersistResult }
  | { kind: "manifest"; saved: SavedAlbumPackage }
  | { kind: "embedded"; saved: SavedEmbeddedAlbumPackage };

export async function savePlaylistTrackToLibrary(track: PlaylistTrack): Promise<LibraryPersistResult> {
  if (!track.file) {
    throw new Error("This track has no file data to save.");
  }
  return saveMp5ToLibrary(track.file, track.name, {
    allowUnreadable: !!track.parseError,
  });
}

export async function saveFileToLibrary(file: File): Promise<LibraryPersistResult> {
  return saveMp5ToLibrary(file, file.name, { allowUnreadable: true });
}

/** Import .mp5 track or .mp5p album package into the local library. */
export async function importLibraryFile(file: File): Promise<LibraryImportResult> {
  if (isMp5FileName(file.name)) {
    return { kind: "track", result: await saveFileToLibrary(file) };
  }
  if (!isAlbumPackageFileName(file.name)) {
    throw new LibraryStorageError("Only .mp5 and .mp5p files can be added to the library.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectMp5pPackageKind(bytes);

  if (kind === "embedded-binary") {
    const index = indexEmbeddedAlbumPackage(bytes);
    const saved = await saveEmbeddedAlbumPackage(file, index.manifest);
    return { kind: "embedded", saved };
  }

  if (kind === "json-manifest") {
    const text = new TextDecoder().decode(bytes);
    const { manifest, errors } = parseAlbmPackageJson(text);
    if (!manifest) {
      throw new LibraryStorageError(errors[0]?.message ?? "Invalid album manifest (.mp5p).");
    }
    const saved = saveAlbumPackage(manifest, file.name);
    return { kind: "manifest", saved };
  }

  throw new LibraryStorageError("Unrecognized .mp5p package (expected manifest JSON or embedded album).");
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
