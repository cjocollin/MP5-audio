import { describe, it, expect } from "vitest";
import { parseMp5, writeMp5, CodecId } from "@mp5/container";

describe("aiChunksOptional", () => {
  it("plays path with zero AI chunks", () => {
    const buf = writeMp5({
      head: {
        codecId: CodecId.MP5L,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 0n,
        encoderVersion: 1,
      },
      audioFrames: [
        { frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([1]) },
      ],
    });
    const p = parseMp5(buf);
    expect(p.optional.size).toBe(0);
    expect(p.head?.codecId).toBe(CodecId.MP5L);
  });
});
