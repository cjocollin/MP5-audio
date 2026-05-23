/** Canonical playback request resolution (Play, waveform, resume-after-prepare). */

export type PlaybackRequestReason =
  | "play_button"
  | "waveform_seek"
  | "seek_slider"
  | "resume_after_prepare";

export interface PlaybackRequestContext {
  reason: PlaybackRequestReason;
  offsetSec: number;
  autoPlay: boolean;
  karaokeMode: boolean;
  karaokePreparing: boolean;
  karaokeAudioUnavailable: boolean;
  useStemPlayback: boolean;
  hasMainPcm: boolean;
  stemTracksReady: boolean;
  hasActiveStemSources: boolean;
  isPlaying: boolean;
}

export type PlaybackRequestAction =
  | { action: "noop" }
  | { action: "set_playing_preparing_full_mix" }
  | { action: "set_playing_preparing_karaoke" }
  | { action: "start_stem_mix"; offsetSec: number }
  | { action: "seek_stem_mix"; offsetSec: number; start: boolean }
  | { action: "start_full_mix"; offsetSec: number }
  | { action: "seek_full_mix"; offsetSec: number; start: boolean }
  | { action: "karaoke_fallback_full_mix"; offsetSec: number };

export function resolvePlaybackRequest(ctx: PlaybackRequestContext): PlaybackRequestAction {
  const wantPlay = ctx.autoPlay;
  const offset = Math.max(0, ctx.offsetSec);

  if (ctx.karaokePreparing && wantPlay) {
    return { action: "set_playing_preparing_karaoke" };
  }

  if (ctx.useStemPlayback && ctx.stemTracksReady) {
    if (!ctx.hasActiveStemSources && wantPlay) {
      return { action: "start_stem_mix", offsetSec: offset };
    }
    return {
      action: "seek_stem_mix",
      offsetSec: offset,
      start: wantPlay || ctx.isPlaying,
    };
  }

  if (ctx.karaokeMode && wantPlay && !ctx.useStemPlayback) {
    if (ctx.karaokeAudioUnavailable || !ctx.stemTracksReady) {
      if (!ctx.hasMainPcm) {
        return { action: "set_playing_preparing_full_mix" };
      }
      return { action: "karaoke_fallback_full_mix", offsetSec: offset };
    }
    if (ctx.karaokePreparing) {
      return { action: "set_playing_preparing_karaoke" };
    }
  }

  if (!ctx.hasMainPcm && wantPlay) {
    return { action: "set_playing_preparing_full_mix" };
  }

  if (!ctx.hasMainPcm && !wantPlay) {
    return { action: "noop" };
  }

  return {
    action: "seek_full_mix",
    offsetSec: offset,
    start: wantPlay || ctx.isPlaying,
  };
}
