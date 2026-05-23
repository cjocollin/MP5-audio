import type { StemTransportMode } from "../stems/stemMixState";

export type PlaybackReadiness =
  | "not_loaded"
  | "indexing"
  | "decoding"
  | "audio_ready"
  | "ready"
  | "error";

export type PlaybackPlayState = "stopped" | "playing" | "paused" | "preparing";

export type ActiveClockSource = "none" | "full_mix" | "stem_mix";

export interface PlaybackStateSnapshot {
  transportMode: StemTransportMode | "idle";
  readiness: PlaybackReadiness;
  playState: PlaybackPlayState;
  activeClockSource: ActiveClockSource;
  activeTrackId: string | null;
  currentTimeSec: number;
  durationSec: number;
  activeSourceCount: number;
  activeStemIds: string[];
  pcmDecoded: boolean;
  isPlaying: boolean;
  karaokeMode: boolean;
  karaokePreparing: boolean;
  karaokeReady: boolean;
  karaokeFallback: boolean;
}

export function derivePlayState(
  isPlaying: boolean,
  readiness: PlaybackReadiness,
  loading: boolean,
): PlaybackPlayState {
  if (loading || readiness === "decoding" || readiness === "indexing") {
    return isPlaying ? "preparing" : "stopped";
  }
  if (readiness === "error") return "stopped";
  if (isPlaying) return "playing";
  return "paused";
}

export function ingestStageToReadiness(
  stage: string,
  pcmDecoded: boolean,
  hasError: boolean,
): PlaybackReadiness {
  if (hasError) return "error";
  if (!pcmDecoded) {
    if (stage === "loading_mp5" || stage === "parsing") return "indexing";
    if (stage === "decoding_audio") return "decoding";
    return "not_loaded";
  }
  if (stage === "ready") return "ready";
  if (pcmDecoded) return "audio_ready";
  return "not_loaded";
}
