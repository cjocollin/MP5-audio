import type { LyricSyncedLine, LyrcPayload, SongSection } from "@mp5/container";
import { dedupeLyricLines } from "./lyricSanitize";

export function offsetSongSections(sections: SongSection[], offsetMs: number): SongSection[] {
  if (offsetMs <= 0) return sections;
  return sections.map((s) => ({
    ...s,
    startMs: s.startMs + offsetMs,
    ...(s.endMs != null ? { endMs: s.endMs + offsetMs } : {}),
  }));
}

export function mergeSongSections(chunks: SongSection[][]): SongSection[] {
  const merged = chunks.flat().sort((a, b) => a.startMs - b.startMs);
  const deduped: SongSection[] = [];

  for (const section of merged) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.type === section.type &&
      Math.abs(prev.startMs - section.startMs) < 4000 &&
      (prev.title ?? prev.label) === (section.title ?? section.label)
    ) {
      continue;
    }
    deduped.push(section);
  }

  return deduped.map((s, i) => ({ ...s, sectionId: `sect-${i + 1}` }));
}

export function mergeLyrcPayloads(parts: { offsetMs: number; lyrc: LyrcPayload }[]): LyrcPayload | null {
  if (!parts.length) return null;

  const unsyncedParts: string[] = [];
  const synced: LyricSyncedLine[] = [];

  for (const { offsetMs, lyrc } of parts) {
    if (lyrc.unsynced?.trim()) unsyncedParts.push(lyrc.unsynced.trim());
    for (const line of lyrc.synced ?? []) {
      synced.push({
        ...line,
        timeMs: line.timeMs + offsetMs,
      });
    }
  }

  synced.sort((a, b) => a.timeMs - b.timeMs);

  const unsynced = dedupeLyricLines(unsyncedParts.join("\n").split(/\r?\n/)).join("\n").trim();
  const dedupedSynced: LyricSyncedLine[] = [];
  for (const line of synced) {
    const prev = dedupedSynced[dedupedSynced.length - 1];
    if (
      prev &&
      prev.timeMs === line.timeMs &&
      prev.text.trim().toLowerCase() === line.text.trim().toLowerCase()
    ) {
      continue;
    }
    dedupedSynced.push(line);
  }

  if (!unsynced && !dedupedSynced.length) return null;
  return {
    ...(unsynced ? { unsynced } : {}),
    ...(dedupedSynced.length ? { synced: dedupedSynced } : {}),
    source: parts[parts.length - 1]?.lyrc.source ?? "ai-cloud",
  };
}
