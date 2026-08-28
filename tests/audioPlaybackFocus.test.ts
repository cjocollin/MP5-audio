import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { requestPlaybackAudioFocus } from "../apps/web/src/lib/playback/audioFocus";

describe("playback audio focus", () => {
  it("requests an exclusive playback session when supported", () => {
    const audioSession = { type: "auto" };
    expect(requestPlaybackAudioFocus({ audioSession })).toBe(true);
    expect(audioSession.type).toBe("playback");
  });

  it("falls back safely when Audio Session is unavailable or rejects the request", () => {
    expect(requestPlaybackAudioFocus({})).toBe(false);
    const audioSession = Object.defineProperty({}, "type", {
      set() { throw new Error("unsupported"); },
    }) as { type: string };
    expect(requestPlaybackAudioFocus({ audioSession })).toBe(false);
  });

  it("requests focus from both MP5 audio start paths", () => {
    for (const file of ["useMp5AudioEngine.ts", "useStemMixerEngine.ts"]) {
      const source = readFileSync(`apps/web/src/player/${file}`, "utf8");
      expect(source).toContain("requestPlaybackAudioFocus();");
    }
  });
});
