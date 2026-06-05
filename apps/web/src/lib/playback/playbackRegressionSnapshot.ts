import type { PlaybackStateSnapshot } from "./playbackState";
import { getPlaybackTraceMeta, getPlaybackTraceBuffer } from "./playbackTrace";

/** Exportable playback regression snapshot for manual reports and e2e hooks. */
export interface PlaybackRegressionSnapshot {
  capturedAtMs: number;
  appVersion: string;
  transportMode: string;
  playState: string;
  activeClockSource: string;
  currentTimeSec: number;
  durationSec: number;
  activeSourceCount: number;
  activeStemIds: string[];
  fullMixSourceActive: boolean;
  stemMixSourcesActive: boolean;
  overlapDetected: boolean;
  karaokeMode: boolean;
  karaokePreparing: boolean;
  karaokeReady: boolean;
  karaokeFallback: boolean;
  lastPlaybackRequestReason: string | null;
  lastWaveformSeekReason: string | null;
  lastStemOperation: string | null;
  lastAlbumAction: string | null;
  lastAlbumTrackId: string | null;
  transportDiagnosticsLine?: string;
}

let latestSnapshot: PlaybackRegressionSnapshot | null = null;

export function buildPlaybackRegressionSnapshot(
  state: PlaybackStateSnapshot,
  opts: {
    appVersion: string;
    fullMixSourceActive: boolean;
    stemMixSourcesActive: boolean;
    overlapDetected: boolean;
    transportDiagnosticsLine?: string;
  },
): PlaybackRegressionSnapshot {
  const meta = getPlaybackTraceMeta();
  return {
    capturedAtMs: Date.now(),
    appVersion: opts.appVersion,
    transportMode: state.transportMode,
    playState: state.playState,
    activeClockSource: state.activeClockSource,
    currentTimeSec: state.currentTimeSec,
    durationSec: state.durationSec,
    activeSourceCount: state.activeSourceCount,
    activeStemIds: [...state.activeStemIds],
    fullMixSourceActive: opts.fullMixSourceActive,
    stemMixSourcesActive: opts.stemMixSourcesActive,
    overlapDetected: opts.overlapDetected,
    karaokeMode: state.karaokeMode,
    karaokePreparing: state.karaokePreparing,
    karaokeReady: state.karaokeReady,
    karaokeFallback: state.karaokeFallback,
    lastPlaybackRequestReason: meta.lastPlaybackRequestReason,
    lastWaveformSeekReason: meta.lastWaveformSeekReason,
    lastStemOperation: meta.lastStemOperation,
    lastAlbumAction: meta.lastAlbumAction,
    lastAlbumTrackId: meta.lastAlbumTrackId,
    transportDiagnosticsLine: opts.transportDiagnosticsLine,
  };
}

export function setLatestPlaybackRegressionSnapshot(snap: PlaybackRegressionSnapshot): void {
  latestSnapshot = snap;
}

export function getLatestPlaybackRegressionSnapshot(): PlaybackRegressionSnapshot | null {
  return latestSnapshot;
}

export function exportPlaybackTraceReport(snapshot?: PlaybackRegressionSnapshot | null): string {
  const snap = snapshot ?? latestSnapshot;
  const trace = getPlaybackTraceBuffer().map((e) => ({
    tMs: Math.round(e.t),
    kind: e.kind,
    reason: e.reason,
    detail: e.detail,
  }));
  return JSON.stringify({ snapshot: snap, trace, meta: getPlaybackTraceMeta() }, null, 2);
}
