import { describe, expect, it } from "vitest";
import {
  badgeLabel,
  stemRowBadges,
  stemsForActiveMix,
  type StemRowUiState,
} from "../apps/web/src/lib/stems/stemMixState";

describe("stemMixState", () => {
  const ui: StemRowUiState[] = [
    { id: "a", gain: 1, muted: false, solo: false, selected: true, preparing: false },
    { id: "b", gain: 1, muted: true, solo: false, selected: true, preparing: false },
    { id: "c", gain: 1, muted: false, solo: true, selected: false, preparing: false },
  ];
  const cache = { has: (id: string) => id === "a" || id === "c" };
  const stems = [{ stemId: "a" }, { stemId: "b" }, { stemId: "c" }];

  it("stem_mix includes only selected loaded stems", () => {
    expect(stemsForActiveMix(stems, ui, cache, "stem_mix")).toEqual(["a"]);
  });

  it("solo_stem includes solo loaded stems", () => {
    expect(stemsForActiveMix(stems, ui, cache, "solo_stem")).toEqual(["c"]);
  });

  it("badges reflect selected, loaded, active, muted", () => {
    const badges = stemRowBadges(ui[1]!, { loaded: false, active: false });
    expect(badges).toContain("selected");
    expect(badges).toContain("muted");
    expect(badgeLabel("preparing")).toBe("Preparing");
  });
});
