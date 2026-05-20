import { describe, it, expect } from "vitest";
import {
  CodecId,
  parseMp5,
  writeMp5,
  type AudioFrame,
} from "@mp5/container";

describe("containerParser", () => {
  it("roundtrips HEAD META AUDI", () => {
    const frames: AudioFrame[] = [
      { frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([1, 2, 3]) },
    ];
    const buf = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 1152n,
        encoderVersion: 1,
      },
      meta: [{ key: "title", value: "Test" }],
      audioFrames: frames,
    });
    const parsed = parseMp5(buf);
    expect(parsed.head?.codecId).toBe(CodecId.PCM);
    expect(parsed.meta[0]?.value).toBe("Test");
    expect(parsed.audioFrames).toHaveLength(1);
  });

  it("rejects invalid magic", () => {
    const bad = new Uint8Array(20);
    expect(() => parseMp5(bad)).toThrow();
  });

  it("skips unknown optional chunk", () => {
    const frames: AudioFrame[] = [
      { frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([0]) },
    ];
    const optional = new Map<string, Uint8Array>();
    optional.set("MOOD", new Uint8Array([1, 2, 3]));
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
      audioFrames: frames,
      optional,
    });
    const parsed = parseMp5(buf);
    expect(parsed.optional.get("MOOD")).toBeDefined();
  });
});
