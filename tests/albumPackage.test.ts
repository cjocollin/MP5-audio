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
