import type { AlbmPackageManifest } from "@mp5/container";
import { manifestToJson, parseAlbmPackageJson } from "@mp5/container";

const STORAGE_KEY = "mp5-saved-albums-v1";

export interface SavedAlbumPackage {
  id: string;
  name: string;
  importedAt: number;
  manifest: AlbmPackageManifest;
}

interface StoredPayload {
  version: 1;
  albums: SavedAlbumPackage[];
}

function readAll(): SavedAlbumPackage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as StoredPayload;
    if (data.version !== 1 || !Array.isArray(data.albums)) return [];
    return data.albums;
  } catch {
    return [];
  }
}

function writeAll(albums: SavedAlbumPackage[]): void {
  try {
    const payload: StoredPayload = { version: 1, albums };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
}

export function listSavedAlbums(): SavedAlbumPackage[] {
  return readAll().sort((a, b) => b.importedAt - a.importedAt);
}

export function saveAlbumPackage(
  manifest: AlbmPackageManifest,
  name: string,
): SavedAlbumPackage {
  const albums = readAll();
  const entry: SavedAlbumPackage = {
    id: crypto.randomUUID(),
    name: name || `${manifest.album.title}.mp5p`,
    importedAt: Date.now(),
    manifest,
  };
  albums.unshift(entry);
  writeAll(albums);
  return entry;
}

export function deleteSavedAlbum(id: string): void {
  writeAll(readAll().filter((a) => a.id !== id));
}

export function getSavedAlbum(id: string): SavedAlbumPackage | null {
  return readAll().find((a) => a.id === id) ?? null;
}

export function savedAlbumToFile(entry: SavedAlbumPackage): File {
  const json = manifestToJson(entry.manifest, true);
  return new File([json], entry.name.endsWith(".mp5p") ? entry.name : `${entry.name}.mp5p`, {
    type: "application/json",
  });
}

export function parseSavedAlbumManifest(json: string): AlbmPackageManifest | null {
  return parseAlbmPackageJson(json).manifest;
}
