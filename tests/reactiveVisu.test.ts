import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REACTIVE_VISU_BAR_COUNT,
  buildReactiveBarHeights,
} from "../apps/web/src/player/AudioReactiveVisu";

describe("audio-reactive VISU", () => {
  it("keeps paused bars quiet and independent", () => {
    const heights = buildReactiveBarHeights(new Uint8Array(32).fill(255), {
      active: false,
      reducedMotion: false,
    });
    expect(heights).toHaveLength(REACTIVE_VISU_BAR_COUNT);
    expect(new Set(heights)).toEqual(new Set([0.12]));
  });

  it("maps real analyser energy into bounded bar heights", () => {
    const frame = Uint8Array.from({ length: 32 }, (_, index) => index * 8);
    const heights = buildReactiveBarHeights(frame, {
      active: true,
      reducedMotion: false,
      intensity: "high",
    });
    expect(Math.max(...heights)).toBeLessThanOrEqual(1);
    expect(heights.at(-1)!).toBeGreaterThan(heights[0]!);
  });

  it("uses a stable non-animated profile for reduced motion", () => {
    const quiet = buildReactiveBarHeights(new Uint8Array(32), {
      active: true,
      reducedMotion: true,
    });
    const loud = buildReactiveBarHeights(new Uint8Array(32).fill(255), {
      active: true,
      reducedMotion: true,
    });
    expect(loud).toEqual(quiet);
    expect(new Set(loud).size).toBeGreaterThan(1);
    const component = readFileSync("apps/web/src/player/AudioReactiveVisu.tsx", "utf8");
    expect(component).toContain("prefers-reduced-motion: reduce");
    expect(component).toContain("theme?.primary");
    expect(component).toContain("theme?.secondary");
    expect(component).toContain('role="img"');
  });
});
