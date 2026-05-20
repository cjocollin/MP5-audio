import type { PlaylistTrack } from "../store/playerStore";

export type RepeatMode = "off" | "all" | "one";

export function isPlayableTrack(track: Pick<PlaylistTrack, "parseError" | "file">): boolean {
  return !track.parseError && !!track.file;
}

export function playableIndices(tracks: PlaylistTrack[]): number[] {
  return tracks.map((t, i) => (isPlayableTrack(t) ? i : -1)).filter((i) => i >= 0);
}

/** Fisher–Yates shuffle (injectable RNG for tests). */
export function shuffleIndices(indices: number[], random: () => number = Math.random): number[] {
  const arr = [...indices];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function buildShuffleOrder(
  tracks: PlaylistTrack[],
  currentIndex: number,
  random: () => number = Math.random,
): number[] {
  const playable = playableIndices(tracks);
  if (playable.length <= 1) return [...playable];
  const others = playable.filter((i) => i !== currentIndex);
  const shuffledOthers = shuffleIndices(others, random);
  if (!playable.includes(currentIndex)) return shuffledOthers;
  return [currentIndex, ...shuffledOthers];
}

export type AdvanceAction =
  | { type: "repeat_one" }
  | { type: "stop" }
  | { type: "goto"; index: number };

export function computeAdvanceAfterEnd(args: {
  tracks: PlaylistTrack[];
  currentIndex: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  shuffleOrder: number[];
}): AdvanceAction {
  const { tracks, currentIndex, repeatMode, shuffle, shuffleOrder } = args;
  const playable = playableIndices(tracks);
  if (!playable.length) return { type: "stop" };

  if (repeatMode === "one" && playable.includes(currentIndex)) {
    return { type: "repeat_one" };
  }

  const nextIndex = computeManualNextIndex({
    tracks,
    currentIndex,
    repeatMode,
    shuffle,
    shuffleOrder,
  });

  if (nextIndex === null) return { type: "stop" };
  return { type: "goto", index: nextIndex };
}

export function computeManualNextIndex(args: {
  tracks: PlaylistTrack[];
  currentIndex: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  shuffleOrder: number[];
}): number | null {
  const { tracks, currentIndex, repeatMode, shuffle, shuffleOrder } = args;
  const playable = playableIndices(tracks);
  if (!playable.length) return null;

  if (shuffle && shuffleOrder.length > 0) {
    const pos = shuffleOrder.indexOf(currentIndex);
    const from = pos >= 0 ? pos : 0;
    for (let step = 1; step <= shuffleOrder.length; step++) {
      const nextPos = from + step;
      if (nextPos < shuffleOrder.length) {
        const idx = shuffleOrder[nextPos]!;
        if (isPlayableTrack(tracks[idx]!)) return idx;
        continue;
      }
      if (repeatMode === "all") {
        const wrapped = shuffleOrder[(nextPos % shuffleOrder.length)]!;
        if (isPlayableTrack(tracks[wrapped]!)) return wrapped;
        break;
      }
      break;
    }
    return null;
  }

  for (const i of playable) {
    if (i > currentIndex) return i;
  }
  if (repeatMode === "all" && playable.length > 0) {
    return playable[0]!;
  }
  return null;
}

export function computeManualPrevIndex(args: {
  tracks: PlaylistTrack[];
  currentIndex: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  shuffleOrder: number[];
}): number | null {
  const { tracks, currentIndex, repeatMode, shuffle, shuffleOrder } = args;
  const playable = playableIndices(tracks);
  if (!playable.length) return null;

  if (shuffle && shuffleOrder.length > 0) {
    const pos = shuffleOrder.indexOf(currentIndex);
    const from = pos >= 0 ? pos : shuffleOrder.length - 1;
    for (let step = 1; step <= shuffleOrder.length; step++) {
      const prevPos = from - step;
      if (prevPos >= 0) {
        const idx = shuffleOrder[prevPos]!;
        if (isPlayableTrack(tracks[idx]!)) return idx;
        continue;
      }
      if (repeatMode === "all") {
        const wrapped = shuffleOrder[shuffleOrder.length + prevPos]!;
        if (isPlayableTrack(tracks[wrapped]!)) return wrapped;
        break;
      }
      break;
    }
    return null;
  }

  for (let p = playable.length - 1; p >= 0; p--) {
    const i = playable[p]!;
    if (i < currentIndex) return i;
  }
  if (repeatMode === "all" && playable.length > 0) {
    return playable[playable.length - 1]!;
  }
  return null;
}

export function cycleRepeatMode(current: RepeatMode): RepeatMode {
  if (current === "off") return "all";
  if (current === "all") return "one";
  return "off";
}

export function repeatModeLabel(mode: RepeatMode): string {
  switch (mode) {
    case "off":
      return "Repeat off";
    case "all":
      return "Repeat all";
    case "one":
      return "Repeat one";
  }
}

export function canNavigateNext(args: {
  tracks: PlaylistTrack[];
  currentIndex: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  shuffleOrder: number[];
}): boolean {
  return computeManualNextIndex(args) !== null;
}

export function canNavigatePrev(args: {
  tracks: PlaylistTrack[];
  currentIndex: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  shuffleOrder: number[];
}): boolean {
  return computeManualPrevIndex(args) !== null;
}

/** Skip unreadable targets when auto-advancing (bounded). */
export function resolveAutoAdvanceIndex(
  tracks: PlaylistTrack[],
  startIndex: number,
  repeatMode: RepeatMode,
  shuffle: boolean,
  shuffleOrder: number[],
): number | null {
  let index = startIndex;
  const seen = new Set<number>();
  for (let n = 0; n < tracks.length + 1; n++) {
    if (seen.has(index)) return null;
    seen.add(index);
    const t = tracks[index];
    if (t && isPlayableTrack(t)) return index;
    const next = computeManualNextIndex({
      tracks,
      currentIndex: index,
      repeatMode,
      shuffle,
      shuffleOrder,
    });
    if (next === null) return null;
    index = next;
  }
  return null;
}
