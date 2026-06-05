import { describe, it, expect } from "vitest";
import {
  ALBUM_MANIFEST_FORMAT,
  type AlbmPackageManifest,
  type EmbeddedAlbumPackageIndex,
} from "@mp5/container";
import {
  resolveAlbumCoverFromManifest,
  resolveFirstTrackCoverFromEmbedded,
} from "../apps/web/src/lib/album/albumCoverResolve";
import {
  durationMsFromParsedMp5,
  isPlausibleTrackDurationMs,
  resolveTrackDurationMsFromRef,
} from "../apps/web/src/lib/album/albumDuration";
import { buildEmbeddedPlaylistPlaceholders } from "../apps/web/src/lib/album/embeddedAlbumQueue";
import { getBatchItemMp5Summary } from "../apps/web/src/lib/album/batchItemMp5Summary";
import { computeBatchAlbumPreview } from "../apps/web/src/lib/album/buildAlbumFromBatchItems";
import { emptyAlbumMeta } from "../apps/web/src/lib/album/batchAlbumMetadata";
import type { BatchQueueItem } from "../apps/web/src/converter/batchTypes";
import type { ResolvedAlbumPackage } from "../apps/web/src/lib/album/resolveAlbum";
import { parseMp5 } from "@mp5/container";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function minimalEmbeddedAlbum(): ResolvedAlbumPackage {
  const manifest: AlbmPackageManifest = {
    format: ALBUM_MANIFEST_FORMAT,
    version: 1,
    album: { title: "Test LP", artist: "Artist" },
    tracks: [
      { trackId: "t1", file: "01-a.mp5", trackNumber: 1, durationMs: 95_000 },
      { trackId: "t2", file: "02-b.mp5", trackNumber: 2, durationMs: 121_000 },
    ],
  };
  const index = {
    manifest,
    fileSize: 1000,
    tracks: [
      { trackId: "t1", logicalFile: "01-a.mp5", totalByteLength: 100, fragments: [] },
      { trackId: "t2", logicalFile: "02-b.mp5", totalByteLength: 100, fragments: [] },
    ],
  } as EmbeddedAlbumPackageIndex;
  return {
    manifest,
    packageKind: "embedded",
    embeddedSource: { file: new File([], "album.mp5p"), index },
    tracks: manifest.tracks.map((ref) => ({
      ref,
      trackNumber: ref.trackNumber,
      discNumber: 1,
      displayTitle: ref.title ?? ref.file,
      displayArtist: "Artist",
      durationMs: ref.durationMs ?? null,
      playlistTrack: null,
      missing: false,
      embedded: true,
    })),
    missingCount: 0,
    resolvedCount: 2,
    foundFiles: ["01-a.mp5", "02-b.mp5"],
    missingFiles: [],
    totalDurationMs: 216_000,
    warnings: [],
  };
}

describe("album hotfix helpers", () => {
  it("resolveAlbumCoverFromManifest prefers embedded album cover", () => {
    const manifest: AlbmPackageManifest = {
      format: ALBUM_MANIFEST_FORMAT,
      version: 1,
      album: {
        title: "X",
        cover: { type: "embedded", mime: "image/png", dataBase64: btoa("abc") },
      },
      tracks: [],
    };
    const cover = resolveAlbumCoverFromManifest(manifest);
    expect(cover.source).toBe("album");
    expect(cover.url).toBeTruthy();
  });

  it("buildEmbeddedPlaylistPlaceholders queues all tracks without files", () => {
    const album = minimalEmbeddedAlbum();
    const rows = buildEmbeddedPlaylistPlaceholders(album);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.embeddedAlbum?.trackId).toBe("t1");
    expect(rows[0]?.file).toBeUndefined();
    expect(rows[0]?.durationSec).toBeCloseTo(95, 0);
    expect(rows[1]?.durationSec).toBeCloseTo(121, 0);
  });

  it("resolveTrackDurationMsFromRef rejects implausible manifest ms", () => {
    expect(isPlausibleTrackDurationMs(95_000)).toBe(true);
    expect(resolveTrackDurationMsFromRef({ trackId: "x", file: "a.mp5", trackNumber: 1, durationMs: 95_000 })).toBe(95_000);
    expect(resolveTrackDurationMsFromRef({ trackId: "x", file: "a.mp5", trackNumber: 1, durationMs: 0 })).toBeNull();
  });

  it("getBatchItemMp5Summary caches parse per buffer", () => {
    const fixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
    if (!existsSync(fixture)) return;
    const bytes = new Uint8Array(readFileSync(fixture));
    const item: BatchQueueItem = {
      id: "1",
      sourceName: "tone.mp5",
      sourceSize: bytes.length,
      file: new File([bytes], "tone.mp5"),
      status: "done",
      mp5: bytes,
      outputFilename: "tone.mp5",
    };
    const a = getBatchItemMp5Summary(item);
    const b = getBatchItemMp5Summary(item);
    expect(a).toBe(b);
    expect(a?.byteLength).toBe(bytes.length);
  });

  it("computeBatchAlbumPreview does not require album title in trackMetas churn", () => {
    const bytes = new Uint8Array(64);
    const item: BatchQueueItem = {
      id: "1",
      sourceName: "a.wav",
      sourceSize: 8,
      file: new File([bytes], "a.wav"),
      status: "complete",
      mp5: bytes,
      outputFilename: "01-a.mp5",
    };
    const album = { ...emptyAlbumMeta(), title: "My Album", exportTarget: "embedded" as const };
    const preview = computeBatchAlbumPreview([item], ["1"], album, {
      "1": {
        id: "1",
        title: "A",
        artist: "B",
        album: "",
        albumArtist: "",
        trackNumber: "1",
        discNumber: "1",
        genre: "",
        year: "",
        date: "",
        useAlbumCover: true,
      },
    });
    expect(preview.albumTitle).toBe("My Album");
    expect(preview.trackCount).toBe(1);
  });

  it("durationMsFromParsedMp5 reads HEAD samples", () => {
    const fixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
    if (!existsSync(fixture)) return;
    const bytes = new Uint8Array(readFileSync(fixture));
    const ms = durationMsFromParsedMp5(bytes);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(0);
    const parsed = parseMp5(bytes);
    const expected = Math.round(
      (Number(parsed.head.totalSamples) / parsed.head.sampleRate / parsed.head.channels) * 1000,
    );
    expect(ms).toBe(expected);
  });

  it("resolveFirstTrackCoverFromEmbedded reads cover from embedded fixture when present", async () => {
    const fixture = path.join(process.cwd(), "test-fixtures/demo_embedded_album_package.mp5p");
    if (!existsSync(fixture)) return;
    const buf = readFileSync(fixture);
    const { indexEmbeddedAlbumPackage } = await import("@mp5/container");
    const index = await indexEmbeddedAlbumPackage(buf);
    const file = new File([buf], "demo.mp5p");
    const firstId = index.manifest.tracks[0]!.trackId;
    const cover = await resolveFirstTrackCoverFromEmbedded(file, index, firstId);
    expect(["first-track", "none"]).toContain(cover.source);
  });
});
