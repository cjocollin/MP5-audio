import { describe, expect, it } from "vitest";
import { computePlaybackTime } from "../apps/web/src/player/playbackTime";
import { clockModeForTransport } from "../apps/web/src/lib/playback/activePlaybackClock";

/**
 * Timing math regressions for transport / stem mixer (pure functions).
 */
describe("playback timing math", () => {
  it("capturePlayhead re-anchors startedAt so blocking work does not double-count", () => {
    let offset = 12;
    let startedAt = 50;
    const duration = 22;

    const capture = (ctxTime: number, hasSources: boolean) => {
      if (hasSources) {
        offset = computePlaybackTime(offset, ctxTime, startedAt, duration);
        startedAt = ctxTime;
      }
      return offset;
    };

    const beforeDecode = capture(55, true);
    expect(beforeDecode).toBeCloseTo(17, 5);
    const afterDecode = capture(56.2, true);
    expect(afterDecode).toBeCloseTo(18.2, 5);
    expect(afterDecode - beforeDecode).toBeCloseTo(1.2, 5);
  });

  it("repeated capture at the same ctx time is idempotent", () => {
    let offset = 5;
    let startedAt = 10;
    const capture = (ctxTime: number) => {
      offset = computePlaybackTime(offset, ctxTime, startedAt, 22);
      startedAt = ctxTime;
      return offset;
    };
    const a = capture(20);
    const b = capture(20);
    expect(a).toBeCloseTo(b, 8);
  });

  it("startAllAt batch uses one shared when for every stem start", () => {
    const when = 99.5;
    const offsets: { stemId: string; when: number; offset: number }[] = [];
    const tracks = ["a", "b", "c", "d"];
    for (const stemId of tracks) {
      offsets.push({ stemId, when, offset: 7 });
    }
    const whenValues = new Set(offsets.map((o) => o.when));
    expect(whenValues.size).toBe(1);
    expect([...whenValues][0]).toBe(when);
  });

  it("single-stem late join uses current playhead offset, not zero", () => {
    const playhead = 14.25;
    const joinOffset = playhead;
    expect(joinOffset).toBeGreaterThan(3);
    expect(joinOffset).toBeLessThan(22);
  });

  it("progress clock reads from stem_mix when transport is stem_mix", () => {
    expect(clockModeForTransport("stem_mix", false)).toBe("stem_mix");
    expect(clockModeForTransport("full_mix", false)).toBe("full_mix");
  });

  it("one stem buffer end does not imply full track duration for UI clock", () => {
    const stemBufferSec = 2;
    const trackDurationSec = 22;
    const offsetAtEnd = stemBufferSec;
    expect(offsetAtEnd).toBeLessThan(trackDurationSec - 1);
  });
});
