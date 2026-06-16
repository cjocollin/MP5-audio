import { describe, it, expect } from "vitest";
import {
  buildExportFilename,
  dedupeExportFilenames,
  safeFilenameBase,
  safePackageFilename,
  sanitizeFilenamePart,
} from "../apps/web/src/converter/exportFilename";
import {
  preflightPackageExport,
  verifyExportedManifest,
  verifyExportedEmbeddedPackage,
  type PreflightTrack,
} from "../apps/web/src/lib/album/packageValidation";
import {
  EMBEDDED_GUIDANCE,
  MANIFEST_GUIDANCE,
  EXPORT_REVIEW_NOTES,
  guidanceForTarget,
  packageGuidance,
} from "../apps/web/src/lib/album/packageGuidance";
import {
  buildPackageSummaryText,
  formatExportDiagnostics,
  redactLocalPaths,
} from "../apps/web/src/lib/album/exportReview";
import {
  ALBUM_MANIFEST_FORMAT,
  EMBEDDED_ALBUM_MANIFEST_FORMAT,
  manifestToJson,
  writeEmbeddedAlbumPackage,
  type AlbmPackageManifest,
} from "@mp5/container";

describe("filename sanitization", () => {
  it("preserves the existing invalid-char behavior", () => {
    expect(sanitizeFilenamePart('bad<>:"/\\|?*name')).toBe("bad_________name");
  });

  it("strips leading and trailing dots/spaces", () => {
    expect(sanitizeFilenamePart("   ..track..  ")).toBe("track");
  });

  it("guards Windows reserved device names", () => {
    expect(safeFilenameBase("CON")).toBe("_CON");
    expect(safeFilenameBase("com1")).toBe("_com1");
    expect(safeFilenameBase("notreserved")).toBe("notreserved");
  });

  it("falls back when the base would be empty", () => {
    expect(safeFilenameBase("")).toBe("track");
    expect(safeFilenameBase("   ")).toBe("track");
    expect(safeFilenameBase("", "Album")).toBe("Album");
  });

  it("never produces path separators in export filenames", () => {
    const name = buildExportFilename({ title: "a/b\\c", artist: "x/y" }, "mp5l");
    expect(name).not.toMatch(/[/\\]/);
    expect(name.endsWith(".mp5")).toBe(true);
  });

  it("builds safe .mp5p package names", () => {
    expect(safePackageFilename("Band", "My LP")).toBe("Band - My LP.mp5p");
    expect(safePackageFilename(undefined, "Solo")).toBe("Solo.mp5p");
    expect(safePackageFilename("", "")).toBe("Album.mp5p");
  });

  it("dedupes duplicate names case-insensitively", () => {
    expect(dedupeExportFilenames(["a.mp5", "a.mp5", "A.mp5"])).toEqual([
      "a.mp5",
      "a (2).mp5",
      "A (3).mp5",
    ]);
  });

  it("keeps already-unique names untouched", () => {
    expect(dedupeExportFilenames(["one.mp5", "two.mp5"])).toEqual(["one.mp5", "two.mp5"]);
  });
});

function manifest(kind: "manifest" | "embedded", trackCount = 2): AlbmPackageManifest {
  return {
    format: kind === "embedded" ? EMBEDDED_ALBUM_MANIFEST_FORMAT : ALBUM_MANIFEST_FORMAT,
    version: 1,
    album: { title: "Test LP", artist: "Band", albumArtist: "Band" },
    tracks: Array.from({ length: trackCount }, (_, i) => ({
      trackId: `t${i + 1}`,
      file: `0${i + 1} - Track.mp5`,
      trackNumber: i + 1,
      title: `Track ${i + 1}`,
    })),
  };
}

function tracks(count: number, hasPayload = true): PreflightTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    trackId: `t${i + 1}`,
    hasPayload,
    byteLength: 1024,
    title: `Track ${i + 1}`,
  }));
}

describe("package preflight", () => {
  it("passes a valid embedded package", () => {
    const r = preflightPackageExport({
      exportTarget: "embedded",
      manifest: manifest("embedded"),
      tracks: tracks(2),
    });
    expect(r.ok).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it("blocks embedded export with missing payloads", () => {
    const r = preflightPackageExport({
      exportTarget: "embedded",
      manifest: manifest("embedded"),
      tracks: tracks(2, false),
    });
    expect(r.ok).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/no audio payload/i);
  });

  it("blocks packages with fewer than two tracks", () => {
    const r = preflightPackageExport({
      exportTarget: "manifest",
      manifest: manifest("manifest", 1),
      tracks: tracks(1),
    });
    expect(r.ok).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/at least two/i);
  });

  it("rejects unsafe track ids", () => {
    const m = manifest("embedded");
    m.tracks[0]!.trackId = "../evil";
    const r = preflightPackageExport({ exportTarget: "embedded", manifest: m, tracks: tracks(2) });
    expect(r.ok).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/unsafe track id/i);
  });

  it("warns but does not block on harmless missing metadata", () => {
    const m = manifest("manifest");
    m.tracks[0]!.title = "";
    const r = preflightPackageExport({ exportTarget: "manifest", manifest: m, tracks: tracks(2) });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/missing a title/i);
  });

  it("individual export only needs at least one track", () => {
    expect(preflightPackageExport({ exportTarget: "individual", manifest: null, tracks: tracks(1) }).ok).toBe(true);
    expect(preflightPackageExport({ exportTarget: "individual", manifest: null, tracks: [] }).ok).toBe(false);
  });
});

describe("post-export verification", () => {
  it("validates a manifest JSON round-trip", () => {
    const json = manifestToJson(manifest("manifest"), true);
    const r = verifyExportedManifest(json, 2);
    expect(r.valid).toBe(true);
    expect(r.trackCount).toBe(2);
  });

  it("flags a track-count mismatch as a warning", () => {
    const json = manifestToJson(manifest("manifest"), true);
    const r = verifyExportedManifest(json, 5);
    expect(r.valid).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/Expected 5/);
  });

  it("fails on invalid manifest JSON", () => {
    expect(verifyExportedManifest("{}", 2).valid).toBe(false);
  });

  it("validates a real embedded package", () => {
    const m = manifest("embedded");
    const bytes = writeEmbeddedAlbumPackage({
      manifest: m,
      tracks: m.tracks.map((t) => ({
        trackId: t.trackId,
        logicalFile: t.file,
        bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      })),
    });
    const r = verifyExportedEmbeddedPackage(bytes, 2);
    expect(r.valid).toBe(true);
    expect(r.trackCount).toBe(2);
    expect(r.deep).toBe(true);
    expect(r.summary).toMatch(/passed/i);
  });

  it("reports invalid bytes cleanly", () => {
    const r = verifyExportedEmbeddedPackage(new Uint8Array([0, 1, 2, 3]), 2);
    expect(r.valid).toBe(false);
  });
});

describe("package guidance", () => {
  it("exposes manifest vs embedded trade-offs", () => {
    expect(MANIFEST_GUIDANCE.cons.join(" ")).toMatch(/sidecar/i);
    expect(EMBEDDED_GUIDANCE.cons.join(" ")).toMatch(/large/i);
    expect(packageGuidance("embedded").mode).toBe("embedded");
    expect(guidanceForTarget("individual")).toBeNull();
  });

  it("keeps export-review copy honest", () => {
    expect(EXPORT_REVIEW_NOTES.mp5lRecommended).toMatch(/MP5-L/);
    expect(EXPORT_REVIEW_NOTES.noClaims).toMatch(/no claim/i);
    expect(EXPORT_REVIEW_NOTES.browserLocal).toMatch(/locally/i);
  });
});

describe("export summary + diagnostics text", () => {
  it("builds a path-free copyable package summary", () => {
    const text = buildPackageSummaryText({
      mode: "embedded",
      albumTitle: "Test LP",
      albumArtist: "Band",
      trackCount: 2,
      packageFilename: "Band - Test LP.mp5p",
      totalBytes: 2048,
    });
    expect(text).toMatch(/Embedded .mp5p package/);
    expect(text).toMatch(/no upload/i);
    expect(text).not.toMatch(/[a-zA-Z]:\\/);
  });

  it("redacts windows and unix local paths", () => {
    expect(redactLocalPaths("error at C:\\Users\\me\\Downloads\\HADES.mp5p")).not.toMatch(/Users/);
    expect(redactLocalPaths("/home/me/secret/file.mp5")).toBe("<path>");
  });

  it("formats export diagnostics context", () => {
    const lines = formatExportDiagnostics({
      exportMode: "embedded",
      trackCount: 12,
      packageType: "embedded .mp5p",
      warningCount: 1,
      lastExportError: "boom at C:\\Users\\me\\x.mp5p",
    });
    expect(lines.join("\n")).toMatch(/Export mode: embedded/);
    expect(lines.join("\n")).not.toMatch(/Users/);
  });
});
