import type { HighlightMoment, HookPayload, SongSection } from "@mp5/container";

export type PlaybackRangeMode = "loop" | "preview";

export interface ActivePlaybackRange {
  id: string;
  startSec: number;
  endSec?: number;
  mode: PlaybackRangeMode;
  label: string;
}

/** Validate ms range; returns seconds or null if invalid. */
export function rangeFromMs(
  startMs: number,
  endMs?: number,
): { startSec: number; endSec?: number } | null {
  if (!Number.isFinite(startMs) || startMs < 0) return null;
  const startSec = startMs / 1000;
  if (endMs === undefined || endMs === null) {
    return { startSec };
  }
  if (!Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startSec, endSec: endMs / 1000 };
}

export function highlightDurationMs(h: HighlightMoment): number | null {
  if (h.endMs === undefined || h.endMs <= h.startMs) return null;
  return h.endMs - h.startMs;
}

export function formatUseCaseLabel(useCase?: string): string {
  if (!useCase) return "highlight";
  return useCase.replace(/_/g, " ");
}

export function isPreviewUseCase(useCase?: string): boolean {
  return useCase?.toLowerCase() === "preview";
}

/** Play highlight: bounded range stops at end; open range seeks and plays normally. */
export function playHighlightRange(
  h: HighlightMoment,
  index: number,
): { range: ActivePlaybackRange | null; seekOnly: boolean } {
  const range = rangeFromMs(h.startMs, h.endMs);
  if (!range) return { range: null, seekOnly: false };
  if (range.endSec === undefined) {
    return { range: null, seekOnly: true };
  }
  return {
    range: {
      id: `hilt-play-${index}`,
      startSec: range.startSec,
      endSec: range.endSec,
      mode: "preview",
      label: h.label ?? formatUseCaseLabel(h.useCase),
    },
    seekOnly: false,
  };
}

export function previewHighlightRange(
  h: HighlightMoment,
  index: number,
): ActivePlaybackRange | null {
  const range = rangeFromMs(h.startMs, h.endMs);
  if (!range?.endSec) return null;
  return {
    id: `hilt-preview-${index}`,
    startSec: range.startSec,
    endSec: range.endSec,
    mode: "preview",
    label: h.label ?? formatUseCaseLabel(h.useCase),
  };
}

export function loopSectionRange(section: SongSection): ActivePlaybackRange | null {
  const range = rangeFromMs(section.startMs, section.endMs);
  if (!range) return null;
  if (range.endSec === undefined) return null;
  return {
    id: `sect-${section.sectionId}`,
    startSec: range.startSec,
    endSec: range.endSec,
    mode: "loop",
    label: section.title ?? section.label ?? section.type,
  };
}

export function loopHookRange(
  hook: HookPayload | undefined,
  hookSection?: SongSection,
): ActivePlaybackRange | null {
  if (hook) {
    const range = rangeFromMs(hook.startMs, hook.endMs);
    if (!range || range.endSec === undefined) return null;
    return {
      id: "hook",
      startSec: range.startSec,
      endSec: range.endSec,
      mode: "loop",
      label: hook.label ?? "Hook",
    };
  }
  if (hookSection) return loopSectionRange(hookSection);
  return null;
}

const END_EPSILON = 0.05;

/** Returns next seek time if range boundary hit, or null. */
export function applyPlaybackRangeTick(
  currentTimeSec: number,
  active: ActivePlaybackRange | null,
): { action: "none" } | { action: "loop"; seekSec: number } | { action: "stop" } {
  if (!active?.endSec) return { action: "none" };
  if (currentTimeSec < active.endSec - END_EPSILON) return { action: "none" };

  if (active.mode === "preview") {
    return { action: "stop" };
  }
  return { action: "loop", seekSec: active.startSec };
}
