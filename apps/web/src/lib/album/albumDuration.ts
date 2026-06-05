import { parseMp5 } from "@mp5/container";
import type { AlbmTrackRef } from "@mp5/container";

const MAX_REASONABLE_TRACK_MS = 24 * 60 * 60 * 1000;

/** Manifest durations above this are treated as invalid (wrong units / corrupt). */
export function isPlausibleTrackDurationMs(ms: number | null | undefined): ms is number {
  return ms != null && Number.isFinite(ms) && ms > 0 && ms <= MAX_REASONABLE_TRACK_MS;
}

export function durationMsFromParsedMp5(bytes: Uint8Array): number | null {
  try {
    const parsed = parseMp5(bytes);
    const head = parsed.head;
    if (!head || head.sampleRate <= 0 || head.channels <= 0) return null;
    const samples = Number(head.totalSamples);
    if (!Number.isFinite(samples) || samples <= 0) return null;
    const sec = samples / head.sampleRate / head.channels;
    if (!Number.isFinite(sec) || sec <= 0) return null;
    return Math.round(sec * 1000);
  } catch {
    return null;
  }
}

/** Prefer manifest ms when plausible; otherwise null for lazy HEAD resolve. */
export function resolveTrackDurationMsFromRef(ref: AlbmTrackRef): number | null {
  if (isPlausibleTrackDurationMs(ref.durationMs)) return ref.durationMs;
  return null;
}

export function durationMsLooksLikeSecondsNotMs(ms: number): boolean {
  return ms > 0 && ms < 7200 && ms > 300 && Number.isInteger(ms);
}
