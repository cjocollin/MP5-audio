import { describe, it, expect } from "vitest";
import {
  CHUNK_DISPLAY_NAME,
  CONTENT_GUIDANCE_HELP,
  formatWarningSourceLabel,
  SECTION,
  SPECIALIZED_APP_HELP,
  SPECIALIZED_PROFILE_OPTIONS,
  specializedProfileLabel,
} from "../apps/web/src/lib/metadataLabels";

describe("metadataLabels", () => {
  it("maps internal chunks to general-audience display names", () => {
    expect(CHUNK_DISPLAY_NAME.EXPL).toBe("Content notices");
    expect(CHUNK_DISPLAY_NAME.SAFE).toBe("Sensitive themes");
    expect(CHUNK_DISPLAY_NAME.SENS).toBe("Listener comfort");
    expect(CHUNK_DISPLAY_NAME.RECV).toBe("Haven / Recovery profile");
  });

  it("uses music-first section titles", () => {
    expect(SECTION.trackInfo).toBe("Track info");
    expect(SECTION.moodVibe).toBe("Mood & vibe");
    expect(SECTION.contentGuidance).toBe("Content guidance");
    expect(SECTION.specializedAppMetadata).toBe("Specialized app metadata");
    expect(SECTION.havenRecoveryProfile).toBe("Haven / Recovery profile");
  });

  it("describes specialized metadata as optional for most players", () => {
    expect(SPECIALIZED_APP_HELP).toContain("Most music files and players do not need");
  });

  it("describes content guidance without implying playback impact", () => {
    expect(CONTENT_GUIDANCE_HELP).toContain("do not affect playback");
  });

  it("labels specialized profiles with Haven / Recovery last", () => {
    expect(SPECIALIZED_PROFILE_OPTIONS[0]?.id).toBe("none");
    expect(SPECIALIZED_PROFILE_OPTIONS.at(-1)?.id).toBe("haven");
    expect(specializedProfileLabel("haven")).toBe("Haven / Recovery");
    expect(specializedProfileLabel("custom")).toBe("Custom app tags");
  });

  it("formats warning sources for display", () => {
    expect(formatWarningSourceLabel("user")).toBe("user-provided");
    expect(formatWarningSourceLabel("artist")).toBe("artist-provided");
  });
});
