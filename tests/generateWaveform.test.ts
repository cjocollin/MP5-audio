import { describe, expect, it } from "vitest";
import { generateWaveform } from "../apps/web/src/converter/generateWaveform";

describe("generateWaveform", () => {
  it("includes energy from every audio channel", () => {
    const rightOnlyStereo = new Int16Array([
      0, 32767,
      0, 32767,
      0, 32767,
      0, 32767,
    ]);

    const waveform = generateWaveform(rightOnlyStereo, 2, 1);

    expect(waveform.peak).toBeGreaterThan(0.99);
    expect(waveform.rms).toBeGreaterThan(0.7);
    expect(waveform.peaks[0]).toBeGreaterThan(0.75);
  });

  it("does not pad short audio with empty waveform buckets", () => {
    const shortMono = new Int16Array([1000, 2000, 3000, 4000]);

    const waveform = generateWaveform(shortMono, 1, 8);

    expect(waveform.peaks).toHaveLength(4);
    expect(waveform.peaks.every((value) => value > 0)).toBe(true);
  });

  it("uses 1024 source measurements by default", () => {
    const mono = new Int16Array(2048).fill(4000);

    expect(generateWaveform(mono, 1).peaks).toHaveLength(1024);
  });
});
