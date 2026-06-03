import { describe, it, expect } from "vitest";
import {
  inferTrackNumberFromFilename,
  inferTitleFromFilename,
  inferAlbumNameFromFiles,
  initTrackMetaFromSource,
  sortItemIdsByTrackNumber,
  sortItemIdsByFilename,
  moveInOrder,
  trackMetaToManualEdits,
  batchOutputFilenameForTrack,
  emptyAlbumMeta,
} from "../apps/web/src/lib/album/batchAlbumMetadata";
import {
  computeBatchAlbumPreview,
  batchItemsToPlaylistTracks,
} from "../apps/web/src/lib/album/buildAlbumFromBatchItems";
import type { BatchQueueItem } from "../apps/web/src/converter/batchTypes";
import { createAlbumManifestFromTracks } from "../apps/web/src/lib/album/createAlbumPackage";
import {
  indexEmbeddedAlbumPackage,
  verifyEmbeddedPackageIntegrity,
  writeEmbeddedAlbumPackage,
} from "@mp5/container";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function mockFile(name: string, rel?: string): File {
  const f = new File([new Uint8Array(8)], name, { type: "audio/wav" });
  if (rel) {
    Object.defineProperty(f, "webkitRelativePath", { value: rel });
  }
  return f;
}

function mockItem(
  id: string,
  name: string,
  status: BatchQueueItem["status"] = "pending",
): BatchQueueItem {
  return {
    id,
    sourceName: name,
    sourceSize: 8,
    file: mockFile(name),
    status,
  };
}

describe("batch album metadata inference", () => {
  it("infers track number from filename prefixes", () => {
    expect(inferTrackNumberFromFilename("01 - Intro.wav")).toBe(1);
    expect(inferTrackNumberFromFilename("12.Song.flac")).toBe(12);
    expect(inferTrackNumberFromFilename("plain.wav")).toBeUndefined();
  });

  it("infers title from filename when tags missing", () => {
    expect(inferTitleFromFilename("03 - Neon Drive.mp3")).toBe("Neon Drive");
    expect(inferTitleFromFilename("plain.wav")).toBe("plain");
  });

  it("infers album name from folder drop path", () => {
    const files = [mockFile("a.wav", "Summer Demo/01-a.wav")];
    expect(inferAlbumNameFromFiles(files)).toBe("Summer Demo");
  });

  it("initTrackMeta uses source tags without inventing", () => {
    const album = emptyAlbumMeta();
    album.title = "Batch Album";
    const item = mockItem("1", "02 - Beta.wav");
    const meta = initTrackMetaFromSource(item, {
      meta: { title: "Tagged", artist: "Artist A", tracknumber: "2" },
    }, album);
    expect(meta.title).toBe("Tagged");
    expect(meta.artist).toBe("Artist A");
    expect(meta.trackNumber).toBe("2");
    expect(meta.album).toBe("Batch Album");
  });
});

describe("batch album ordering", () => {
  const items = [
    mockItem("a", "03-c.wav"),
    mockItem("b", "01-a.wav"),
    mockItem("c", "02-b.wav"),
  ];
  const order = ["a", "b", "c"];
  const metas = {
    a: { ...initTrackMetaFromSource(items[0]!, undefined, emptyAlbumMeta()), trackNumber: "3" },
    b: { ...initTrackMetaFromSource(items[1]!, undefined, emptyAlbumMeta()), trackNumber: "1" },
    c: { ...initTrackMetaFromSource(items[2]!, undefined, emptyAlbumMeta()), trackNumber: "2" },
  };

  it("sorts by track number", () => {
    expect(sortItemIdsByTrackNumber(items, order, metas)).toEqual(["b", "c", "a"]);
  });

  it("sorts by filename", () => {
    expect(sortItemIdsByFilename(items, order)).toEqual(["b", "c", "a"]);
  });

  it("moves track up/down in order", () => {
    expect(moveInOrder(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
  });
});

describe("batch album export helpers", () => {
  const tonePath = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
  const stemsPath = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_stems.mp5");

  it("batchOutputFilenameForTrack prefixes track number", () => {
    const album = emptyAlbumMeta();
    const meta = {
      id: "1",
      title: "Song",
      artist: "Artist",
      album: "Al",
      albumArtist: "",
      trackNumber: "3",
      discNumber: "1",
      genre: "",
      year: "",
      date: "",
      useAlbumCover: true,
    };
    const name = batchOutputFilenameForTrack(meta, album, "source.wav");
    expect(name).toMatch(/^03 - /);
    expect(name.endsWith(".mp5")).toBe(true);
  });

  it.skipIf(!existsSync(tonePath) || !existsSync(stemsPath))(
    "creates manifest and embedded .mp5p from batch-like tracks",
    async () => {
      const toneBytes = new Uint8Array(readFileSync(tonePath));
      const stemsBytes = new Uint8Array(readFileSync(stemsPath));
      const items: BatchQueueItem[] = [
        {
          ...mockItem("t1", "demo-tone.mp5", "complete"),
          outputFilename: "demo-tone.mp5",
          mp5: toneBytes,
          outputBytes: toneBytes.byteLength,
        },
        {
          ...mockItem("t2", "demo-stems.mp5", "complete"),
          outputFilename: "demo-stems.mp5",
          mp5: stemsBytes,
          outputBytes: stemsBytes.byteLength,
        },
      ];
      const album = { ...emptyAlbumMeta(), title: "Batch Test Album", artist: "Demo", exportTarget: "manifest" as const };
      const order = ["t1", "t2"];
      const tracks = batchItemsToPlaylistTracks(items, order);
      const manifest = await createAlbumManifestFromTracks(
        tracks,
        { albumTitle: album.title, albumArtist: album.artist },
        { includeFileHashes: true, embedded: true },
      );
      expect(manifest?.tracks).toHaveLength(2);

      const embeddedTracks = tracks.map((t, i) => ({
        trackId: manifest!.tracks[i]!.trackId,
        logicalFile: t.name,
        bytes: new Uint8Array(items[i]!.mp5!),
      }));
      const pkg = writeEmbeddedAlbumPackage({ manifest: manifest!, tracks: embeddedTracks });
      const index = indexEmbeddedAlbumPackage(pkg);
      expect(index.tracks).toHaveLength(2);
      expect(verifyEmbeddedPackageIntegrity(pkg).valid).toBe(true);
    },
  );

  it.skipIf(!existsSync(tonePath))("preview counts features on completed items", () => {
    const bytes = new Uint8Array(readFileSync(tonePath));
    const items: BatchQueueItem[] = [
      {
        ...mockItem("1", "a.mp5", "complete"),
        mp5: bytes,
        outputFilename: "a.mp5",
        outputBytes: bytes.byteLength,
      },
    ];
    const preview = computeBatchAlbumPreview(items, ["1"], emptyAlbumMeta(), {});
    expect(preview.trackCount).toBe(1);
    expect(preview.totalBytes).toBe(bytes.byteLength);
  });
});

describe("trackMetaToManualEdits", () => {
  it("merges album-level fields into manual edits", () => {
    const album = emptyAlbumMeta();
    album.title = "Album X";
    album.artist = "Band";
    const meta = initTrackMetaFromSource(mockItem("1", "01-a.wav"), undefined, album);
    const edits = trackMetaToManualEdits(meta, album);
    expect(edits.meta.album).toBe("Album X");
    expect(edits.meta.albumartist).toBe("Band");
  });
});
