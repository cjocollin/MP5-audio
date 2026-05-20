import { describe, it, expect } from "vitest";
import { CodecId, writeMp5 } from "@mp5/container";

describe("mp5c container", () => {
  it("embeds MP5-C codec id in HEAD", () => {
    const buf = writeMp5({
      head: {
        codecId: CodecId.MP5C,
        channels: 2,
        bitsPerSample: 16,
        presetId: 1,
        sampleRate: 48000,
        totalSamples: 2304n,
        encoderVersion: 1,
      },
      audioFrames: [
        { frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([0x43, 0x01]) },
      ],
    });
    expect(buf[0]).toBe(0x4d); // M
  });
});
