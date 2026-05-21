import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  encodeFing,
  decodeFing,
  encodeHash,
  decodeHash,
  encodeAudiPayload,
  parseMp5,
  writeMp5,
  CodecId,
  parseOptionalMetadata,
  validateAlbmPackageManifest,
  fingIdentityKey,
} from "@mp5/container";

function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

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
    meta: [{ key: "title", value: "fp-test" }],
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(2000) }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    optional,
  });
}

describe("FING chunk", () => {
  it("roundtrips fingerprint fields", () => {
    const decoded = decodeFing(
      encodeFing({
        version: 1,
        audioFingerprintType: "sha256-pcm",
        audioFingerprint: "a".repeat(64),
        pcmHash: "a".repeat(64),
        audiHash: "b".repeat(64),
        fileSize: 12345,
        sampleRate: 48000,
        channels: 2,
        source: "encoder",
        generatedBy: "MP5 test",
      }),
    );
    expect(decoded?.pcmHash).toHaveLength(64);
    expect(decoded?.source).toBe("encoder");
    expect(fingIdentityKey(decoded)).toBe("a".repeat(64));
  });

  it("rejects invalid hash hex", () => {
    const decoded = decodeFing(
      encodeFing({
        pcmHash: "not-hex",
        audiHash: "b".repeat(64),
      }),
    );
    expect(decoded?.pcmHash).toBeUndefined();
    expect(decoded?.audiHash).toBe("b".repeat(64));
  });

  it("returns null for malformed JSON", () => {
    expect(decodeFing(new Uint8Array([0xff]))).toBeNull();
  });

  it("parses via parseOptionalMetadata without breaking playback", () => {
    const optional = new Map<string, Uint8Array>();
    optional.set("FING", encodeFing({ audiHash: "c".repeat(64), source: "app" }));
    const parsed = parseMp5(minimalMp5(optional));
    expect(parsed.head?.codecId).toBe(CodecId.PCM);
    expect(parseOptionalMetadata(parsed.optional!).fing?.audiHash).toBe("c".repeat(64));
  });
});

describe("HASH chunk", () => {
  it("roundtrips per-chunk integrity entries", () => {
    const decoded = decodeHash(
      encodeHash({
        algorithm: "sha256",
        fileSha256: "d".repeat(64),
        chunks: [{ fourcc: "AUDI", sha256: "e".repeat(64), size: 100 }],
      }),
    );
    expect(decoded?.fileSha256).toBe("d".repeat(64));
    expect(decoded?.chunks?.[0]?.fourcc).toBe("AUDI");
  });

  it("rejects unknown fourcc in chunk list", () => {
    const raw = JSON.stringify({
      chunks: [{ fourcc: "EVIL", sha256: "f".repeat(64) }],
      fileSha256: "a".repeat(64),
    });
    const decoded = decodeHash(new TextEncoder().encode(raw));
    expect(decoded?.chunks ?? []).toHaveLength(0);
    expect(decoded?.fileSha256).toBe("a".repeat(64));
  });
});

describe("AUDI hash helper", () => {
  it("encodeAudiPayload is stable for hashing", () => {
    const frames = [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([1, 2, 3, 4]) }];
    const a = encodeAudiPayload(frames);
    const b = encodeAudiPayload(frames);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });
});

describe("album sidecar fileSha256", () => {
  it("accepts optional fileSha256 on track refs", () => {
    const { manifest, errors } = validateAlbmPackageManifest({
      format: "mp5-album-manifest-v1",
      version: 1,
      album: { title: "T" },
      tracks: [
        {
          trackId: "a",
          file: "one.mp5",
          trackNumber: 1,
          fileSha256: "a".repeat(64),
        },
      ],
    });
    expect(errors).toHaveLength(0);
    expect(manifest?.tracks[0]?.fileSha256).toBe("a".repeat(64));
  });

  it("drops invalid fileSha256", () => {
    const { manifest } = validateAlbmPackageManifest({
      format: "mp5-album-manifest-v1",
      version: 1,
      album: { title: "T" },
      tracks: [{ trackId: "a", file: "one.mp5", trackNumber: 1, fileSha256: "bad" }],
    });
    expect(manifest?.tracks[0]?.fileSha256).toBeUndefined();
  });
});
