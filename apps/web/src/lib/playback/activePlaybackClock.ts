import type { StemTransportMode } from "../stems/stemMixState";

/** Which engine owns the seek bar / synced UI clock. */
export type ActiveClockMode = StemTransportMode | "preview";

export function clampPlaybackSeconds(timeSec: number, durationSec: number): number {
  const d = Math.max(0, durationSec);
  if (!Number.isFinite(timeSec)) return 0;
  return Math.min(Math.max(0, timeSec), d);
}

/** Maps transport mode to the clock authority (full mix vs stem graph). */
export function clockModeForTransport(
  transportMode: StemTransportMode,
  previewActive: boolean,
): ActiveClockMode {
  if (previewActive) return "preview";
  return transportMode;
}

export interface PlaybackClockDiagnostics {
  activeClockMode: ActiveClockMode;
  rawClockTime: number;
  displayedCurrentTime: number;
  duration: number;
  activeTransportMode: StemTransportMode;
}
