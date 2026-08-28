export interface GaplessTrackRef {
  id: string;
}

export function resolveGaplessNextTrackId(args: {
  enabled: boolean;
  playing: boolean;
  shuffle: boolean;
  repeatMode: string;
  stemPlayback: boolean;
  hasActiveRange: boolean;
  currentIndex: number;
  queue: readonly GaplessTrackRef[];
  albumTrackIds: readonly string[];
}): string | null {
  if (
    !args.enabled ||
    !args.playing ||
    args.shuffle ||
    args.repeatMode !== "off" ||
    args.stemPlayback ||
    args.hasActiveRange
  ) {
    return null;
  }
  const current = args.queue[args.currentIndex];
  const next = args.queue[args.currentIndex + 1];
  if (!current || !next) return null;
  const albumIndex = args.albumTrackIds.indexOf(current.id);
  if (albumIndex < 0 || args.albumTrackIds[albumIndex + 1] !== next.id) return null;
  return next.id;
}

export function gaplessScheduleTime(
  contextTime: number,
  currentOffset: number,
  currentBufferDuration: number,
): number {
  return contextTime + Math.max(0, currentBufferDuration - currentOffset);
}
