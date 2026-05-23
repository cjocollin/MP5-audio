import { describe, expect, it } from "vitest";
import { resolvePlaybackRequest } from "../apps/web/src/lib/playback/requestPlayback";

const base = {
  reason: "play_button" as const,
  offsetSec: 0,
  autoPlay: true,
  karaokeMode: false,
  karaokePreparing: false,
  karaokeAudioUnavailable: false,
  useStemPlayback: false,
  hasMainPcm: true,
  stemTracksReady: false,
  hasActiveStemSources: false,
  isPlaying: false,
};

describe("karaoke requestPlayback", () => {
  it("Play after karaoke stem mix ready starts stem mix, not noop", () => {
    const action = resolvePlaybackRequest({
      ...base,
      karaokeMode: true,
      useStemPlayback: true,
      stemTracksReady: true,
      hasActiveStemSources: false,
    });
    expect(action).toEqual({ action: "start_stem_mix", offsetSec: 0 });
  });

  it("Play while karaoke is preparing defers with preparing state", () => {
    const action = resolvePlaybackRequest({
      ...base,
      karaokeMode: true,
      karaokePreparing: true,
    });
    expect(action).toEqual({ action: "set_playing_preparing_karaoke" });
  });

  it("waveform and play_button use same stem start when mix active but idle", () => {
    const ctx = {
      ...base,
      reason: "waveform_seek" as const,
      karaokeMode: true,
      useStemPlayback: true,
      stemTracksReady: true,
      offsetSec: 12.5,
    };
    const play = resolvePlaybackRequest({ ...ctx, reason: "play_button", offsetSec: 0 });
    const wave = resolvePlaybackRequest(ctx);
    expect(play.action).toBe("start_stem_mix");
    expect(wave.action).toBe("start_stem_mix");
    expect(play).toEqual({ action: "start_stem_mix", offsetSec: 0 });
    expect(wave).toEqual({ action: "start_stem_mix", offsetSec: 12.5 });
  });

  it("karaoke audio unavailable falls back to full mix on Play", () => {
    const action = resolvePlaybackRequest({
      ...base,
      karaokeMode: true,
      karaokeAudioUnavailable: true,
      hasMainPcm: true,
    });
    expect(action).toEqual({ action: "karaoke_fallback_full_mix", offsetSec: 0 });
  });

  it("never no-ops when Play requested with main PCM ready", () => {
    const action = resolvePlaybackRequest({
      ...base,
      hasMainPcm: true,
      autoPlay: true,
    });
    expect(action.action).not.toBe("noop");
  });
});
