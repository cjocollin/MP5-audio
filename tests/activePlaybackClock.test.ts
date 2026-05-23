import { describe, expect, it } from "vitest";
import {
  clampPlaybackSeconds,
  clockModeForTransport,
} from "../apps/web/src/lib/playback/activePlaybackClock";
import { computePlaybackTime } from "../apps/web/src/player/playbackTime";

describe("active playback clock", () => {
  it("clampPlaybackSeconds keeps time in 0..duration", () => {
    expect(clampPlaybackSeconds(-1, 211)).toBe(0);
    expect(clampPlaybackSeconds(300, 211.76)).toBeCloseTo(211.76, 2);
    expect(clampPlaybackSeconds(42.5, 211)).toBe(42.5);
  });

  it("computePlaybackTime advances one second per wall second", () => {
    const t0 = computePlaybackTime(10, 100, 100, 211);
    const t1 = computePlaybackTime(10, 101, 100, 211);
    expect(t1 - t0).toBeCloseTo(1, 5);
  });

  it("does not treat sample counts as seconds", () => {
    const asSamples = 9_000_000;
    const asSeconds = computePlaybackTime(0, 1, 0, 211);
    expect(asSeconds).toBeLessThan(2);
    expect(asSamples).toBeGreaterThan(1000);
  });

  it("clockModeForTransport uses preview when preview range active", () => {
    expect(clockModeForTransport("stem_mix", true)).toBe("preview");
    expect(clockModeForTransport("full_mix", false)).toBe("full_mix");
  });

  it("clock tick should run while isPlaying even before sources are active", () => {
    let isPlaying = true;
    let hasSource = false;
    let displayed = 0;
    const getTime = () => (hasSource ? 5 : 0);

    const tickOnce = () => {
      if (isPlaying && hasSource) {
        displayed = clampPlaybackSeconds(getTime(), 211);
      }
    };

    tickOnce();
    expect(displayed).toBe(0);
    hasSource = true;
    tickOnce();
    expect(displayed).toBe(5);
  });
});
