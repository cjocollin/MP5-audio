import type { HeadPayload } from "@mp5/container";
import type { AlbmTrackRef } from "@mp5/container";
import { parseMp5MetadataPrefix } from "./parseMp5MetadataPrefix";

const MAX_REASONABLE_TRACK_MS = 24 * 60 * 60 * 1000;

/** HEAD.totalSamples is per-channel frame count — duration is samples / sampleRate (not / channels). */
export function headDurationMs(head: HeadPayload): number | null {
  if (!head || head.sampleRate <= 0) return null;
  const samples = Number(head.totalSamples);
  if (!Number.isFinite(samples) || samples <= 0) return null;
  const sec = samples / head.sampleRate;
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.round(sec * 1000);
}

export function isPlausibleTrackDurationMs(ms: number | null | undefined): ms is number {
  return ms != null && Number.isFinite(ms) && ms > 0 && ms <= MAX_REASONABLE_TRACK_MS;
}

export function durationMsFromParsedMp5(bytes: Uint8Array): number | null {
  try {
    const parsed = parseMp5MetadataPrefix(bytes);
    return parsed.head ? headDurationMs(parsed.head) : null;
  } catch {
    return null;
  }
}

export function resolveTrackDurationMsFromRef(
  ref: AlbmTrackRef,
  headMs?: number | null,
): number | null {
  const manifestMs = isPlausibleTrackDurationMs(ref.durationMs) ? ref.durationMs : null;
  const trustedHead = headMs != null && isPlausibleTrackDurationMs(headMs) ? headMs : null;
  if (trustedHead != null) {
    if (manifestMs == null) return trustedHead;
    const ratio = manifestMs / trustedHead;
    if (ratio < 0.9 || ratio > 1.1) return trustedHead;
    return manifestMs;
  }
  return manifestMs;
}
