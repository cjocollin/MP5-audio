import type { AlbmPackageManifest } from "@mp5/container";
import { indexEmbeddedAlbumPackage } from "@mp5/container";
import { getLibraryStore } from "./store";
import type { LocalLibraryEntry } from "./types";

const METADATA_KEY = "mp5-saved-embedded-albums-v1";

export interface SavedEmbeddedAlbumPackage {
  id: string;
  name: string;
  importedAt: number;
  fileSize: number;
  manifest: AlbmPackageManifest;
  /** IndexedDB entry id holding the full .mp5p blob. */
  blobEntryId: string;
}

interface StoredPayload {
  version: 1;
  albums: SavedEmbeddedAlbumPackage[];
}

function readMeta(): SavedEmbeddedAlbumPackage[] {
  try {
    const raw = localStorage.getItem(METADATA_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as StoredPayload;
    if (data.version !== 1 || !Array.isArray(data.albums)) return [];
    return data.albums;
  } catch {
    return [];
  }
}

function writeMeta(albums: SavedEmbeddedAlbumPackage[]): void {
  try {
    const payload: StoredPayload = { version: 1, albums };
    localStorage.setItem(METADATA_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function listSavedEmbeddedAlbums(): SavedEmbeddedAlbumPackage[] {
  return readMeta().sort((a, b) => b.importedAt - a.importedAt);
}

/** Save self-contained embedded .mp5p to IndexedDB; metadata in localStorage. */
export async function saveEmbeddedAlbumPackage(
  file: File,
  manifest: AlbmPackageManifest,
): Promise<SavedEmbeddedAlbumPackage> {
  const data = await file.arrayBuffer();
  const id = crypto.randomUUID();
  const entry: LocalLibraryEntry = {
    id,
    filename: file.name,
    importedAt: Date.now(),
    fileSize: data.byteLength,
    summary: {
      title: manifest.album.title,
      artist: manifest.album.albumArtist ?? manifest.album.artist ?? "",
      album: manifest.album.title,
      genre: manifest.album.genre ?? "",
      durationSec: null,
      codecLabel: "embedded .mp5p",
      moodTags: [],
      vibeTags: [],
      hasContentGuidance: false,
      contentGuidanceSummary: "",
      hasCoverArt: !!manifest.album.cover,
      hasLyrics: false,
      hasStems: false,
      stemCount: 0,
      formatWarnings: ["Embedded album package — tracks load on demand"],
    },
    data,
  };
  await getLibraryStore().putEntry(entry);
  const albums = readMeta();
  const saved: SavedEmbeddedAlbumPackage = {
    id: crypto.randomUUID(),
    name: file.name,
    importedAt: Date.now(),
    fileSize: data.byteLength,
    manifest,
    blobEntryId: id,
  };
  albums.unshift(saved);
  writeMeta(albums);
  return saved;
}

export async function getEmbeddedAlbumBlob(entry: SavedEmbeddedAlbumPackage): Promise<File | null> {
  const stored = await getLibraryStore().getEntry(entry.blobEntryId);
  if (!stored) return null;
  return new File([stored.data], entry.name, { type: "application/octet-stream" });
}

export function deleteSavedEmbeddedAlbum(id: string): void {
  const albums = readMeta();
  const target = albums.find((a) => a.id === id);
  writeMeta(albums.filter((a) => a.id !== id));
  if (target) {
    void getLibraryStore().deleteEntry(target.blobEntryId);
  }
}

export function getSavedEmbeddedAlbum(id: string): SavedEmbeddedAlbumPackage | null {
  return readMeta().find((a) => a.id === id) ?? null;
}

export async function indexSavedEmbeddedAlbum(
  entry: SavedEmbeddedAlbumPackage,
): Promise<{ file: File; index: ReturnType<typeof indexEmbeddedAlbumPackage> } | null> {
  const file = await getEmbeddedAlbumBlob(entry);
  if (!file) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { file, index: indexEmbeddedAlbumPackage(bytes) };
}
