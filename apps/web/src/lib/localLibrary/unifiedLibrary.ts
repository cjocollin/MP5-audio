import { listSavedAlbums, type SavedAlbumPackage } from "./albumLibrary";
import { listSavedEmbeddedAlbums, type SavedEmbeddedAlbumPackage } from "./embeddedAlbumLibrary";
import { listLibraryRecords } from "./api";
import type { LocalLibraryRecord } from "./types";
import {
  albumCoverDataUrlFromManifest,
  albumDurationMsFromManifest,
  manifestJsonByteSize,
} from "./albumCoverFromManifest";
import { listRecentLibraryEntries, type RecentLibraryEntry } from "./recentLibrary";
import type { UnifiedLibraryItem } from "./unifiedLibraryTypes";

const LARGE_PACKAGE_BYTES = 50 * 1024 * 1024;

export function isEmbeddedAlbumBlobRecord(
  record: LocalLibraryRecord,
  embeddedBlobIds: Set<string>,
): boolean {
  return embeddedBlobIds.has(record.id) || record.summary.codecLabel === "embedded .mp5p";
}

function trackIntegrity(record: LocalLibraryRecord): UnifiedLibraryItem["integrityStatus"] {
  if (record.summary.parseError) return "unreadable";
  return "ok";
}

function normalizeSavedTrack(
  record: LocalLibraryRecord,
  lastOpenedAt: number | null,
): UnifiedLibraryItem {
  const s = record.summary;
  const durationMs = s.durationSec != null ? Math.round(s.durationSec * 1000) : null;
  return {
    id: `track:${record.id}`,
    type: "track",
    packageType: "none",
    source: "saved",
    title: s.title || record.filename,
    artist: s.artist || "Unknown artist",
    album: s.album,
    genre: s.genre || undefined,
    filename: record.filename,
    coverThumbnail: record.coverThumbnail,
    coverMime: record.coverMime,
    durationMs,
    trackCount: 1,
    sizeBytes: record.fileSize,
    addedAt: record.importedAt,
    lastOpenedAt,
    integrityStatus: trackIntegrity(record),
    storageLocation: "indexedDB",
    warnings: s.formatWarnings ?? [],
    trackRecordId: record.id,
    canReopen: true,
    codecLabel: s.codecLabel,
    hasContentGuidance: s.hasContentGuidance,
    hasStems: s.hasStems,
    stemCount: s.stemCount,
    hasCoverArt: s.hasCoverArt,
    hasLyrics: s.hasLyrics,
    moodTags: s.moodTags,
    vibeTags: s.vibeTags,
  };
}

function normalizeManifestAlbum(saved: SavedAlbumPackage, lastOpenedAt: number | null): UnifiedLibraryItem {
  const { manifest } = saved;
  const artist = manifest.album.albumArtist ?? manifest.album.artist ?? "";
  return {
    id: `manifest:${saved.id}`,
    type: "album",
    packageType: "manifest",
    source: "saved",
    title: manifest.album.title,
    artist: artist || "Unknown artist",
    album: manifest.album.title,
    year: manifest.album.year,
    genre: manifest.album.genre,
    filename: saved.name,
    coverDataUrl: albumCoverDataUrlFromManifest(manifest),
    durationMs: albumDurationMsFromManifest(manifest),
    trackCount: manifest.tracks.length,
    sizeBytes: manifestJsonByteSize(manifest),
    addedAt: saved.importedAt,
    lastOpenedAt,
    integrityStatus: "unknown",
    storageLocation: "localStorage",
    warnings: ["Manifest album — sidecar .mp5 tracks must stay in library"],
    manifestAlbumId: saved.id,
    canReopen: true,
  };
}

function normalizeEmbeddedAlbum(
  saved: SavedEmbeddedAlbumPackage,
  lastOpenedAt: number | null,
): UnifiedLibraryItem {
  const { manifest } = saved;
  const artist = manifest.album.albumArtist ?? manifest.album.artist ?? "";
  const warnings = ["Embedded package stored locally in this browser"];
  if (saved.fileSize >= LARGE_PACKAGE_BYTES) {
    warnings.push("Large package — may use significant storage");
  }
  return {
    id: `embedded:${saved.id}`,
    type: "album",
    packageType: "embedded",
    source: "saved",
    title: manifest.album.title,
    artist: artist || "Unknown artist",
    album: manifest.album.title,
    year: manifest.album.year,
    genre: manifest.album.genre,
    filename: saved.name,
    coverDataUrl: albumCoverDataUrlFromManifest(manifest),
    durationMs: albumDurationMsFromManifest(manifest),
    trackCount: manifest.tracks.length,
    sizeBytes: saved.fileSize,
    addedAt: saved.importedAt,
    lastOpenedAt,
    integrityStatus: "unknown",
    storageLocation: "indexedDB",
    warnings,
    embeddedAlbumId: saved.id,
    canReopen: true,
  };
}

function normalizeRecent(
  recent: RecentLibraryEntry,
  savedIds: {
    trackIds: Set<string>;
    manifestIds: Set<string>;
    embeddedIds: Set<string>;
  },
): UnifiedLibraryItem {
  const hasSavedLink =
    (recent.savedTrackId && savedIds.trackIds.has(recent.savedTrackId)) ||
    (recent.savedManifestAlbumId && savedIds.manifestIds.has(recent.savedManifestAlbumId)) ||
    (recent.savedEmbeddedAlbumId && savedIds.embeddedIds.has(recent.savedEmbeddedAlbumId));

  const canReopen = hasSavedLink;
  const reopenHint = canReopen
    ? undefined
    : "This item was opened from a file picker. Re-open the original file or save it to your library first.";

  return {
    id: `recent:${recent.id}`,
    type: recent.type,
    packageType: recent.packageType,
    source: "recent",
    title: recent.title,
    artist: recent.artist || "Unknown artist",
    album: recent.album,
    filename: recent.filename,
    durationMs: null,
    trackCount: recent.type === "album" ? 0 : 1,
    sizeBytes: recent.sizeBytes,
    addedAt: recent.openedAt,
    lastOpenedAt: recent.openedAt,
    integrityStatus: "unknown",
    storageLocation: "memory",
    warnings: canReopen ? [] : ["Not saved — metadata only"],
    recentId: recent.id,
    trackRecordId: recent.savedTrackId,
    manifestAlbumId: recent.savedManifestAlbumId,
    embeddedAlbumId: recent.savedEmbeddedAlbumId,
    canReopen: !!canReopen,
    reopenHint,
  };
}

function lastOpenedMap(recents: RecentLibraryEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of recents) {
    if (r.savedTrackId) map.set(`track:${r.savedTrackId}`, r.openedAt);
    if (r.savedManifestAlbumId) map.set(`manifest:${r.savedManifestAlbumId}`, r.openedAt);
    if (r.savedEmbeddedAlbumId) map.set(`embedded:${r.savedEmbeddedAlbumId}`, r.openedAt);
  }
  return map;
}

/** List all library items without loading embedded blobs or re-parsing MP5 bytes. */
export async function listUnifiedLibraryItems(): Promise<UnifiedLibraryItem[]> {
  const [records, recents] = await Promise.all([listLibraryRecords(), Promise.resolve(listRecentLibraryEntries())]);
  const manifestAlbums = listSavedAlbums();
  const embeddedAlbums = listSavedEmbeddedAlbums();
  const embeddedBlobIds = new Set(embeddedAlbums.map((a) => a.blobEntryId));
  const opened = lastOpenedMap(recents);

  const savedTrackIds = new Set<string>();
  const items: UnifiedLibraryItem[] = [];

  for (const record of records) {
    if (isEmbeddedAlbumBlobRecord(record, embeddedBlobIds)) continue;
    savedTrackIds.add(record.id);
    items.push(normalizeSavedTrack(record, opened.get(`track:${record.id}`) ?? null));
  }

  const manifestIds = new Set(manifestAlbums.map((a) => a.id));
  for (const saved of manifestAlbums) {
    items.push(normalizeManifestAlbum(saved, opened.get(`manifest:${saved.id}`) ?? null));
  }

  const embeddedIds = new Set(embeddedAlbums.map((a) => a.id));
  for (const saved of embeddedAlbums) {
    items.push(normalizeEmbeddedAlbum(saved, opened.get(`embedded:${saved.id}`) ?? null));
  }

  const savedIds = { trackIds: savedTrackIds, manifestIds, embeddedIds };
  for (const recent of recents) {
    items.push(normalizeRecent(recent, savedIds));
  }

  return items;
}

export function groupUnifiedLibraryItems(items: UnifiedLibraryItem[]): {
  recent: UnifiedLibraryItem[];
  tracks: UnifiedLibraryItem[];
  albums: UnifiedLibraryItem[];
} {
  return {
    recent: items.filter((i) => i.source === "recent"),
    tracks: items.filter((i) => i.type === "track" && i.source === "saved"),
    albums: items.filter((i) => i.type === "album" && i.source === "saved"),
  };
}
