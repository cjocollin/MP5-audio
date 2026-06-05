import { describe, it, expect } from "vitest";
import {
  ALBUM_MANIFEST_FORMAT,
  parseAlbmPackageJson,
  type AlbmPackageManifest,
} from "@mp5/container";
import { resolveAlbumTracks, resolvedTracksInOrder } from "../apps/web/src/lib/album/resolveAlbum";
import {
  createAlbumManifestFromTracks,
  isAlbumPackageFileName,
} from "../apps/web/src/lib/album/createAlbumPackage";
import {
  formatExtractFilename,
  formatPackageBytes,
  integrityStatusLabel,
  summarizeAlbumIntegrity,
} from "../apps/web/src/lib/album/albumPackageUi";
import { albumPlaybackContext } from "../apps/web/src/lib/album/albumPlaybackContext";
import type { ResolvedAlbumPackage } from "../apps/web/src/lib/album/resolveAlbum";
import type { PlaylistTrack } from "../apps/web/src/store/playerStore";

function track(name: string, id?: string): PlaylistTrack {
  return {
    id: id ?? crypto.randomUUID(),
    name,
    file: new File([], name, { type: "audio/mp5" }),
    parsed: {
      head: {
        codecId: 2,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 88200n,
        encoderVersion: 1,
      },
      meta: [
        { key: "title", value: name.replace(/\.mp5$/i, "") },
        { key: "artist", value: "Demo Artist" },
        { key: "album", value: "Demo Album" },
      ],
      audioFrames: [],
      seek: [],
      waveform: [],
      optional: new Map(),
    },
    durationSec: 2,
  };
}

describe("album package web helpers", () => {
  it("isAlbumPackageFileName detects .mp5p", () => {
    expect(isAlbumPackageFileName("album.mp5p")).toBe(true);
    expect(isAlbumPackageFileName("song.mp5")).toBe(false);
  });

  it("resolveAlbumTracks matches by basename and trackId", () => {
    const manifest: AlbmPackageManifest = {
      format: ALBUM_MANIFEST_FORMAT,
      version: 1,
      album: { title: "Album" },
      tracks: [
        { trackId: "id-a", file: "a.mp5", trackNumber: 1, title: "A" },
        { trackId: "id-b", file: "subdir/b.mp5", trackNumber: 2, title: "B" },
        { trackId: "missing", file: "gone.mp5", trackNumber: 3 },
      ],
    };
    const tA = track("a.mp5", "id-a");
    const tB = track("b.mp5", "id-b");
    const resolved = resolveAlbumTracks(manifest, [tA, tB]);
    expect(resolved.resolvedCount).toBe(2);
    expect(resolved.missingCount).toBe(1);
    expect(resolved.missingFiles).toContain("gone.mp5");
    expect(resolved.foundFiles.length).toBe(2);
    expect(resolved.tracks[2]?.missing).toBe(true);
    expect(resolvedTracksInOrder(resolved)).toHaveLength(2);
  });

  it("createAlbumManifestFromTracks preserves order", async () => {
    const manifest = await createAlbumManifestFromTracks(
      [track("one.mp5"), track("two.mp5")],
      { albumTitle: "My LP", albumArtist: "Band" },
      { includeFileHashes: false },
    );
    expect(manifest?.tracks).toHaveLength(2);
    expect(manifest?.tracks[0]?.file).toBe("one.mp5");
    expect(manifest?.tracks[1]?.trackNumber).toBe(2);
  });

  it("invalid manifest does not throw on parse", () => {
    const { manifest, errors } = parseAlbmPackageJson("{}");
    expect(manifest).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });
});

function minimalAlbum(kind: "embedded" | "manifest"): ResolvedAlbumPackage {
  return {
    manifest: {
      format: kind === "embedded" ? "mp5-album-embedded-v1" : ALBUM_MANIFEST_FORMAT,
      version: 1,
      album: { title: "Test LP", artist: "Band" },
      tracks: [
        { trackId: "t1", file: "01 - One.mp5", trackNumber: 1, title: "One" },
        { trackId: "t2", file: "02 - Two.mp5", trackNumber: 2, title: "Two" },
      ],
    },
    tracks: [
      {
        ref: { trackId: "t1", file: "01 - One.mp5", trackNumber: 1, title: "One" },
        trackNumber: 1,
        discNumber: 1,
        displayTitle: "One",
        displayArtist: "Band",
        durationMs: 120000,
        playlistTrack: track("01 - One.mp5", "t1"),
        missing: false,
      },
      {
        ref: { trackId: "t2", file: "02 - Two.mp5", trackNumber: 2, title: "Two" },
        trackNumber: 2,
        discNumber: 1,
        displayTitle: "Two",
        displayArtist: "Band",
        durationMs: 90000,
        playlistTrack: null,
        missing: kind === "manifest",
      },
    ],
    missingCount: kind === "manifest" ? 1 : 0,
    resolvedCount: 1,
    foundFiles: kind === "manifest" ? ["01 - One.mp5"] : [],
    missingFiles: kind === "manifest" ? ["02 - Two.mp5"] : [],
    packageKind: kind,
    warnings: [],
  };
}

describe("album package UI helpers", () => {
  it("formatPackageBytes uses KiB and MiB", () => {
    expect(formatPackageBytes(512)).toBe("512 B");
    expect(formatPackageBytes(2048)).toContain("KiB");
    expect(formatPackageBytes(5 * 1024 * 1024)).toContain("MiB");
  });

  it("formatExtractFilename uses track number prefix", () => {
    expect(formatExtractFilename(3, "My Song")).toBe("03 - My Song.mp5");
  });

  it("summarizeAlbumIntegrity flags missing sidecars", () => {
    expect(summarizeAlbumIntegrity(minimalAlbum("manifest"))).toBe("sidecar-missing");
    expect(integrityStatusLabel("sidecar-missing")).toMatch(/Sidecar/i);
  });

  it("albumPlaybackContext returns package context", () => {
    const album = minimalAlbum("embedded");
    const t = album.tracks[0]!.playlistTrack as PlaylistTrack;
    const ctx = albumPlaybackContext(album, t);
    expect(ctx?.packageTitle).toBe("Test LP");
    expect(ctx?.trackNumber).toBe(1);
    expect(ctx?.packageKind).toBe("embedded");
  });
});
