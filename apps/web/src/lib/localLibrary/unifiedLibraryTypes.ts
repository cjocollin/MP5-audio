/** App-level library item — not persisted as a single store; normalized from tracks/albums/recents. */
export type UnifiedLibraryItemType = "track" | "album";
export type UnifiedPackageType = "none" | "manifest" | "embedded";
export type UnifiedLibrarySource = "saved" | "recent";
export type UnifiedStorageLocation = "indexedDB" | "localStorage" | "memory" | "fileHandle";
export type UnifiedIntegrityStatus = "ok" | "unknown" | "unreadable";

export interface UnifiedLibraryItem {
  id: string;
  type: UnifiedLibraryItemType;
  packageType: UnifiedPackageType;
  source: UnifiedLibrarySource;
  title: string;
  artist: string;
  album: string;
  year?: string;
  genre?: string;
  filename: string;
  coverThumbnail?: Uint8Array;
  coverMime?: string;
  coverDataUrl?: string;
  durationMs: number | null;
  trackCount: number;
  sizeBytes: number;
  addedAt: number;
  lastOpenedAt: number | null;
  integrityStatus: UnifiedIntegrityStatus;
  storageLocation: UnifiedStorageLocation;
  warnings: string[];
  trackRecordId?: string;
  manifestAlbumId?: string;
  embeddedAlbumId?: string;
  recentId?: string;
  canReopen: boolean;
  reopenHint?: string;
  codecLabel?: string;
  hasContentGuidance?: boolean;
  hasStems?: boolean;
  stemCount?: number;
  hasCoverArt?: boolean;
  hasLyrics?: boolean;
}

export type LibraryKindFilter =
  | "all"
  | "tracks"
  | "albums"
  | "embedded"
  | "manifest"
  | "recent";

export type LibrarySortOption =
  | "added-desc"
  | "opened-desc"
  | "title-asc"
  | "artist-asc"
  | "size-desc"
  | "duration-desc";

export interface UnifiedLibraryFilters {
  query: string;
  kind: LibraryKindFilter;
  sort: LibrarySortOption;
}

export interface LibraryStorageStats {
  savedTrackCount: number;
  savedManifestAlbumCount: number;
  savedEmbeddedAlbumCount: number;
  recentCount: number;
  knownBytes: number;
  browserUsedBytes: number | null;
  browserQuotaBytes: number | null;
  quotaSupported: boolean;
}
