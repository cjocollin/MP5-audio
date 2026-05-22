import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  assessMp5Compatibility,
  encodeAudiPayload,
  encodeFing,
  encodeHash,
  encodeMeta,
  isInformationalFileHashMismatch,
  parseMp5,
  resolveIntegrityStatus,
  verifyMp5FileIntegrity,
  writeMp5,
  CodecId,
} from "@mp5/container";

function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("whole-file hash (self-referential FING/HASH)", () => {
  const head = {
    codecId: CodecId.PCM,
    channels: 1,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate: 44100,
    totalSamples: 4n,
    encoderVersion: 1,
  };
  const audioFrames = [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([9, 8, 7]) }];
  const meta = [{ key: "title", value: "t" }];
  const seek = [{ sampleOffset: 0n, byteOffset: 0n }];

  it("PCM+AUDI match with pre-embed file hash → audio_verified, not mismatch", async () => {
    const base = writeMp5({ head, meta, audioFrames, seek });
    const audiHash = sha256Hex(encodeAudiPayload(audioFrames));
    const metaHash = sha256Hex(encodeMeta(meta));
    const fileHashPre = sha256Hex(base);

    const withFp = writeMp5({
      head,
      meta,
      audioFrames,
      seek,
      optional: new Map([
        [
          "FING",
          encodeFing({ audiHash, metaHash, fileHash: fileHashPre, source: "encoder" }),
        ],
        [
          "HASH",
          encodeHash({
            fileSha256: fileHashPre,
            chunks: [{ fourcc: "AUDI", sha256: audiHash, size: encodeAudiPayload(audioFrames).length }],
          }),
        ],
      ]),
    });

    const parsed = parseMp5(withFp);
    const result = await verifyMp5FileIntegrity(parsed, withFp);
    expect(result.audiHash?.ok).toBe(true);
    expect(result.fileHash?.ok).toBe(false);
    expect(result.fileHashInformational).toBe(true);
    expect(result.status).toBe("audio_verified");
    expect(result.message).toMatch(/Audio verified/i);
    expect(result.message).not.toMatch(/corrupted/i);
  });

  it("AUDI mismatch still reports mismatch", async () => {
    const mp5 = writeMp5({
      head,
      meta,
      audioFrames,
      seek,
      optional: new Map([
        ["FING", encodeFing({ audiHash: "a".repeat(64), source: "encoder" })],
      ]),
    });
    const parsed = parseMp5(mp5);
    const result = await verifyMp5FileIntegrity(parsed, mp5);
    expect(result.status).toBe("mismatch");
    expect(result.fileHashInformational).toBeFalsy();
  });

  it("non-HASH chunk mismatch is not informational", async () => {
    const base = writeMp5({ head, meta, audioFrames, seek });
    const audiHash = sha256Hex(encodeAudiPayload(audioFrames));
    const badMetaHash = sha256Hex(new Uint8Array([0]));
    const withFp = writeMp5({
      head,
      meta,
      audioFrames,
      seek,
      optional: new Map([
        ["FING", encodeFing({ audiHash, source: "encoder" })],
        [
          "HASH",
          encodeHash({
            chunks: [
              { fourcc: "AUDI", sha256: audiHash },
              { fourcc: "META", sha256: badMetaHash },
            ],
          }),
        ],
      ]),
    });
    const parsed = parseMp5(withFp);
    const result = await verifyMp5FileIntegrity(parsed, withFp);
    expect(result.status).toBe("mismatch");
    expect(isInformationalFileHashMismatch({
      fileHashOk: true,
      pcmHashOk: null,
      audiHashOk: true,
      chunkChecks: result.chunkChecks,
    })).toBe(false);
  });

  it("strict profile passes with audio_verified integrity", async () => {
    const base = writeMp5({ head, meta, audioFrames, seek });
    const audiHash = sha256Hex(encodeAudiPayload(audioFrames));
    const fileHashPre = sha256Hex(base);
    const withFp = writeMp5({
      head,
      meta,
      audioFrames,
      seek,
      optional: new Map([
        ["FING", encodeFing({ audiHash, fileHash: fileHashPre, source: "encoder" })],
        ["HASH", encodeHash({ fileSha256: fileHashPre, chunks: [{ fourcc: "AUDI", sha256: audiHash }] })],
      ]),
    });
    const parsed = parseMp5(withFp);
    const integrity = await verifyMp5FileIntegrity(parsed, withFp);
    const report = assessMp5Compatibility(parsed, {
      fileSize: withFp.length,
      integrity,
    });
    expect(integrity.status).toBe("audio_verified");
    expect(report.profiles.strict).toBe(true);
  });

  it("resolveIntegrityStatus distinguishes audio_verified from verified", () => {
    const audioVerified = resolveIntegrityStatus({
      fileHashOk: false,
      pcmHashOk: null,
      audiHashOk: true,
      metaHashOk: null,
      chunkChecks: [],
      hasAnyExpected: true,
    });
    expect(audioVerified.status).toBe("audio_verified");
    expect(audioVerified.fileHashInformational).toBe(true);
  });
});
