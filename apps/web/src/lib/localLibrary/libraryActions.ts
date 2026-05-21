import type { PlaylistTrack } from "../../store/playerStore";
import { importMp5ToPlayer } from "../../player/playerImport";
import { saveMp5ToLibrary, libraryEntryToFile, loadLibraryEntry } from "./api";
import type { SaveToLibraryResult } from "./api";
import { downloadBlob } from "../performance/downloadBlob";

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
  const file = await libraryEntryToFile(entry);
  await importMp5ToPlayer([file], { playFirst: opts?.playFirst ?? true });
}

export async function addLibraryEntryToPlaylist(id: string): Promise<void> {
  const entry = await loadLibraryEntry(id);
  if (!entry) throw new Error("Library track not found.");
  const file = await libraryEntryToFile(entry);
  await importMp5ToPlayer([file], { playFirst: false });
}

export function downloadLibraryEntry(entry: { data: ArrayBuffer; filename: string }): void {
  downloadBlob(new Blob([entry.data], { type: "audio/mp5" }), entry.filename);
}
