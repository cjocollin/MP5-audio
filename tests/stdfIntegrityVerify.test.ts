import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  encodeHash,
  parseMp5,
  verifyMp5FileIntegrity,
  writeMp5,
  CodecId,
} from "@mp5/container";

function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("STDF integrity verify", () => {
  it("matches STDF HASH entries by fragment order when sizes repeat", async () => {
    const fragA = new Uint8Array([1, 2, 3]);
    const fragB = new Uint8Array([4, 5, 6]);
    const fragC = new Uint8Array([7, 8, 9]);
    const audioFrames = [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([1]) }];
    const mp5 = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 1n,
        encoderVersion: 1,
      },
      audioFrames,
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      extraChunks: [
        { fourcc: "STDF", payload: fragA },
        { fourcc: "STDF", payload: fragB },
        { fourcc: "STDF", payload: fragC },
      ],
      optional: new Map([
        [
          "HASH",
          encodeHash({
            chunks: [
              { fourcc: "STDF", sha256: sha256Hex(fragA), size: fragA.length },
              { fourcc: "STDF", sha256: sha256Hex(fragB), size: fragB.length },
              { fourcc: "STDF", sha256: sha256Hex(fragC), size: fragC.length },
            ],
          }),
        ],
      ]),
    });
    const parsed = parseMp5(mp5);
    const result = await verifyMp5FileIntegrity(parsed, mp5);
    expect(result.chunkChecks.every((c) => c.ok !== false)).toBe(true);
    expect(result.status).not.toBe("mismatch");
  });
});
