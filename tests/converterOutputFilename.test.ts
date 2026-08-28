import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildExportFilename,
  normalizeExportFilename,
} from "../apps/web/src/converter/exportFilename";

describe("converter output filenames", () => {
  it.each([
    [0, "Low"],
    [1, "Standard"],
    [2, "High"],
    [3, "Extreme"],
  ])("adds preset %i as %s", (preset, level) => {
    expect(buildExportFilename({ title: "Song" }, "mp5c6", undefined, preset))
      .toBe(`Song (MP5-C v6 lossy beta) (${level}).mp5`);
  });

  it("does not label lossless or PCM exports with an irrelevant preset", () => {
    expect(buildExportFilename({ title: "Song" }, "mp5l_v4", undefined, 3)).toBe("Song.mp5");
    expect(buildExportFilename({ title: "Song" }, "pcm", undefined, 3)).toBe("Song (PCM reference).mp5");
  });

  it("keeps exactly one MP5 extension on an edited filename", () => {
    expect(normalizeExportFilename("My Mix.MP5")).toBe("My Mix.mp5");
    expect(normalizeExportFilename("My Mix")).toBe("My Mix.mp5");
  });

  it("sanitizes edited filenames and restores the suggestion when left empty", () => {
    expect(normalizeExportFilename("my/bad*mix.mp5")).toBe("my_bad_mix.mp5");
    expect(normalizeExportFilename("", "Artist - Song (High).mp5"))
      .toBe("Artist - Song (High).mp5");
  });

  it("exposes an editable, labelled output filename field used during export", () => {
    const source = readFileSync("apps/web/src/player/ConverterPanel.tsx", "utf8");
    const field = source.slice(source.indexOf("<span>Output filename</span>"), source.indexOf("</label>", source.indexOf("<span>Output filename</span>")));
    expect(field).toContain("onChange=");
    expect(field).not.toContain("readOnly");
    expect(source).toContain("customOutputFilename ?? suggestedFilename");
    expect(source).toContain("customOutputFilename?.trim() ? filename : null");
    expect(source).toContain("setExportSummary((summary) => summary ? { ...summary, filename } : summary)");
  });
});
