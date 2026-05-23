/** Dev/test guards — seamless UI must not trigger full mix reload paths. */

export type StemReloadForbiddenCaller =
  | "checkbox"
  | "mute"
  | "unmute"
  | "volume"
  | "selection";

let lastPatchPlayhead = 0;

export function recordPatchPlayhead(seconds: number): void {
  lastPatchPlayhead = seconds;
}

export function warnIfFullReloadFromPatch(
  caller: StemReloadForbiddenCaller,
  operation: "loadTracks" | "stopAll" | "disposeAllSources" | "startAllAt",
): void {
  const msg = `[MP5 stem mix] ${caller} must not call ${operation}()`;
  if (import.meta.env?.MODE === "test") {
    throw new Error(msg);
  }
  console.warn(msg);
}

export function warnIfPlayheadResetAfterPatch(
  caller: StemReloadForbiddenCaller,
  beforeSec: number,
  afterSec: number,
  thresholdSec = 2,
): void {
  if (beforeSec < thresholdSec) return;
  if (afterSec > thresholdSec) return;
  const msg = `[MP5 stem mix] ${caller} reset playhead ${beforeSec.toFixed(1)}s → ${afterSec.toFixed(1)}s`;
  if (import.meta.env?.MODE === "test") {
    throw new Error(msg);
  }
  console.warn(msg);
}

export function playheadBeforePatch(): number {
  return lastPatchPlayhead;
}
