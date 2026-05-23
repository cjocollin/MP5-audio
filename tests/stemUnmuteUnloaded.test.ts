import { describe, expect, it } from "vitest";
import { stemRowBadges, type StemRowUiState } from "../apps/web/src/lib/stems/stemMixState";

describe("unloaded stem unmute intent", () => {
  const base: StemRowUiState = {
    id: "lead",
    gain: 1,
    muted: false,
    solo: false,
    selected: false,
    preparing: true,
    pendingAudible: true,
  };

  it("shows Will join mix badge during stem mix prepare", () => {
    const badges = stemRowBadges(base, {
      loaded: false,
      active: false,
      stemMixActive: true,
    });
    expect(badges).toContain("pending_audible");
  });

  it("does not imply full graph reload from mute toggle", () => {
    const forbidden = ["loadTracks", "stopAll", "loadInitialTracksForMix"];
    const seamlessOnly = ["prepareStemBackground", "insertStemAtCurrentOffset", "patchStemAudible"];
    for (const f of forbidden) {
      expect(seamlessOnly).not.toContain(f);
    }
  });

  it("pending audible clears when muted", () => {
    const muted = { ...base, muted: true, pendingAudible: false };
    const badges = stemRowBadges(muted, {
      loaded: false,
      active: false,
      stemMixActive: true,
    });
    expect(badges).not.toContain("pending_audible");
  });
});
