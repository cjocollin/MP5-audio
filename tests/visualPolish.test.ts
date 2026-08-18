import { describe, it, expect, beforeEach } from "vitest";
import {
  CODEC_MODE_HELP,
  MP5_HONEST_LIMIT,
} from "../apps/web/src/lib/codecModesCopy";
import {
  dismissOnboarding,
  resetOnboardingForTests,
  shouldShowOnboarding,
} from "../apps/web/src/lib/firstRun";
import {
  DEMO_MP5L_FIXTURE_NAME,
  DEMO_MP5L_FIXTURE_URL,
} from "../apps/web/src/lib/demoFixture";

describe("visual polish copy", () => {
  it("documents all codec modes honestly", () => {
    const ids = CODEC_MODE_HELP.map((m) => m.id);
    expect(ids).toEqual(["mp5l", "mp5c2", "mp5c", "mp5h", "pcm"]);
    expect(CODEC_MODE_HELP.find((m) => m.id === "mp5l")?.tagline).toMatch(/recommended/i);
    expect(CODEC_MODE_HELP.find((m) => m.id === "mp5c2")?.tagline).toMatch(/not default|lab|advanced/i);
    expect(CODEC_MODE_HELP.find((m) => m.id === "mp5c")?.tagline).toMatch(/experimental/i);
    expect(CODEC_MODE_HELP.find((m) => m.id === "mp5h")?.tagline).toMatch(/hybrid/i);
    expect(MP5_HONEST_LIMIT).toMatch(/does not claim/i);
  });

  // CodecId 5 restores original PCM sample-for-sample, so "hybrid"/"lossy" copy is false.
  // "hybrid" stays correct for MP5-H only (lossy MP5-C base + lossless CORR).
  it("describes MP5-C2 as bit-exact lossless rather than a lossy hybrid", () => {
    const c2 = CODEC_MODE_HELP.find((m) => m.id === "mp5c2")!;
    expect(c2.tagline).toMatch(/lossless/i);
    expect(c2.detail).toMatch(/bit-exact/i);
    expect(`${c2.tagline} ${c2.detail}`).not.toMatch(/hybrid/i);
    expect(`${c2.tagline} ${c2.detail}`).not.toMatch(/lossy/i);
  });

  // benchmarks/real-music/MP5L_COMPRESSION.md records a PROVISIONAL gate on 19 held-out
  // masters (median 0.997x flac -5), explicitly "not a formal PASS/MISS".
  it("keeps the MP5-L held-out claim provisional and corpus-scoped", () => {
    const l = CODEC_MODE_HELP.find((m) => m.id === "mp5l")!;
    expect(l.detail).toMatch(/provisional/i);
    expect(l.detail).toMatch(/held-out/i);
    expect(l.detail).not.toMatch(/\bPASS\b/);
    expect(l.detail).not.toMatch(/beats?\s+FLAC/i);
  });
});

describe("first-run onboarding", () => {
  beforeEach(() => {
    resetOnboardingForTests();
  });

  it("shows until dismissed", () => {
    expect(shouldShowOnboarding()).toBe(true);
    dismissOnboarding();
    expect(shouldShowOnboarding()).toBe(false);
  });
});

describe("demo fixture", () => {
  it("uses stable fixture path", () => {
    expect(DEMO_MP5L_FIXTURE_URL).toBe("/fixtures/demo_mp5l_v4_tone.mp5");
    expect(DEMO_MP5L_FIXTURE_NAME).toBe("demo_mp5l_v4_tone.mp5");
  });
});
