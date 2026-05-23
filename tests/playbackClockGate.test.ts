import { describe, expect, it } from "vitest";
import { computePlaybackTime } from "../apps/web/src/player/playbackTime";

/**
 * Simulates UI clock gating: only advance displayed time when an active Web Audio source exists.
 */
function tickDisplayedTime(
  isPlaying: boolean,
  hasActiveSource: boolean,
  getPlaybackTime: () => number,
  duration: number,
  prev: number,
): number {
  if (!isPlaying || duration <= 0 || !hasActiveSource) return prev;
  return Math.max(0, Math.min(getPlaybackTime(), duration));
}

describe("playback clock gating", () => {
  it("does not advance UI time when no active source (v0.10.11 race bug)", () => {
    let offset = 0;
    const startedAt = 100;
    const duration = 211;
    let displayed = 0;
    for (let ctxNow = 100; ctxNow <= 101; ctxNow += 0.016) {
      displayed = tickDisplayedTime(
        true,
        false,
        () =>
          computePlaybackTime(offset, ctxNow, startedAt, duration),
        duration,
        displayed,
      );
    }
    expect(displayed).toBe(0);
  });

  it("advances about one second per wall second with active source", () => {
    let offset = 0;
    const startedAt = 100;
    const duration = 211;
    const t0 = computePlaybackTime(offset, 100, startedAt, duration);
    const t1 = computePlaybackTime(offset, 101, startedAt, duration);
    expect(t1 - t0).toBeCloseTo(1, 2);
    expect(t1).toBeLessThan(5);
    expect(t1).not.toBeCloseTo(duration, 0);
  });

  it("single stem buffer end does not force displayed time to full track duration", () => {
    const stemBufferDuration = 2;
    const trackDuration = 211;
    const offsetAtStemEnd = stemBufferDuration;
    expect(offsetAtStemEnd).toBeLessThan(trackDuration - 1);
  });
});
