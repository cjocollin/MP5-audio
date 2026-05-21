import { describe, it, expect } from "vitest";
import { parseSectionsText, hookFromSections } from "../apps/web/src/lib/sections/sectionParser";
import { currentSectionIndex, seekTimeSecForSection } from "../apps/web/src/lib/sections/sectionPlayback";

describe("section textarea parser", () => {
  it("parses range, type, and title", () => {
    const { sections, errors } = parseSectionsText(
      "[00:00.00-00:12.00|Intro] Opening\n[00:45.00-01:10.00|Chorus] First chorus",
    );
    expect(errors).toHaveLength(0);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.type).toBe("intro");
    expect(sections[0]?.endMs).toBe(12000);
    expect(sections[1]?.startMs).toBe(45000);
  });

  it("reports invalid lines calmly", () => {
    const { sections, errors } = parseSectionsText("bad line\n[99:99.00|Intro] x");
    expect(errors.length).toBeGreaterThan(0);
    expect(sections.length).toBeLessThan(2);
  });

  it("derives HOOK from hook section", () => {
    const { sections } = parseSectionsText("[00:00.90-00:01.20|Hook] Main hook");
    const hook = hookFromSections(sections);
    expect(hook?.startMs).toBe(900);
    expect(hook?.label).toContain("hook");
  });
});

describe("section playback lookup", () => {
  const sections = [
    { sectionId: "1", type: "intro" as const, startMs: 0, endMs: 300 },
    { sectionId: "2", type: "chorus" as const, startMs: 600, endMs: 900 },
  ];

  it("finds current section from time", () => {
    expect(currentSectionIndex(sections, 0.1)).toBe(0);
    expect(currentSectionIndex(sections, 0.5)).toBe(0);
    expect(currentSectionIndex(sections, 0.7)).toBe(1);
  });

  it("seek time from section", () => {
    expect(seekTimeSecForSection(sections[1]!)).toBe(0.6);
  });
});
