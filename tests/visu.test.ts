import { describe, it, expect } from "vitest";
import {
  encodeVisu,
  decodeVisu,
  parseHexColor,
  parseMp5,
  writeMp5,
  CodecId,
  parseOptionalMetadata,
} from "@mp5/container";

function minimalMp5(optional: Map<string, Uint8Array>): Uint8Array {
  return writeMp5({
    head: {
      codecId: CodecId.PCM,
      channels: 1,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: 44100,
      totalSamples: 1000n,
      encoderVersion: 1,
    },
    meta: [{ key: "title", value: "t" }],
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(2000) }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    optional,
  });
}

describe("VISU chunk", () => {
  it("roundtrips visual theme fields", () => {
    const payload = {
      themeName: "Night drive",
      primaryColor: "#6366f1",
      accentColor: "#8b5cf6",
      backgroundColor: "#1e1b4b",
      moodLabel: "calm",
      visualIntensity: "low" as const,
      playerStyle: "calm" as const,
      source: "user" as const,
      gradientStops: ["#1e1b4b", "#6366f1"],
    };
    const decoded = decodeVisu(encodeVisu(payload));
    expect(decoded?.themeName).toBe("Night drive");
    expect(decoded?.accentColor).toBe("#8b5cf6");
    expect(decoded?.visualIntensity).toBe("low");
    expect(decoded?.gradientStops).toEqual(["#1e1b4b", "#6366f1"]);
  });

  it("rejects invalid colors and css injection", () => {
    const decoded = decodeVisu(
      encodeVisu({
        themeName: "Safe",
        primaryColor: "red",
        accentColor: "#8b5cf6",
        backgroundColor: "url(evil)",
        textColor: "#fff",
      }),
    );
    expect(decoded?.primaryColor).toBeUndefined();
    expect(decoded?.backgroundColor).toBeUndefined();
    expect(decoded?.textColor).toBe("#ffffff");
    expect(decoded?.accentColor).toBe("#8b5cf6");
  });

  it("sanitizes theme name strings", () => {
    const decoded = decodeVisu(
      encodeVisu({
        themeName: "Hello\x00<script>",
        accentColor: "#112233",
      }),
    );
    expect(decoded?.themeName).not.toContain("\x00");
    expect(decoded?.themeName?.length).toBeLessThanOrEqual(128);
  });

  it("returns null for empty theme", () => {
    expect(decodeVisu(encodeVisu({ accentColor: "#aabbcc" }))).toBeTruthy();
    expect(decodeVisu(new Uint8Array())).toBeNull();
  });

  it("parseOptionalMetadata includes visu", () => {
    const buf = minimalMp5(
      new Map([
        [
          "VISU",
          encodeVisu({
            themeName: "T",
            accentColor: "#ff00ff",
          }),
        ],
      ]),
    );
    const parsed = parseMp5(buf);
    const meta = parseOptionalMetadata(parsed.optional ?? new Map());
    expect(meta.visu?.themeName).toBe("T");
  });

  it("parseHexColor accepts short hex", () => {
    expect(parseHexColor("#abc")).toBe("#aabbcc");
    expect(parseHexColor("#AABBCC")).toBe("#aabbcc");
  });
});
