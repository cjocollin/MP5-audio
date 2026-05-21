import type { LyricSyncedLine } from "@mp5/container";

/** Active synced line index for `currentTimeSec` (seconds). */
export function currentSyncedLineIndex(
  lines: LyricSyncedLine[],
  currentTimeSec: number,
): number {
  if (!lines.length) return -1;
  const tMs = Math.max(0, currentTimeSec * 1000);
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.timeMs <= tMs) idx = i;
    else break;
  }
  return idx;
}

/** Safe seek target in seconds for “jump to line”. */
export function seekTimeSecForLine(line: LyricSyncedLine): number {
  return Math.max(0, line.timeMs / 1000);
}

export function hasSyncedLyrics(lines?: LyricSyncedLine[]): boolean {
  return (lines?.length ?? 0) > 0;
}
