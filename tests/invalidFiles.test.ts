import { describe, it, expect } from "vitest";
import { parseMp5, writeMp5, CodecId } from "@mp5/container";

describe("invalidFiles", () => {
  it("rejects truncated file", () => {
    expect(() => parseMp5(new Uint8Array(4))).toThrow();
  });

  it("parses minimal HEAD+AUDI", () => {
    const buf = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 0n,
        encoderVersion: 1,
      },
      audioFrames: [
        { frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(0) },
      ],
    });
    const p = parseMp5(buf);
    expect(p.audioFrames.length).toBeGreaterThan(0);
  });
});
