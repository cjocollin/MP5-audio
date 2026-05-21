/** Metadata summary stored alongside each library entry (no full parse required to list). */
export interface LibraryMetadataSummary {
  title: string;
  artist: string;
  album: string;
  genre: string;
  durationSec: number | null;
  codecLabel: string;
  moodTags: string[];
  vibeTags: string[];
  hasContentGuidance: boolean;
  contentGuidanceSummary: string;
  hasCoverArt: boolean;
  hasLyrics: boolean;
  hasStems: boolean;
  stemCount: number;
  formatWarnings: string[];
  parseError?: string;
  /** PCM or AUDI fingerprint identity for duplicate detection. */
  fingerprintKey?: string;
  hasFingerprint?: boolean;
}

export interface LocalLibraryRecord {
  id: string;
  filename: string;
  importedAt: number;
  fileSize: number;
  summary: LibraryMetadataSummary;
  /** JPEG/PNG thumbnail bytes when cover art is present and reasonably sized. */
  coverThumbnail?: Uint8Array;
  coverMime?: string;
}

export interface LocalLibraryEntry extends LocalLibraryRecord {
  /** Raw MP5 bytes — loaded on demand for playback/download. */
  data: ArrayBuffer;
}

export type LibraryCodecFilter = "all" | "mp5l" | "mp5c" | "mp5h" | "pcm" | "other";

export interface LibrarySearchFilters {
  query: string;
  codec: LibraryCodecFilter;
  contentGuidanceOnly: boolean;
  hasCoverOnly: boolean;
  hasLyricsOnly: boolean;
}

export interface StorageQuotaInfo {
  usedBytes: number;
  quotaBytes: number | null;
  usageSupported: boolean;
}
