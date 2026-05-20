import {
  decodeExpl,
  decodeMood,
  decodeVibe,
  getMetaValue,
  parseMp5,
  type Mp5File,
} from "@mp5/container";
import type { PlaylistTrack } from "../store/playerStore";

export interface TrackDisplayInfo {
  title: string;
  artist: string;
  album: string;
  genre: string;
  moodTags: string[];
  vibeTags: string[];
  durationSec: number | null;
  hasContentNotice: boolean;
}

export function isMp5FileName(name: string): boolean {
  return name.toLowerCase().endsWith(".mp5");
}

export function trackDurationSec(parsed?: Mp5File): number | null {
  const head = parsed?.head;
  if (!head || head.sampleRate <= 0 || head.channels <= 0) return null;
  const samples = Number(head.totalSamples);
  if (!Number.isFinite(samples) || samples <= 0) return null;
  return samples / head.sampleRate / head.channels;
}

export function hasContentNotice(parsed?: Mp5File): boolean {
  if (!parsed) return false;
  try {
    const expl = decodeExpl(parsed.optional.get("EXPL"));
    if (!expl) return false;
    return !!(
      expl.explicit ||
      expl.cleanVersionAvailable ||
      expl.strongLanguage ||
      expl.sexualContent ||
      expl.violence ||
      expl.drugReferences ||
      expl.alcoholReferences ||
      expl.selfHarmThemes ||
      expl.traumaThemes ||
      expl.matureThemes ||
      expl.contentWarnings?.length
    );
  } catch {
    return false;
  }
}

export function trackDisplayInfo(track: PlaylistTrack): TrackDisplayInfo {
  const parsed = track.parsed;
  const title = getMetaValue(parsed?.meta ?? [], "title") ?? track.name.replace(/\.mp5$/i, "");
  const artist = getMetaValue(parsed?.meta ?? [], "artist") ?? "";
  const album = getMetaValue(parsed?.meta ?? [], "album") ?? "";
  const genre = getMetaValue(parsed?.meta ?? [], "genre") ?? "";

  let moodTags: string[] = [];
  let vibeTags: string[] = [];
  if (parsed) {
    try {
      moodTags = decodeMood(parsed.optional.get("MOOD"))?.tags ?? [];
      vibeTags = decodeVibe(parsed.optional.get("VIBE"))?.tags ?? [];
    } catch {
      /* optional chunk decode must not break library */
    }
  }

  return {
    title,
    artist,
    album,
    genre,
    moodTags,
    vibeTags,
    durationSec: track.durationSec ?? trackDurationSec(parsed),
    hasContentNotice: hasContentNotice(parsed),
  };
}

export function matchesSearch(track: PlaylistTrack, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const info = trackDisplayInfo(track);
  const haystack = [
    info.title,
    info.artist,
    info.album,
    info.genre,
    track.name,
    ...info.moodTags,
    ...info.vibeTags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export type SkipReason = "not-mp5" | "unreadable";

export interface IngestResult {
  tracks: PlaylistTrack[];
  dropErrors: { name: string; message: string; reason: SkipReason }[];
  addedCount: number;
  skippedCount: number;
  unreadableCount: number;
}

export async function ingestMp5Files(files: File[]): Promise<IngestResult> {
  const tracks: PlaylistTrack[] = [];
  const dropErrors: IngestResult["dropErrors"] = [];

  for (const file of files) {
    if (!isMp5FileName(file.name)) {
      dropErrors.push({
        name: file.name,
        message: "Not an .mp5 file — skipped.",
        reason: "not-mp5",
      });
      continue;
    }

    try {
      const buf = await file.arrayBuffer();
      const parsed = parseMp5(buf);
      tracks.push({
        id: crypto.randomUUID(),
        name: file.name,
        file,
        parsed,
        durationSec: trackDurationSec(parsed) ?? undefined,
      });
    } catch {
      tracks.push({
        id: crypto.randomUUID(),
        name: file.name,
        file,
        parseError: "This file could not be loaded.",
      });
      dropErrors.push({
        name: file.name,
        message: "This file could not be loaded — listed as unreadable.",
        reason: "unreadable",
      });
    }
  }

  const addedCount = tracks.filter((t) => !t.parseError).length;
  const unreadableCount = tracks.filter((t) => t.parseError).length;
  const skippedCount = dropErrors.filter((e) => e.reason === "not-mp5").length;

  return { tracks, dropErrors, addedCount, skippedCount, unreadableCount };
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Clock display for playback position (shows 0:00 at start). */
export function formatPlaybackTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  if (sec > 0 && sec < 1) return `${sec.toFixed(2)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
