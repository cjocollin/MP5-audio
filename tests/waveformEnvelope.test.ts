import { describe, expect, it } from "vitest";
import {
  resampleWaveformEnvelope,
  smoothWaveformEnvelope,
  waveformScaleReference,
} from "../apps/web/src/player/waveformEnvelope";

describe("waveform display envelope", () => {
  it("keeps steady energy steady when reducing buckets", () => {
    expect(resampleWaveformEnvelope([0.5, 0.5, 0.5, 0.5], 1)).toEqual([0.5]);
  });

  it("preserves a transient without letting one sample fill the entire bucket", () => {
    const [bar] = resampleWaveformEnvelope([0, 0, 0, 1], 1);

    expect(bar).toBeGreaterThan(0.4);
    expect(bar).toBeLessThan(0.8);
  });

  it("uses light neighboring smoothing without moving the strongest point", () => {
    const smoothed = smoothWaveformEnvelope([0, 0, 1, 0, 0]);

    expect(smoothed[1]).toBeGreaterThan(0);
    expect(smoothed[2]).toBeGreaterThan(smoothed[1]!);
    expect(smoothed[3]).toBe(smoothed[1]);
  });

  it("scales against the 98th percentile instead of one extreme spike", () => {
    const values = [...new Array<number>(100).fill(0.5), 10];

    expect(waveformScaleReference(values)).toBeCloseTo(0.5);
  });
});
