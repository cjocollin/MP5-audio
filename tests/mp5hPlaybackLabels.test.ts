import { describe, expect, it } from "vitest";
import { CodecId } from "@mp5/container";
import { describeMp5hPlayback } from "../apps/web/src/lib/codecDisplay";

function mockMp5h(hasCorr: boolean, presetId = 2) {
  return {
    head: {
      codecId: CodecId.MP5H,
      presetId,
      sampleRate: 48000,
      channels: 2,
      bitsPerSample: 16,
      totalSamples: 1000,
    },
    corr: hasCorr ? [{ data: new Uint8Array([1, 2, 3]) }] : [],
    audioFrames: [],
    meta: [],
    info: [],
    optional: new Map(),
    cover: undefined,
    waveform: [],
  };
}

describe("describeMp5hPlayback", () => {
  it("labels enhanced decode when CORR is present", () => {
    const labels = describeMp5hPlayback(mockMp5h(true), true);
    expect(labels.containerMode).toBe("MP5-H Hybrid");
    expect(labels.baseLayer).toContain("MP5-C");
    expect(labels.correctionLayer).toBe("CORR present");
    expect(labels.decodeMode).toContain("Enhanced");
    expect(labels.outputQuality).toContain("Lossless restored");
    expect(labels.warning).toBeUndefined();
  });

  it("warns when CORR is missing", () => {
    const labels = describeMp5hPlayback(mockMp5h(false), false);
    expect(labels.correctionLayer).toBe("CORR missing");
    expect(labels.decodeMode).toContain("Base only");
    expect(labels.outputQuality).not.toMatch(/lossless restored/i);
    expect(labels.warning).toMatch(/CORR/i);
    expect(labels.warning).toMatch(/hiss|artifact/i);
  });

  it("does not claim restored quality without CORR", () => {
    const labels = describeMp5hPlayback(mockMp5h(false), false);
    expect(labels.outputQuality.toLowerCase()).toContain("not restored");
  });
});
