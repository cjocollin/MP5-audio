import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  gaplessScheduleTime,
  resolveGaplessNextTrackId,
} from "../apps/web/src/player/gaplessPlayback";

const base = {
  enabled: true,
  playing: true,
  shuffle: false,
  repeatMode: "off",
  stemPlayback: false,
  hasActiveRange: false,
  currentIndex: 0,
  queue: [{ id: "one" }, { id: "two" }],
  albumTrackIds: ["one", "two"],
};

describe("gapless album playback", () => {
  it("selects the next sequential album track", () => {
    expect(resolveGaplessNextTrackId(base)).toBe("two");
    expect(readFileSync("apps/web/src/components/CreateAlbumPackagePanel.tsx", "utf8"))
      .toContain("gaplessDefault");
    expect(readFileSync("apps/web/src/components/BatchAlbumBuilderSection.tsx", "utf8"))
      .toContain("batch-album-gapless");
    const engine = readFileSync("apps/web/src/player/useMp5AudioEngine.ts", "utf8");
    expect(engine).toContain("prepareGaplessNext");
    expect(engine).toContain("source.start(scheduledAt)");
  });

  it("does not affect ordinary queues or albums without the preference", () => {
    expect(resolveGaplessNextTrackId({ ...base, enabled: false })).toBeNull();
    expect(resolveGaplessNextTrackId({ ...base, albumTrackIds: ["other", "two"] })).toBeNull();
  });

  it("stays off for shuffle, repeat, stem mixes, and bounded playback ranges", () => {
    expect(resolveGaplessNextTrackId({ ...base, shuffle: true })).toBeNull();
    expect(resolveGaplessNextTrackId({ ...base, repeatMode: "all" })).toBeNull();
    expect(resolveGaplessNextTrackId({ ...base, stemPlayback: true })).toBeNull();
    expect(resolveGaplessNextTrackId({ ...base, hasActiveRange: true })).toBeNull();
  });

  it("schedules the next source at the exact remaining-buffer boundary", () => {
    expect(gaplessScheduleTime(12.5, 3.25, 10)).toBe(19.25);
    expect(gaplessScheduleTime(12.5, 12, 10)).toBe(12.5);
  });
});
