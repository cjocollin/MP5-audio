import { describe, it, expect } from "vitest";
import { CodecId } from "@mp5/container";
import { assessStemMixSafety, estimateStemDecodedBytes } from "../apps/web/src/lib/stems/stemLimits";
import type { StemDescriptor } from "@mp5/container";

function fakeStem(overrides: Partial<StemDescriptor>): StemDescriptor {
  return {
    stemId: "id",
    stemName: "Stem",
    stemType: "drums",
    codecId: CodecId.MP5L,
    sampleRate: 48000,
    channels: 2,
    durationSamples: 48000,
    byteLength: 1000,
    defaultVolume: 1,
    soloMuteCapable: true,
    requiredForPlayback: false,
    dataOffset: 0,
    dataLength: 1000,
    ...overrides,
  };
}

describe("stem mix memory guardrails", () => {
  it("allows small synthetic demo stems", () => {
    const stems = [
      fakeStem({ stemName: "Drums", durationSamples: 44100 }),
      fakeStem({ stemName: "Bass", durationSamples: 44100 }),
    ];
    expect(assessStemMixSafety(stems).ok).toBe(true);
  });

  it("blocks excessive total decoded size", () => {
    const huge = fakeStem({
      durationSamples: 48_000_000,
      sampleRate: 48000,
      channels: 2,
    });
    const result = assessStemMixSafety([huge]);
    expect(result.ok).toBe(false);
    expect(result.block).toBeTruthy();
  });

  it("estimates decoded bytes from duration", () => {
    const bytes = estimateStemDecodedBytes(
      fakeStem({ durationSamples: 1000, channels: 2 }),
    );
    expect(bytes).toBe(4000);
  });
});
