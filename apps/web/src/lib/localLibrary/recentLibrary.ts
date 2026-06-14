import type { AlbmPackageManifest } from "@mp5/container";
import type { UnifiedPackageType } from "./unifiedLibraryTypes";

const STORAGE_KEY = "mp5-recent-library-v1";
const MAX_RECENTS = 24;

export interface RecentLibraryEntry {
  id: string;
  type: "track" | "album";
  packageType: UnifiedPackageType;
  title: string;
  artist: string;
  album: string;
  filename: string;
  sizeBytes: number;
  openedAt: number;
  savedTrackId?: string;
  savedManifestAlbumId?: string;
  savedEmbeddedAlbumId?: string;
}

interface StoredPayload {
  version: 1;
  items: RecentLibraryEntry[];
}

function readAll(): RecentLibraryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as StoredPayload;
    if (data.version !== 1 || !Array.isArray(data.items)) return [];
    return data.items;
  } catch {
    return [];
  }
}

function writeAll(items: RecentLibraryEntry[]): void {
  try {
    const payload: StoredPayload = { version: 1, items: items.slice(0, MAX_RECENTS) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
}

export function listRecentLibraryEntries(): RecentLibraryEntry[] {
  return readAll().sort((a, b) => b.openedAt - a.openedAt);
}

export function clearRecentLibrary(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function removeRecentLibraryEntry(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
}

function upsert(entry: Omit<RecentLibraryEntry, "id" | "openedAt"> & { id?: string }): RecentLibraryEntry {
  const items = readAll();
  const now = Date.now();
  const matchIdx = items.findIndex((e) => {
    if (entry.savedTrackId && e.savedTrackId === entry.savedTrackId) return true;
    if (entry.savedManifestAlbumId && e.savedManifestAlbumId === entry.savedManifestAlbumId) return true;
    if (entry.savedEmbeddedAlbumId && e.savedEmbeddedAlbumId === entry.savedEmbeddedAlbumId) return true;
    return (
      !entry.savedTrackId &&
      !entry.savedManifestAlbumId &&
      !entry.savedEmbeddedAlbumId &&
      e.filename === entry.filename &&
      e.sizeBytes === entry.sizeBytes
    );
  });
  const record: RecentLibraryEntry = {
    id: entry.id ?? (matchIdx >= 0 ? items[matchIdx]!.id : crypto.randomUUID()),
    type: entry.type,
    packageType: entry.packageType,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    filename: entry.filename,
    sizeBytes: entry.sizeBytes,
    openedAt: now,
    savedTrackId: entry.savedTrackId,
    savedManifestAlbumId: entry.savedManifestAlbumId,
    savedEmbeddedAlbumId: entry.savedEmbeddedAlbumId,
  };
  const next = matchIdx >= 0 ? items.filter((_, i) => i !== matchIdx) : items;
  writeAll([record, ...next]);
  return record;
}

export function recordRecentTrackOpen(opts: {
  filename: string;
  title: string;
  artist: string;
  album: string;
  sizeBytes: number;
  savedTrackId?: string;
}): RecentLibraryEntry {
  return upsert({
    type: "track",
    packageType: "none",
    title: opts.title || opts.filename,
    artist: opts.artist,
    album: opts.album,
    filename: opts.filename,
    sizeBytes: opts.sizeBytes,
    savedTrackId: opts.savedTrackId,
  });
}

export function recordRecentAlbumOpen(opts: {
  manifest: AlbmPackageManifest;
  filename: string;
  sizeBytes: number;
  packageType: "manifest" | "embedded";
  savedManifestAlbumId?: string;
  savedEmbeddedAlbumId?: string;
}): RecentLibraryEntry {
  const { manifest } = opts;
  return upsert({
    type: "album",
    packageType: opts.packageType,
    title: manifest.album.title,
    artist: manifest.album.albumArtist ?? manifest.album.artist ?? "",
    album: manifest.album.title,
    filename: opts.filename,
    sizeBytes: opts.sizeBytes,
    savedManifestAlbumId: opts.savedManifestAlbumId,
    savedEmbeddedAlbumId: opts.savedEmbeddedAlbumId,
  });
}

export function recordRecentFileOpen(file: File, meta?: { title?: string; artist?: string; album?: string }): RecentLibraryEntry {
  const lower = file.name.toLowerCase();
  const isAlbum = lower.endsWith(".mp5p");
  return upsert({
    type: isAlbum ? "album" : "track",
    packageType: isAlbum ? "manifest" : "none",
    title: meta?.title || file.name,
    artist: meta?.artist ?? "",
    album: meta?.album ?? "",
    filename: file.name,
    sizeBytes: file.size,
  });
}
