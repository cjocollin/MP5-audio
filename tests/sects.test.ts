import { describe, it, expect } from "vitest";
import {
  encodeSect,
  decodeSect,
  encodeHook,
  decodeHook,
  encodeHilt,
  decodeHilt,
  sortSections,
  parseMp5,
  writeMp5,
  CodecId,
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

describe("SECT / HOOK / HILT chunks", () => {
  it("roundtrips song sections", () => {
    const payload = {
      version: 1,
      source: "user",
      sections: [
        { sectionId: "a", type: "intro" as const, startMs: 0, endMs: 12000, title: "Opening" },
        { sectionId: "b", type: "chorus" as const, startMs: 45000, endMs: 70000, title: "Chorus" },
      ],
    };
    const decoded = decodeSect(encodeSect(payload));
    expect(decoded?.sections).toHaveLength(2);
    expect(decoded?.sections[0]?.startMs).toBe(0);
    expect(decoded?.sections[1]?.type).toBe("chorus");
  });

  it("sorts sections on encode", () => {
    const out = decodeSect(
      encodeSect({
        sections: [
          { sectionId: "b", type: "chorus", startMs: 5000 },
          { sectionId: "a", type: "intro", startMs: 0 },
        ],
      }),
    );
    expect(out?.sections[0]?.type).toBe("intro");
  });

  it("roundtrips HOOK chunk", () => {
    const hook = { sectionId: "h1", startMs: 900, endMs: 1200, label: "Main hook" };
    const d = decodeHook(encodeHook(hook));
    expect(d?.startMs).toBe(900);
    expect(d?.label).toBe("Main hook");
  });

  it("roundtrips HILT highlights", () => {
    const d = decodeHilt(
      encodeHilt({
        highlights: [{ startMs: 600, endMs: 900, label: "Peak", useCase: "chorus" }],
        source: "user",
      }),
    );
    expect(d?.highlights).toHaveLength(1);
    expect(d?.highlights[0]?.useCase).toBe("chorus");
  });

  it("parses file without SECT without throwing", () => {
    const p = parseMp5(minimalMp5(new Map()));
    expect(p.optional.has("SECT")).toBe(false);
  });

  it("rejects empty SECT payload", () => {
    const raw = new TextEncoder().encode(JSON.stringify({ sections: [] }));
    expect(decodeSect(raw)).toBeNull();
  });
});

describe("sortSections", () => {
  it("orders by startMs", () => {
    const sorted = sortSections([
      { sectionId: "b", type: "verse", startMs: 1000 },
      { sectionId: "a", type: "intro", startMs: 0 },
    ]);
    expect(sorted[0]?.sectionId).toBe("a");
  });
});
