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
    expect(ids).toEqual(["mp5l", "mp5c", "mp5h", "pcm"]);
    expect(CODEC_MODE_HELP.find((m) => m.id === "mp5l")?.tagline).toMatch(/recommended/i);
    expect(CODEC_MODE_HELP.find((m) => m.id === "mp5c")?.tagline).toMatch(/experimental/i);
    expect(CODEC_MODE_HELP.find((m) => m.id === "mp5h")?.tagline).toMatch(/hybrid/i);
    expect(MP5_HONEST_LIMIT).toMatch(/does not claim/i);
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
    expect(DEMO_MP5L_FIXTURE_URL).toBe("/fixtures/demo_mp5l_v3_tone.mp5");
    expect(DEMO_MP5L_FIXTURE_NAME).toBe("demo_mp5l_v3_tone.mp5");
  });
});
