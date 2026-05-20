import { describe, it, expect } from "vitest";
import { parseMp5, writeMp5, CodecId } from "@mp5/container";

describe("contentWarningsOptional", () => {
  it("parses without EXPL chunk", () => {
    const buf = writeMp5({
      head: {
        codecId: CodecId.MP5C,
        channels: 1,
        bitsPerSample: 16,
        presetId: 1,
        sampleRate: 44100,
        totalSamples: 0n,
        encoderVersion: 1,
      },
      audioFrames: [
        { frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(2) },
      ],
    });
    expect(parseMp5(buf).optional.has("EXPL")).toBe(false);
  });

  it("stores EXPL as optional payload", () => {
    const expl = new TextEncoder().encode(
      JSON.stringify({ explicit: true, contentWarnings: ["strong language"] }),
    );
    const optional = new Map([["EXPL", expl]]);
    const buf = writeMp5({
      head: {
        codecId: CodecId.MP5C,
        channels: 1,
        bitsPerSample: 16,
        presetId: 1,
        sampleRate: 44100,
        totalSamples: 0n,
        encoderVersion: 1,
      },
      audioFrames: [
        { frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(2) },
      ],
      optional,
    });
    const p = parseMp5(buf);
    expect(p.optional.get("EXPL")).toBeDefined();
  });
});
