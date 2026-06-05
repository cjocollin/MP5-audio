/** Dev-only playback trace — enable via localStorage mp5_playback_trace=1 or Settings diagnostics. */

import type { PlaybackRegressionSnapshot } from "./playbackRegressionSnapshot";

export type PlaybackTraceKind =
  | "play_click"
  | "play_state"
  | "audio_context"
  | "main_source"
  | "stem_source"
  | "stem_mix"
  | "stop_all"
  | "load_initial_mix"
  | "insert_stem"
  | "patch_audible"
  | "scroll"
  | "clock"
  | "transport"
  | "karaoke"
  | "request_playback"
  | "waveform_click"
  | "stem_operation";

export interface PlaybackTraceEntry {
  t: number;
  kind: PlaybackTraceKind;
  reason: string;
  detail?: Record<string, unknown>;
}

const MAX_ENTRIES = 200;
const buffer: PlaybackTraceEntry[] = [];
let enabled =
  typeof import.meta !== "undefined" &&
  import.meta.env?.DEV &&
  (typeof localStorage === "undefined" ||
    localStorage.getItem("mp5_playback_trace") === "1");

let lastPlaybackRequestReason: string | null = null;
let lastWaveformSeekReason: string | null = null;
let lastStemOperation: string | null = null;
let lastAlbumAction: string | null = null;
let lastAlbumTrackId: string | null = null;

export function setPlaybackTraceEnabled(on: boolean): void {
  enabled = on;
  if (typeof localStorage !== "undefined") {
    if (on) localStorage.setItem("mp5_playback_trace", "1");
    else localStorage.removeItem("mp5_playback_trace");
  }
}

export function isPlaybackTraceEnabled(): boolean {
  return enabled;
}

export function recordLastPlaybackRequest(reason: string): void {
  lastPlaybackRequestReason = reason;
}

export function recordLastWaveformSeek(reason: string): void {
  lastWaveformSeekReason = reason;
}

export function recordLastStemOperation(op: string, detail?: Record<string, unknown>): void {
  lastStemOperation = op;
  tracePlayback("stem_operation", op, detail);
}

export function recordLastAlbumAction(action: string, trackId?: string | null): void {
  lastAlbumAction = action;
  if (trackId !== undefined) lastAlbumTrackId = trackId;
  tracePlayback("transport", "album_action", { action, trackId: trackId ?? lastAlbumTrackId });
}

export function getPlaybackTraceMeta(): {
  lastPlaybackRequestReason: string | null;
  lastWaveformSeekReason: string | null;
  lastStemOperation: string | null;
  lastAlbumAction: string | null;
  lastAlbumTrackId: string | null;
} {
  return {
    lastPlaybackRequestReason,
    lastWaveformSeekReason,
    lastStemOperation,
    lastAlbumAction,
    lastAlbumTrackId,
  };
}

export function tracePlayback(
  kind: PlaybackTraceKind,
  reason: string,
  detail?: Record<string, unknown>,
): void {
  const entry: PlaybackTraceEntry = {
    t: performance.now(),
    kind,
    reason,
    detail,
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  if (enabled) {
    console.info(`[MP5 playback] ${kind}: ${reason}`, detail ?? "");
  }
}

export function getPlaybackTraceBuffer(): readonly PlaybackTraceEntry[] {
  return buffer;
}

export function clearPlaybackTrace(): void {
  buffer.length = 0;
  lastPlaybackRequestReason = null;
  lastWaveformSeekReason = null;
  lastStemOperation = null;
  lastAlbumAction = null;
  lastAlbumTrackId = null;
}

export function traceScrollIntoView(
  element: Element | null | undefined,
  reason: string,
  inPanel: boolean,
): void {
  tracePlayback("scroll", reason, {
    inPanel,
    tag: element?.tagName,
    testId: element instanceof HTMLElement ? element.dataset.testid : undefined,
  });
  if (!inPanel && element && enabled) {
    console.warn("[MP5 playback] document-level scroll risk:", reason, element);
  }
}

/** Attach latest regression snapshot for export (called from player). */
export function attachSnapshotToTraceExport(
  snapshot: PlaybackRegressionSnapshot | null,
): string {
  const trace = getPlaybackTraceBuffer().map((e) => ({
    tMs: Math.round(e.t),
    kind: e.kind,
    reason: e.reason,
    detail: e.detail,
  }));
  return JSON.stringify(
    { snapshot, trace, meta: getPlaybackTraceMeta() },
    null,
    2,
  );
}
