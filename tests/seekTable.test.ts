import { describe, it, expect } from "vitest";
import { parseMp5, writeMp5, CodecId, validateSeekTable } from "@mp5/container";

describe("seekTable", () => {
  it("validates monotonic seek entries", () => {
    expect(() =>
      validateSeekTable([
        { sampleOffset: 0n, byteOffset: 0n },
        { sampleOffset: 100n, byteOffset: 50n },
      ]),
    ).not.toThrow();
    expect(() =>
      validateSeekTable([
        { sampleOffset: 100n, byteOffset: 0n },
        { sampleOffset: 50n, byteOffset: 10n },
      ]),
    ).toThrow();
  });

  it("roundtrips SEEK chunk", () => {
    const seek = [
      { sampleOffset: 0n, byteOffset: 100n },
      { sampleOffset: 44100n, byteOffset: 5000n },
    ];
    const buf = writeMp5({
      head: {
        codecId: CodecId.MP5C,
        channels: 1,
        bitsPerSample: 16,
        presetId: 1,
        sampleRate: 44100,
        totalSamples: 88200n,
        encoderVersion: 1,
      },
      audioFrames: [
        { frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(8) },
      ],
      seek,
    });
    const p = parseMp5(buf);
    expect(p.seek).toHaveLength(2);
    expect(p.seek[1]?.sampleOffset).toBe(44100n);
  });
});
