import { describe, it, expect } from "vitest";
import { CodecId, parseMp5, writeMp5 } from "@mp5/container";

describe("metadata artwork waveform roundtrip", () => {
  it("preserves meta, cover, and waveform", () => {
    const cover = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    const waveform = [0.1, 0.5, 0.9, 0.2];
    const buf = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 48000,
        totalSamples: 4n,
        encoderVersion: 1,
      },
      meta: [
        { key: "title", value: "Roundtrip" },
        { key: "artist", value: "Tester" },
      ],
      cover,
      waveform,
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(8) }],
    });
    const p = parseMp5(buf);
    expect(p.meta.find((m) => m.key === "title")?.value).toBe("Roundtrip");
    expect(p.cover).toEqual(cover);
    expect(p.waveform.length).toBe(waveform.length);
    expect(p.waveform[2]).toBeCloseTo(0.9);
  });
});
