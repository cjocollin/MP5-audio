import { describe, it, expect } from "vitest";
import { MAGIC_STR, parseMp5, writeMp5, CodecId } from "@mp5/container";

describe("containerWriter", () => {
  it("writes MP5A magic", () => {
    const buf = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 48000,
        totalSamples: 100n,
        encoderVersion: 1,
      },
      audioFrames: [
        { frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(4) },
      ],
    });
    const magic = String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!);
    expect(magic).toBe(MAGIC_STR);
    expect(parseMp5(buf).head?.sampleRate).toBe(48000);
  });
});
