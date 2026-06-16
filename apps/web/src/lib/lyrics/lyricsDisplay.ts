import type { LyricSyncedLine } from "@mp5/container";

export type LyricLineTone = "previous" | "current" | "upcoming";

export interface LyricLineDisplay {
  tone: LyricLineTone;
  isCurrent: boolean;
  sectionLabel?: string;
}

export function lyricLineDisplay(
  lines: LyricSyncedLine[],
  index: number,
  activeIndex: number,
): LyricLineDisplay {
  const line = lines[index];
  const prev = index > 0 ? lines[index - 1] : undefined;
  return {
    tone: index === activeIndex ? "current" : index < activeIndex ? "previous" : "upcoming",
    isCurrent: index === activeIndex,
    sectionLabel: line?.section && line.section !== prev?.section ? line.section : undefined,
  };
}

export function lyricsModeLabel(hasSynced: boolean, karaokeMode: boolean): string {
  if (karaokeMode && hasSynced) return "Karaoke synced";
  return hasSynced ? "Synced lyrics" : "Plain lyrics";
}

export function lyricsEmptyMessage(hasParsedTrack: boolean): string {
  return hasParsedTrack
    ? "No lyrics embedded in this track."
    : "Load a track to view lyrics.";
}
