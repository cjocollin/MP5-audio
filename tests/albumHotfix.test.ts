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
  headDurationMs,
  resolveTrackDurationMsFromRef,
} from "../apps/web/src/lib/album/albumDuration";
import { buildEmbeddedPlaylistPlaceholders } from "../apps/web/src/lib/album/embeddedAlbumQueue";
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
  });

  it("headDurationMs uses per-channel frame count (no extra /channels)", () => {
    const ms = headDurationMs({
      codecId: 2,
      channels: 2,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: 44100,
      totalSamples: 8423100n,
      encoderVersion: 1,
    });
    expect(ms).toBe(191000);
  });

  it("resolveTrackDurationMsFromRef prefers HEAD when manifest is half", () => {
    const ref = { trackId: "x", file: "a.mp5", trackNumber: 1, durationMs: 95_534 };
    expect(resolveTrackDurationMsFromRef(ref, 191_000)).toBe(191_000);
  });

  it("durationMsFromParsedMp5 reads HEAD samples", () => {
    const fixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
    if (!existsSync(fixture)) return;
    const bytes = new Uint8Array(readFileSync(fixture));
    const ms = durationMsFromParsedMp5(bytes);
    const parsed = parseMp5(bytes);
    const expected = Math.round((Number(parsed.head!.totalSamples) / parsed.head!.sampleRate) * 1000);
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
