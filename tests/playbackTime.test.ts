import { describe, it, expect } from "vitest";
import { computePlaybackTime } from "../apps/web/src/player/playbackTime";

describe("computePlaybackTime", () => {
  it("advances with context clock", () => {
    expect(computePlaybackTime(1, 3.5, 2, 10)).toBeCloseTo(2.5);
  });

  it("clamps to duration", () => {
    expect(computePlaybackTime(8, 100, 0, 10)).toBe(10);
  });

  it("does not go below zero", () => {
    expect(computePlaybackTime(0, 0.5, 2, 10)).toBe(0);
  });
});
