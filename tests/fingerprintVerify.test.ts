import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  encodeAudiPayload,
  encodeFing,
  encodeMeta,
  parseMp5,
  writeMp5,
  CodecId,
} from "@mp5/container";
import { verifyMp5Integrity } from "../apps/web/src/lib/fingerprint/verify";

function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("verifyMp5Integrity", () => {
  it("reports verified when hashes match", async () => {
    const pcm = new Int16Array([0, 100, -100, 200]);
    const pcmBytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const audioFrames = [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([9, 8, 7]) }];
    const audiPayload = encodeAudiPayload(audioFrames);
    const meta = [{ key: "title", value: "v" }];
    const pcmHash = sha256Hex(pcmBytes);
    const audiHash = sha256Hex(audiPayload);
    const metaHash = sha256Hex(encodeMeta(meta));
    const mp5 = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 4n,
        encoderVersion: 1,
      },
      meta,
      audioFrames,
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      optional: new Map([
        [
          "FING",
          encodeFing({
            pcmHash,
            audiHash,
            metaHash,
            source: "encoder",
          }),
        ],
      ]),
    });
    const parsed = parseMp5(mp5);
    const result = await verifyMp5Integrity(parsed, mp5, { pcmSamples: pcm });
    expect(result.status).toBe("verified");
    expect(result.audiHash?.ok).toBe(true);
    expect(result.pcmHash?.ok).toBe(true);
  });

  it("reports mismatch when audi hash differs", async () => {
    const audioFrames = [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([1]) }];
    const mp5 = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 100n,
        encoderVersion: 1,
      },
      audioFrames,
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      optional: new Map([
        ["FING", encodeFing({ audiHash: "a".repeat(64), source: "encoder" })],
      ]),
    });
    const parsed = parseMp5(mp5);
    const result = await verifyMp5Integrity(parsed, mp5);
    expect(result.status).toBe("mismatch");
  });

  it("missing fingerprint does not imply failure", async () => {
    const mp5 = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 100n,
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(10) }],
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    });
    const parsed = parseMp5(mp5);
    const result = await verifyMp5Integrity(parsed, mp5);
    expect(result.status).toBe("missing");
    expect(parsed.head?.codecId).toBe(CodecId.PCM);
  });
});
