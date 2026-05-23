import { describe, expect, it } from "vitest";
import {
  derivePlayState,
  ingestStageToReadiness,
} from "../apps/web/src/lib/playback/playbackState";

describe("playback state machine", () => {
  it("derivePlayState returns preparing when loading and user requested play", () => {
    expect(derivePlayState(true, "decoding", true)).toBe("preparing");
    expect(derivePlayState(true, "indexing", true)).toBe("preparing");
  });

  it("derivePlayState returns playing only when ready and isPlaying", () => {
    expect(derivePlayState(true, "ready", false)).toBe("playing");
    expect(derivePlayState(false, "ready", false)).toBe("paused");
  });

  it("ingestStageToReadiness maps decode stages before PCM", () => {
    expect(ingestStageToReadiness("decoding_audio", false, false)).toBe("decoding");
    expect(ingestStageToReadiness("loading_mp5", false, false)).toBe("indexing");
    expect(ingestStageToReadiness("ready", true, false)).toBe("ready");
    expect(ingestStageToReadiness("idle", true, false)).toBe("audio_ready");
  });
});
