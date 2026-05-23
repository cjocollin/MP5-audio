import { describe, expect, it } from "vitest";
import { computePlaybackTime } from "../apps/web/src/player/playbackTime";

/**
 * Regression: capturePlayhead must be idempotent.
 *
 * Earlier behavior: `capturePlayhead` advanced `offsetRef` using
 * `(ctx.currentTime - startedAtRef)` but did NOT reset `startedAtRef`.
 * A second call (e.g. after a blocking `pcmToAudioBuffer` build during
 * `patchStemAudible` / `insertStemAtCurrentOffset`) re-added the full
 * elapsed-since-original-start, shoving the late-joined stem tens of
 * seconds past the rest of the mix — verse-vs-chorus desync.
 *
 * Fix: every successful capture also re-anchors `startedAtRef` to
 * `ctx.currentTime` so repeated capture reads the true elapsed delta.
 */
describe("stem mixer clock anchor — capturePlayhead idempotency", () => {
  const duration = 211;

  function makeAnchor(initialOffset: number, initialStartedAt: number) {
    let offsetRef = initialOffset;
    let startedAtRef = initialStartedAt;
    return {
      capture(ctxTime: number, hasSources: boolean): number {
        if (hasSources) {
          offsetRef = computePlaybackTime(offsetRef, ctxTime, startedAtRef, duration);
          startedAtRef = ctxTime;
        }
        return offsetRef;
      },
      offsetRef: () => offsetRef,
      startedAtRef: () => startedAtRef,
    };
  }

  it("two consecutive captures with no real time advance return the same value", () => {
    const a = makeAnchor(30, 100);
    const first = a.capture(160, true);
    const second = a.capture(160, true);
    expect(first).toBeCloseTo(90, 6);
    expect(second).toBeCloseTo(90, 6);
  });

  it("capture after a long blocking decode does NOT double-count elapsed time", () => {
    const a = makeAnchor(30, 100);
    const playheadBefore = a.capture(160, true);
    expect(playheadBefore).toBeCloseTo(90, 6);
    // Simulate ~1.5s spent in pcmToAudioBuffer while audio kept playing.
    const playheadAfter = a.capture(161.5, true);
    expect(playheadAfter).toBeCloseTo(91.5, 6);
    expect(playheadAfter - playheadBefore).toBeLessThan(2);
  });

  it("never returns a value far past the actual playhead even across many captures", () => {
    const a = makeAnchor(0, 0);
    let ctxTime = 0;
    for (let i = 0; i < 10; i++) {
      ctxTime += 5;
      const ph = a.capture(ctxTime, true);
      expect(ph).toBeCloseTo(ctxTime, 6);
    }
  });

  it("does not advance when no sources are active (paused mix)", () => {
    const a = makeAnchor(45, 100);
    expect(a.capture(200, false)).toBe(45);
    expect(a.capture(300, false)).toBe(45);
  });
});
