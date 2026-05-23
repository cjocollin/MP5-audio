import { describe, expect, it } from "vitest";
import {
  authorityForMode,
  createTransportSnapshot,
} from "../apps/web/src/lib/playback/playbackTransport";

describe("playbackTransport", () => {
  it("maps stem_mix to stem_mix authority", () => {
    expect(authorityForMode("stem_mix")).toBe("stem_mix");
    expect(authorityForMode("full_mix")).toBe("full_mix");
    expect(authorityForMode("karaoke")).toBe("stem_mix");
  });

  it("detects overlap when full mix and stem sources are both active", () => {
    const snap = createTransportSnapshot({
      mode: "stem_mix",
      authority: "stem_mix",
      transportId: 1,
      stemGraphGeneration: 2,
      stemSourceCount: 3,
      activeStemIds: ["a", "b"],
      fullMixSourceActive: true,
      stemMixSourcesActive: true,
    });
    expect(snap.overlapDetected).toBe(true);
  });

  it("does not flag overlap when only stem_mix is active", () => {
    const snap = createTransportSnapshot({
      mode: "stem_mix",
      authority: "stem_mix",
      transportId: 1,
      stemGraphGeneration: 2,
      stemSourceCount: 2,
      activeStemIds: ["drums"],
      fullMixSourceActive: false,
      stemMixSourcesActive: true,
    });
    expect(snap.overlapDetected).toBe(false);
  });

  it("flags overlap when full_mix authority but stem sources still active", () => {
    const snap = createTransportSnapshot({
      mode: "full_mix",
      authority: "full_mix",
      transportId: 1,
      stemGraphGeneration: 0,
      stemSourceCount: 2,
      activeStemIds: ["drums"],
      fullMixSourceActive: true,
      stemMixSourcesActive: true,
    });
    expect(snap.overlapDetected).toBe(true);
  });
});
