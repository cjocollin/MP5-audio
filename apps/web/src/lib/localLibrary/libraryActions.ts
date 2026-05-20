import type { PlaylistTrack } from "../../store/playerStore";
import { importMp5ToPlayer } from "../../player/playerImport";
import { saveMp5ToLibrary, libraryEntryToFile, loadLibraryEntry } from "./api";
import type { SaveToLibraryResult } from "./api";

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
  const blob = new Blob([entry.data], { type: "audio/mp5" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = entry.filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
