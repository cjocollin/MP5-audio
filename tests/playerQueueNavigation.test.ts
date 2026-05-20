import { describe, it, expect } from "vitest";
import {
  buildShuffleOrder,
  computeAdvanceAfterEnd,
  computeManualNextIndex,
  cycleRepeatMode,
  isPlayableTrack,
  resolveAutoAdvanceIndex,
  shuffleIndices,
} from "../apps/web/src/player/queueNavigation";
import type { PlaylistTrack } from "../apps/web/src/store/playerStore";

function track(id: string, opts?: { parseError?: string; file?: boolean }): PlaylistTrack {
  return {
    id,
    name: `${id}.mp5`,
    parseError: opts?.parseError,
    file: opts?.file === false ? undefined : new File([], `${id}.mp5`),
  };
}

describe("queueNavigation", () => {
  it("cycles repeat modes", () => {
    expect(cycleRepeatMode("off")).toBe("all");
    expect(cycleRepeatMode("all")).toBe("one");
    expect(cycleRepeatMode("one")).toBe("off");
  });

  it("advances linearly with repeat off", () => {
    const tracks = [track("a"), track("b"), track("c")];
    expect(
      computeManualNextIndex({
        tracks,
        currentIndex: 0,
        repeatMode: "off",
        shuffle: false,
        shuffleOrder: [],
      }),
    ).toBe(1);
    expect(
      computeManualNextIndex({
        tracks,
        currentIndex: 2,
        repeatMode: "off",
        shuffle: false,
        shuffleOrder: [],
      }),
    ).toBeNull();
  });

  it("wraps with repeat all", () => {
    const tracks = [track("a"), track("b")];
    expect(
      computeManualNextIndex({
        tracks,
        currentIndex: 1,
        repeatMode: "all",
        shuffle: false,
        shuffleOrder: [],
      }),
    ).toBe(0);
  });

  it("returns repeat_one when repeat one at end", () => {
    const tracks = [track("a"), track("b")];
    expect(
      computeAdvanceAfterEnd({
        tracks,
        currentIndex: 0,
        repeatMode: "one",
        shuffle: false,
        shuffleOrder: [],
      }),
    ).toEqual({ type: "repeat_one" });
  });

  it("shuffle order avoids starting with only current when multiple tracks", () => {
    const tracks = [track("a"), track("b"), track("c")];
    const order = buildShuffleOrder(tracks, 1, () => 0.5);
    expect(order[0]).toBe(1);
    expect(order).toHaveLength(3);
    expect(new Set(order).size).toBe(3);
  });

  it("shuffle next uses order and avoids immediate repeat when possible", () => {
    const tracks = [track("a"), track("b"), track("c")];
    const shuffleOrder = [0, 2, 1];
    expect(
      computeManualNextIndex({
        tracks,
        currentIndex: 0,
        repeatMode: "off",
        shuffle: true,
        shuffleOrder,
      }),
    ).toBe(2);
    expect(
      computeManualNextIndex({
        tracks,
        currentIndex: 2,
        repeatMode: "off",
        shuffle: true,
        shuffleOrder,
      }),
    ).toBe(1);
  });

  it("skips unreadable tracks when auto-advancing", () => {
    const tracks = [track("a"), track("b", { parseError: "x" }), track("c")];
    expect(isPlayableTrack(tracks[1]!)).toBe(false);
    const next = computeManualNextIndex({
      tracks,
      currentIndex: 0,
      repeatMode: "off",
      shuffle: false,
      shuffleOrder: [],
    });
    expect(next).toBe(2);
    const idx = resolveAutoAdvanceIndex(tracks, next!, "off", false, []);
    expect(idx).toBe(2);
  });

  it("shuffleIndices is deterministic with injectable rng", () => {
    let i = 0;
    const rng = () => [0.9, 0.1, 0.5][i++ % 3]!;
    expect(shuffleIndices([1, 2, 3], rng)).not.toEqual([1, 2, 3]);
  });
});
