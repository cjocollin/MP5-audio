import { describe, it, expect } from "vitest";
import {
  encodeCrdt,
  decodeCrdt,
  encodeLicn,
  decodeLicn,
  encodeIden,
  decodeIden,
  parseOptionalMetadata,
  parseMp5,
  writeMp5,
  CodecId,
  validateAlbmPackageManifest,
  LICN_INFORMATIONAL_DEFAULT,
  sanitizeHttpUrl,
} from "@mp5/container";

function minimalMp5(optional: Map<string, Uint8Array>): Uint8Array {
  return writeMp5({
    head: {
      codecId: CodecId.PCM,
      channels: 1,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: 44100,
      totalSamples: 1000n,
      encoderVersion: 1,
    },
    meta: [{ key: "title", value: "Credits test" }],
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(2000) }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    optional,
  });
}

describe("CRDT chunk", () => {
  it("roundtrips credit roles and performers", () => {
    const decoded = decodeCrdt(
      encodeCrdt({
        primaryArtist: ["Demo Artist"],
        producer: ["Producer One", "Producer Two"],
        performers: [{ name: "Guitarist", instrument: "guitar" }],
        additionalCredits: [{ role: "Art director", names: ["Alex"] }],
        notes: "Synthetic demo credits",
      }),
    );
    expect(decoded?.primaryArtist).toEqual(["Demo Artist"]);
    expect(decoded?.producer).toHaveLength(2);
    expect(decoded?.performers?.[0]?.instrument).toBe("guitar");
    expect(decoded?.additionalCredits?.[0]?.role).toBe("Art director");
    expect(decoded?.notes).toBe("Synthetic demo credits");
  });

  it("strips control characters and script-like content from names", () => {
    const decoded = decodeCrdt(
      encodeCrdt({
        producer: ["Safe\x00Name", "<script>alert(1)</script>"],
      }),
    );
    expect(decoded?.producer?.[0]).not.toContain("\x00");
    expect(decoded?.producer?.some((n) => n.includes("<"))).toBeFalsy();
  });

  it("rejects empty payload on encode", () => {
    expect(() => encodeCrdt({})).toThrow();
  });

  it("returns null for malformed JSON", () => {
    expect(decodeCrdt(new Uint8Array([123, 0xff]))).toBeNull();
  });

  it("parses via parseOptionalMetadata without breaking playback", () => {
    const optional = new Map<string, Uint8Array>();
    optional.set(
      "CRDT",
      encodeCrdt({ songwriter: ["Writer"] }),
    );
    const parsed = parseMp5(minimalMp5(optional));
    expect(parsed.head.codecId).toBe(CodecId.PCM);
    const meta = parseOptionalMetadata(parsed.optional!);
    expect(meta.crdt?.songwriter).toEqual(["Writer"]);
  });
});

describe("LICN chunk", () => {
  it("roundtrips rights fields and informational note", () => {
    const decoded = decodeLicn(
      encodeLicn({
        copyrightNotice: "© 2026 Demo",
        licenseType: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        remixAllowed: true,
        commercialUseAllowed: "unknown",
        attributionRequired: true,
      }),
    );
    expect(decoded?.copyrightNotice).toBe("© 2026 Demo");
    expect(decoded?.licenseUrl).toMatch(/^https:\/\//);
    expect(decoded?.remixAllowed).toBe(true);
    expect(decoded?.commercialUseAllowed).toBe("unknown");
    expect(decoded?.informationalOnly).toBe(LICN_INFORMATIONAL_DEFAULT);
  });

  it("rejects javascript license URLs", () => {
    const decoded = decodeLicn(
      encodeLicn({
        licenseType: "Custom",
        licenseUrl: "javascript:alert(1)",
      }),
    );
    expect(decoded?.licenseUrl).toBeUndefined();
  });

  it("returns null for invalid JSON blob", () => {
    expect(decodeLicn(new Uint8Array([0]))).toBeNull();
  });
});

describe("IDEN chunk", () => {
  it("roundtrips identifiers and normalizes ISRC", () => {
    const decoded = decodeIden(
      encodeIden({
        isrc: "US-RC1-76-07839",
        upc: "123456789012",
        catalogNumber: "CAT-001",
        artistUrl: "https://example.com/artist",
      }),
    );
    expect(decoded?.isrc).toBe("USRC17607839");
    expect(decoded?.upc).toBe("123456789012");
    expect(decoded?.artistUrl).toMatch(/^https:\/\/example\.com/);
  });

  it("rejects invalid ISRC and non-http URLs", () => {
    expect(() =>
      encodeIden({
        isrc: "too-short",
        sourceUrl: "ftp://bad.example/x",
      }),
    ).toThrow();
    const decoded = decodeIden(
      new TextEncoder().encode(
        JSON.stringify({ isrc: "short", sourceUrl: "javascript:alert(1)" }),
      ),
    );
    expect(decoded).toBeNull();
  });
});

describe("sanitizeHttpUrl", () => {
  it("allows https and blocks javascript", () => {
    expect(sanitizeHttpUrl("https://example.com/x")).toMatch(/^https:/);
    expect(sanitizeHttpUrl("javascript:evil()")).toBeUndefined();
  });
});

describe("album manifest album-level credits", () => {
  it("accepts optional crdt and licn on manifest", () => {
    const { manifest, errors } = validateAlbmPackageManifest({
      format: "mp5-album-manifest-v1",
      version: 1,
      album: { title: "Test Album" },
      tracks: [{ trackId: "t1", file: "a.mp5", trackNumber: 1 }],
      crdt: { producer: ["Album Producer"] },
      licn: { licenseType: "All rights reserved" },
      iden: { catalogNumber: "X-1" },
    });
    expect(errors).toHaveLength(0);
    expect(manifest?.crdt?.producer).toEqual(["Album Producer"]);
    expect(manifest?.licn?.licenseType).toBe("All rights reserved");
    expect(manifest?.iden?.catalogNumber).toBe("X-1");
  });
});
