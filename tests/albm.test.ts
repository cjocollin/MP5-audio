import { describe, it, expect } from "vitest";
import {
  parseAlbmPackageJson,
  validateAlbmPackageManifest,
  encodeAlbmPackage,
  decodeAlbm,
  manifestToJson,
  albumTrackBasename,
  auditAlbmPackageManifest,
  ALBUM_MANIFEST_FORMAT,
} from "@mp5/container";

const VALID = {
  format: ALBUM_MANIFEST_FORMAT,
  version: 1,
  album: { title: "Test Album", artist: "Artist" },
  tracks: [
    { trackId: "a", file: "01-intro.mp5", trackNumber: 2 },
    { trackId: "b", file: "02-main.mp5", trackNumber: 1 },
  ],
};

describe("ALBM album package manifest", () => {
  it("validates and sorts tracks by disc/number", () => {
    const { manifest, errors } = validateAlbmPackageManifest(VALID);
    expect(errors).toHaveLength(0);
    expect(manifest?.tracks[0]?.file).toBe("02-main.mp5");
    expect(manifest?.tracks[1]?.file).toBe("01-intro.mp5");
  });

  it("roundtrips via encode/decode ALBM chunk", () => {
    const { manifest } = validateAlbmPackageManifest(VALID);
    expect(manifest).toBeTruthy();
    const decoded = decodeAlbm(encodeAlbmPackage(manifest!));
    expect(decoded?.album.title).toBe("Test Album");
    expect(decoded?.tracks).toHaveLength(2);
  });

  it("rejects invalid format and path traversal", () => {
    const bad = validateAlbmPackageManifest({
      ...VALID,
      format: "other",
    });
    expect(bad.manifest).toBeNull();

    const trav = validateAlbmPackageManifest({
      ...VALID,
      tracks: [{ trackId: "x", file: "../secret.mp5", trackNumber: 1 }],
    });
    expect(trav.manifest).toBeNull();
  });

  it("parseAlbmPackageJson handles invalid JSON", () => {
    const r = parseAlbmPackageJson("{");
    expect(r.manifest).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("manifestToJson is parseable", () => {
    const { manifest } = validateAlbmPackageManifest(VALID);
    const text = manifestToJson(manifest!, true);
    const again = parseAlbmPackageJson(text);
    expect(again.manifest?.album.title).toBe("Test Album");
  });

  it("albumTrackBasename extracts filename", () => {
    expect(albumTrackBasename("disc1/02-track.mp5")).toBe("02-track.mp5");
  });

  it("rejects duplicate trackId and file refs", () => {
    const { manifest, errors } = validateAlbmPackageManifest({
      ...VALID,
      tracks: [
        { trackId: "dup", file: "a.mp5", trackNumber: 1 },
        { trackId: "dup", file: "b.mp5", trackNumber: 2 },
        { trackId: "c", file: "a.mp5", trackNumber: 3 },
      ],
    });
    expect(manifest?.tracks).toHaveLength(1);
    expect(errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  it("rejects backslash paths", () => {
    const { manifest } = validateAlbmPackageManifest({
      ...VALID,
      tracks: [{ trackId: "x", file: "folder\\track.mp5", trackNumber: 1 }],
    });
    expect(manifest).toBeNull();
  });

  it("audit warns on file cover ref", () => {
    const { manifest } = validateAlbmPackageManifest({
      ...VALID,
      album: { title: "T", cover: { type: "file", path: "cover.jpg" } },
    });
    const warnings = auditAlbmPackageManifest(manifest!);
    expect(warnings.some((w) => w.path === "album.cover")).toBe(true);
  });
});
