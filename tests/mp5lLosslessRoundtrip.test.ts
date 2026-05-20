import { describe, it, expect } from "vitest";
import { CodecId, parseMp5, writeMp5 } from "@mp5/container";

/** PCM-in-container roundtrip (codec body passthrough when WASM unavailable) */
describe("mp5l container roundtrip", () => {
  it("writes MP5-L file structure", () => {
    const pcm = new Int16Array(100);
    for (let i = 0; i < 100; i++) pcm[i] = Math.sin(i * 0.1) * 1000;
    const bytes = new Uint8Array(pcm.buffer);
    const buf = writeMp5({
      head: {
        codecId: CodecId.MP5L,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 100n,
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: bytes }],
    });
    const p = parseMp5(buf);
    expect(p.head?.codecId).toBe(CodecId.MP5L);
    expect(p.audioFrames[0]?.data.length).toBe(bytes.length);
  });
});
