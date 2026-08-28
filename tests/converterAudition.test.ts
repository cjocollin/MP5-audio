import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  auditionDuration,
  auditionGains,
  auditionTimeline,
  clampAuditionTime,
} from "../apps/web/src/components/ConverterAuditionPanel";

describe("converter audition", () => {
  it("clamps seeks to the shared timeline", () => {
    expect(clampAuditionTime(-2, 10)).toBe(0);
    expect(clampAuditionTime(14, 10)).toBe(10);
  });

  it("mutes exactly one side", () => {
    expect(auditionGains("source")).toEqual([1, 0]);
    expect(auditionGains("export")).toEqual([0, 1]);
    const component = readFileSync("apps/web/src/components/ConverterAuditionPanel.tsx", "utf8");
    expect(component).toContain("aria-pressed");
    expect(component).toContain('aria-label="Audition position"');
    const converter = readFileSync("apps/web/src/player/ConverterPanel.tsx", "utf8");
    expect(converter).toContain("source={pending.pcm}");
    expect(converter).toContain("exportFile={lastExportFile}");
  });

  it("uses the shorter file as the comparison duration", () => {
    expect(auditionDuration(30, 29.9)).toBe(29.9);
  });

  it("advances from the current offset without crossing the end", () => {
    expect(auditionTimeline(4, 1.5, 10)).toBe(5.5);
    expect(auditionTimeline(9, 2, 10)).toBe(10);
  });
});
