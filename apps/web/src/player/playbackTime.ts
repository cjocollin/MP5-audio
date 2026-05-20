/** Elapsed playback position from Web Audio clock. */
export function computePlaybackTime(
  offsetSeconds: number,
  contextCurrentTime: number,
  startedAtContextTime: number,
  durationSeconds: number,
): number {
  const elapsed = contextCurrentTime - startedAtContextTime;
  return Math.min(Math.max(0, offsetSeconds + elapsed), Math.max(0, durationSeconds));
}
