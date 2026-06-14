import { describe, it, expect, beforeEach, vi } from "vitest";
import { ALBUM_MANIFEST_FORMAT, EMBEDDED_ALBUM_MANIFEST_FORMAT } from "@mp5/container";
import {
  clearRecentLibrary,
  listRecentLibraryEntries,
  recordRecentTrackOpen,
  removeRecentLibraryEntry,
} from "../apps/web/src/lib/localLibrary/recentLibrary";
import {
  filterAndSortUnifiedLibraryItems,
  isLargePackageItem,
  matchesUnifiedLibraryKind,
  matchesUnifiedLibraryQuery,
  packageBadgeLabel,
} from "../apps/web/src/lib/localLibrary/unifiedLibrarySearch";
import { isEmbeddedAlbumBlobRecord, listUnifiedLibraryItems } from "../apps/web/src/lib/localLibrary/unifiedLibrary";
import { albumCoverDataUrlFromManifest, albumDurationMsFromManifest } from "../apps/web/src/lib/localLibrary/albumCoverFromManifest";
import type { UnifiedLibraryItem } from "../apps/web/src/lib/localLibrary/unifiedLibraryTypes";
import { MemoryLibraryStore } from "../apps/web/src/lib/localLibrary/memoryStore";
import { resetLibraryStore, setLibraryStoreForTests } from "../apps/web/src/lib/localLibrary/store";
import { saveMp5ToLibrary, clearLocalLibrary } from "../apps/web/src/lib/localLibrary/api";
import { saveAlbumPackage } from "../apps/web/src/lib/localLibrary/albumLibrary";

function trackItem(overrides: Partial<UnifiedLibraryItem> = {}): UnifiedLibraryItem {
  return {
    id: "track:1",
    type: "track",
    packageType: "none",
    source: "saved",
    title: "Alpha",
    artist: "Artist A",
    album: "Album A",
    filename: "alpha.mp5",
    durationMs: 120000,
    trackCount: 1,
    sizeBytes: 1000,
    addedAt: 100,
    lastOpenedAt: null,
    integrityStatus: "ok",
    storageLocation: "indexedDB",
    warnings: [],
    canReopen: true,
    ...overrides,
  };
}

describe("unified library search", () => {
  it("matches query across title artist album filename", () => {
    const item = trackItem();
    expect(matchesUnifiedLibraryQuery(item, "alpha")).toBe(true);
    expect(matchesUnifiedLibraryQuery(item, "artist a")).toBe(true);
    expect(matchesUnifiedLibraryQuery(item, "nomatch")).toBe(false);
  });

  it("filters by kind", () => {
    const track = trackItem();
    const album = trackItem({ id: "manifest:1", type: "album", packageType: "manifest", source: "saved" });
    const recent = trackItem({ id: "recent:1", source: "recent" });
    expect(matchesUnifiedLibraryKind(track, "tracks")).toBe(true);
    expect(matchesUnifiedLibraryKind(album, "albums")).toBe(true);
    expect(matchesUnifiedLibraryKind(recent, "recent")).toBe(true);
    expect(matchesUnifiedLibraryKind(track, "albums")).toBe(false);
  });

  it("sorts by title and size", () => {
    const a = trackItem({ title: "Beta", sizeBytes: 50 });
    const b = trackItem({ id: "track:2", title: "Alpha", sizeBytes: 200 });
    const byTitle = filterAndSortUnifiedLibraryItems([a, b], { query: "", kind: "all", sort: "title-asc" });
    expect(byTitle[0]?.title).toBe("Alpha");
    const bySize = filterAndSortUnifiedLibraryItems([a, b], { query: "", kind: "all", sort: "size-desc" });
    expect(bySize[0]?.sizeBytes).toBe(200);
  });

  it("labels package badges", () => {
    expect(packageBadgeLabel(trackItem())).toBe(".mp5");
    expect(packageBadgeLabel(trackItem({ type: "album", packageType: "manifest" }))).toBe("manifest .mp5p");
    expect(packageBadgeLabel(trackItem({ type: "album", packageType: "embedded", sizeBytes: 60 * 1024 * 1024 }))).toBe(
      "embedded .mp5p",
    );
    expect(isLargePackageItem(trackItem({ type: "album", packageType: "embedded", sizeBytes: 60 * 1024 * 1024 }))).toBe(
      true,
    );
  });
});

describe("recent library", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this.store[k] = v;
      },
      removeItem(k: string) {
        delete this.store[k];
      },
    });
    clearRecentLibrary();
  });

  it("stores metadata only and can remove entries", () => {
    recordRecentTrackOpen({
      filename: "x.mp5",
      title: "X",
      artist: "Y",
      album: "",
      sizeBytes: 10,
    });
    expect(listRecentLibraryEntries()).toHaveLength(1);
    const id = listRecentLibraryEntries()[0]!.id;
    removeRecentLibraryEntry(id);
    expect(listRecentLibraryEntries()).toHaveLength(0);
  });
});

describe("unified library normalization", () => {
  beforeEach(async () => {
    vi.stubGlobal("localStorage", {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this.store[k] = v;
      },
      removeItem(k: string) {
        delete this.store[k];
      },
    });
    resetLibraryStore();
    setLibraryStoreForTests(new MemoryLibraryStore());
    await clearLocalLibrary();
    clearRecentLibrary();
  });

  it("excludes embedded blob rows from saved tracks", async () => {
    const manifest = {
      format: EMBEDDED_ALBUM_MANIFEST_FORMAT,
      album: { title: "Embedded Demo", artist: "Band" },
      tracks: [{ trackId: "1", file: "a.mp5", trackNumber: 1 }],
    } as const;
    const blobEntryId = "blob-id";
    const store = new MemoryLibraryStore();
    setLibraryStoreForTests(store);
    await store.putEntry({
      id: blobEntryId,
      filename: "pkg.mp5p",
      importedAt: Date.now(),
      fileSize: 5000,
      summary: {
        title: "Embedded Demo",
        artist: "Band",
        album: "Embedded Demo",
        genre: "",
        durationSec: null,
        codecLabel: "embedded .mp5p",
        moodTags: [],
        vibeTags: [],
        hasContentGuidance: false,
        contentGuidanceSummary: "",
        hasCoverArt: false,
        hasLyrics: false,
        hasStems: false,
        stemCount: 0,
        formatWarnings: [],
      },
      data: new ArrayBuffer(5000),
    });
    localStorage.setItem(
      "mp5-saved-embedded-albums-v1",
      JSON.stringify({
        version: 1,
        albums: [
          {
            id: "emb-1",
            name: "pkg.mp5p",
            importedAt: Date.now(),
            fileSize: 5000,
            manifest,
            blobEntryId,
          },
        ],
      }),
    );

    const records = await store.listRecords();
    expect(isEmbeddedAlbumBlobRecord(records[0]!, new Set([blobEntryId]))).toBe(true);

    const items = await listUnifiedLibraryItems();
    const tracks = items.filter((i) => i.type === "track" && i.source === "saved");
    expect(tracks).toHaveLength(0);
    const albums = items.filter((i) => i.type === "album" && i.packageType === "embedded");
    expect(albums).toHaveLength(1);
    expect(albums[0]?.sizeBytes).toBe(5000);
  });

  it("uses manifest cover and duration without parsing blobs", () => {
    const manifest = {
      format: ALBUM_MANIFEST_FORMAT,
      album: {
        title: "Cover Album",
        artist: "A",
        cover: { type: "embedded" as const, mime: "image/png", dataBase64: "abc" },
      },
      tracks: [{ trackId: "1", file: "a.mp5", trackNumber: 1, durationMs: 1000 }],
    };
    expect(albumCoverDataUrlFromManifest(manifest)).toBe("data:image/png;base64,abc");
    expect(albumDurationMsFromManifest(manifest)).toBe(1000);
  });
});
