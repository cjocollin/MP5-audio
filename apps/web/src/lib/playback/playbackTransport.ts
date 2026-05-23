import type { StemTransportMode } from "../stems/stemMixState";

export type ActivePlaybackAuthority = "full_mix" | "stem_mix";

export interface PlaybackTransportSnapshot {
  mode: StemTransportMode;
  authority: ActivePlaybackAuthority;
  transportId: number;
  stemGraphGeneration: number;
  stemSourceCount: number;
  activeStemIds: string[];
  fullMixSourceActive: boolean;
  stemMixSourcesActive: boolean;
  overlapDetected: boolean;
}

export function authorityForMode(mode: StemTransportMode): ActivePlaybackAuthority {
  return mode === "full_mix" ? "full_mix" : "stem_mix";
}

export function createTransportSnapshot(
  partial: Omit<PlaybackTransportSnapshot, "overlapDetected">,
): PlaybackTransportSnapshot {
  const overlapDetected =
    partial.fullMixSourceActive && partial.stemMixSourcesActive;
  return { ...partial, overlapDetected };
}
