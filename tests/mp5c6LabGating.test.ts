/**
 * CodecId 6 ("MP5-C v6") converter gating: it is a **beta preview** — visible
 * without the lab / advanced toggle, clearly grouped as not-default — while
 * the older lab codecs (mp5l v3, classic MP5-C, MP5-C2, MP5-H) stay gated.
 *
 * The converter is a React component and the vitest project runs in a `node`
 * environment with no DOM, so the gate is proven structurally: mp5c6 is out of
 * `LAB_ONLY_CODECS`, its `<option>` lives in the beta-preview optgroup outside
 * the `labCodecsOpen` branch, and closing the lab toggle no longer resets it.
 * The rendered behaviour is covered separately by `e2e/batch-converter.spec.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CodecId } from "@mp5/container";

const CONVERTER = readFileSync(
  join(process.cwd(), "apps/web/src/player/ConverterPanel.tsx"),
  "utf8",
);
const BATCH = readFileSync(
  join(process.cwd(), "apps/web/src/components/BatchConverterPanel.tsx"),
  "utf8",
);

function section(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start, `missing marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end, `missing marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("CodecId 6 converter beta-preview gating", () => {
  it("is NOT a lab-only codec anymore", () => {
    const set = section(CONVERTER, "const LAB_ONLY_CODECS", "]);");
    expect(set).not.toContain('"mp5c6"');
    // The rest of the lab tier stays gated.
    for (const lab of ['"mp5l"', '"mp5c"', '"mp5c2"', '"mp5h"']) {
      expect(set).toContain(lab);
    }
  });

  it("offers mp5c6 in a beta-preview group outside the labCodecsOpen branch", () => {
    expect(CONVERTER).toContain('<option value="mp5c6">');
    const betaGroup = section(
      CONVERTER,
      '<optgroup label="Beta preview (not default)">',
      "</optgroup>",
    );
    expect(betaGroup).toContain('<option value="mp5c6">');

    // The lab optgroup no longer carries it.
    const labGroup = section(
      CONVERTER,
      '<optgroup label="Lab / advanced (not default)">',
      "</optgroup>",
    );
    expect(labGroup).not.toContain('<option value="mp5c6">');

    // Exactly one native-select mp5c6 option overall.
    const occurrences = CONVERTER.split('<option value="mp5c6">').length - 1;
    expect(occurrences).toBe(1);
  });

  it("keeps the mp5c6 selection when the lab toggle closes", () => {
    // The reset effect only fires for codecs still in LAB_ONLY_CODECS; with
    // mp5c6 out of that set, closing the toggle must not yank the selection.
    const effect = section(CONVERTER, "if (!labCodecsOpen && LAB_ONLY_CODECS.has(codec))", "}");
    expect(effect).toContain('setCodec("mp5l_v4")');
  });

  it("keeps batch export on MP5-L", () => {
    expect(BATCH).not.toContain("mp5c6");
  });
});

describe("CodecId 6 container registration", () => {
  it("registers CodecId 6 without disturbing the existing ids", () => {
    expect(CodecId.MP5C6).toBe(6);
    expect(CodecId.MP5C).toBe(1);
    expect(CodecId.MP5L).toBe(2);
    expect(CodecId.MP5H).toBe(3);
    expect(CodecId.MP5C2).toBe(5);
    expect(CodecId.PCM).toBe(0);
  });
});
