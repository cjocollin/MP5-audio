import { listSavedAlbums } from "./albumLibrary";
import { listSavedEmbeddedAlbums } from "./embeddedAlbumLibrary";
import { getLibraryStorageInfo, listLibraryRecords } from "./api";
import { isEmbeddedAlbumBlobRecord } from "./unifiedLibrary";
import { manifestJsonByteSize } from "./albumCoverFromManifest";
import { listRecentLibraryEntries } from "./recentLibrary";
import type { LibraryStorageStats } from "./unifiedLibraryTypes";

export async function computeLibraryStorageStats(): Promise<LibraryStorageStats> {
  const [records, storage] = await Promise.all([listLibraryRecords(), getLibraryStorageInfo()]);
  const embeddedAlbums = listSavedEmbeddedAlbums();
  const embeddedBlobIds = new Set(embeddedAlbums.map((a) => a.blobEntryId));
  const tracks = records.filter((r) => !isEmbeddedAlbumBlobRecord(r, embeddedBlobIds));
  const manifestAlbums = listSavedAlbums();
  const recents = listRecentLibraryEntries();

  const trackBytes = tracks.reduce((n, r) => n + r.fileSize, 0);
  const embeddedBytes = embeddedAlbums.reduce((n, a) => n + a.fileSize, 0);
  const manifestBytes = manifestAlbums.reduce((n, a) => n + manifestJsonByteSize(a.manifest), 0);

  return {
    savedTrackCount: tracks.length,
    savedManifestAlbumCount: manifestAlbums.length,
    savedEmbeddedAlbumCount: embeddedAlbums.length,
    recentCount: recents.length,
    knownBytes: trackBytes + embeddedBytes + manifestBytes,
    browserUsedBytes: storage.usageSupported ? storage.usedBytes : null,
    browserQuotaBytes: storage.quotaBytes,
    quotaSupported: storage.usageSupported,
  };
}
