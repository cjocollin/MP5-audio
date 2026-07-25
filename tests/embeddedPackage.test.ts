import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMBEDDED_ALBUM_MANIFEST_FORMAT,
  EMBEDDED_MAX_FRAGMENT_PAYLOAD,
  MAX_ALBUM_MANIFEST_JSON_BYTES,
  detectMp5pPackageKind,
  indexEmbeddedAlbumPackage,
  loadEmbeddedTrackBytes,
  parseAlbmPackageJson,
  parseEmbeddedAlbmManifestJson,
  parseMp5,
  reconstructTrackBytesFromFragments,
  setEmbeddedFragmentPayloadTargetForTests,
  resetEmbeddedFragmentPayloadTarget,
  splitTrackBytesIntoFragments,
  verifyEmbeddedPackageIntegrity,
  writeEmbeddedAlbumPackage,
  type AlbmPackageManifest,
} from "@mp5/container";

const fixtures = join(process.cwd(), "test-fixtures");

function tinyManifest(): AlbmPackageManifest {
  return {
    format: EMBEDDED_ALBUM_MANIFEST_FORMAT,
    version: 1,
    album: { title: "Test LP", artist: "Band" },
    tracks: [
      { trackId: "a", file: "a.mp5", trackNumber: 1 },
      { trackId: "b", file: "b.mp5", trackNumber: 2 },
    ],
  };
}

describe("embedded album package", () => {
  beforeEach(() => {
    // 16 KiB target so the ~38 KB demo tone fixture still splits into multiple
    // fragments (exercising fragment roundtrip); the fixture is now under 64 KiB.
    setEmbeddedFragmentPayloadTargetForTests(16 * 1024);
  });
  afterEach(() => {
    resetEmbeddedFragmentPayloadTarget();
  });

  it("detects embedded vs json manifest", () => {
    const embedded = writeEmbeddedAlbumPackage({
      manifest: tinyManifest(),
      tracks: [
        { trackId: "a", logicalFile: "a.mp5", bytes: new Uint8Array([1, 2, 3]) },
        { trackId: "b", logicalFile: "b.mp5", bytes: new Uint8Array([4, 5]) },
      ],
    });
    expect(detectMp5pPackageKind(embedded)).toBe("embedded-binary");
    expect(detectMp5pPackageKind(new TextEncoder().encode('{"format":"mp5-album-manifest-v1"}'))).toBe(
      "json-manifest",
    );
  });

  it("roundtrips embedded package directory and fragments", async () => {
    const tonePath = join(fixtures, "demo_mp5l_v3_tone.mp5");
    const tone = new Uint8Array(readFileSync(tonePath));
    const manifest = tinyManifest();
    manifest.tracks = [{ trackId: "tone", file: "demo_mp5l_v3_tone.mp5", trackNumber: 1 }];
    const pkg = writeEmbeddedAlbumPackage({
      manifest,
      tracks: [{ trackId: "tone", logicalFile: "demo_mp5l_v3_tone.mp5", bytes: tone }],
    });
    const index = indexEmbeddedAlbumPackage(pkg);
    expect(index.tracks).toHaveLength(1);
    expect(index.totalFragmentCount).toBeGreaterThan(1);
    for (const t of index.tracks) {
      for (const f of t.fragments) {
        expect(f.payloadLength).toBeLessThanOrEqual(EMBEDDED_MAX_FRAGMENT_PAYLOAD);
      }
    }
    const loaded = await loadEmbeddedTrackBytes(pkg, index, "tone");
    expect(loaded.length).toBe(tone.length);
    expect(Array.from(loaded.slice(0, 4))).toEqual(Array.from(tone.slice(0, 4)));
    const integrity = verifyEmbeddedPackageIntegrity(pkg);
    expect(integrity.valid).toBe(true);
  });

  it("reconstruct fails on missing fragment", () => {
    const parts = splitTrackBytesIntoFragments("x", new Uint8Array(200_000));
    expect(() => reconstructTrackBytesFromFragments(parts.slice(0, 1))).toThrow(/Missing/);
  });

  it("loaded embedded track is parseable MP5", async () => {
    const path = join(fixtures, "demo_embedded_album_package.mp5p");
    let pkg: Uint8Array;
    try {
      pkg = new Uint8Array(readFileSync(path));
    } catch {
      return; // fixture optional in partial CI
    }
    const index = indexEmbeddedAlbumPackage(pkg);
    const bytes = await loadEmbeddedTrackBytes(pkg, index, index.tracks[0]!.trackId);
    const parsed = parseMp5(bytes);
    expect(parsed.head).toBeTruthy();
  });
});

describe("embedded package parser hardening", () => {
  it("rejects oversized JSON manifest text without parsing", () => {
    const huge = "x".repeat(MAX_ALBUM_MANIFEST_JSON_BYTES + 1);
    expect(parseAlbmPackageJson(huge).manifest).toBeNull();
    expect(parseAlbmPackageJson(huge).errors[0]?.message).toMatch(/too large/i);
    expect(parseEmbeddedAlbmManifestJson(huge).manifest).toBeNull();
    expect(parseEmbeddedAlbmManifestJson(huge).errors[0]?.message).toMatch(/too large/i);
  });

  it("rejects a header whose declared manifest length exceeds the cap", () => {
    const buf = new Uint8Array(64);
    const v = new DataView(buf.buffer);
    buf.set([0x4d, 0x50, 0x35, 0x50], 0); // MP5P magic
    v.setUint32(4, 1, true); // package version
    v.setUint32(8, 40, true); // header length
    v.setUint32(12, 40, true); // manifestOffset (lo)
    v.setUint32(20, MAX_ALBUM_MANIFEST_JSON_BYTES + 1, true); // manifestLength
    expect(() => indexEmbeddedAlbumPackage(buf)).toThrow(/manifest too large/i);
  });
});
