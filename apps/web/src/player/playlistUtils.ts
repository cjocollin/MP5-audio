import {
  decodeExpl,
  decodeMood,
  decodeVibe,
  getMetaValue,
  getLazyIngestThresholdBytes,
  indexMp5FromBlob,
  parseMp5Async,
  type Mp5File,
  type Mp5IndexProgress,
  type Mp5ParseProgress,
} from "@mp5/container";
import type { PlaylistTrack } from "../store/playerStore";
import { USER_ERRORS, formatPlaylistParseError } from "../lib/userFacingErrors";
import {
  resetIngestDiagnostics,
  updateIngestDiagnostics,
} from "../lib/ingest/ingestDiagnostics";
import {
  indexStageDetail,
  mapIndexProgressToIngestStage,
  mapParseProgressToIngestStage,
  parseStageDetail,
} from "../lib/ingest/ingestStages";
import { createRandomId } from "../lib/randomId";

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
  if (!head || head.sampleRate <= 0) return null;
  const samples = Number(head.totalSamples);
  if (!Number.isFinite(samples) || samples <= 0) return null;
  return samples / head.sampleRate;
}

/** Prefer HEAD-derived duration when stored manifest duration is clearly wrong (~half, etc.). */
export function resolvePlaylistTrackDurationSec(track: PlaylistTrack): number | null {
  const parsedDur = trackDurationSec(track.parsed);
  const stored = track.durationSec ?? null;
  if (parsedDur != null && stored != null) {
    const ratio = stored / parsedDur;
    if (ratio >= 0.9 && ratio <= 1.1) return stored;
    return parsedDur;
  }
  return stored ?? parsedDur;
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
  const embedded = track.embeddedAlbum;
  const title =
    getMetaValue(parsed?.meta ?? [], "title") ??
    embedded?.display?.title ??
    track.name.replace(/\.mp5$/i, "");
  const artist =
    getMetaValue(parsed?.meta ?? [], "artist") ?? embedded?.display?.artist ?? "";
  const album =
    getMetaValue(parsed?.meta ?? [], "album") ??
    embedded?.display?.album ??
    embedded?.packageMeta?.albumTitle ??
    "";
  const genre =
    getMetaValue(parsed?.meta ?? [], "genre") ?? embedded?.packageMeta?.genre ?? "";

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
    durationSec: resolvePlaylistTrackDurationSec(track),
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

function sharedMoodVibeTagCount(a: string[], b: string[]): number {
  const setB = new Set(b.map((t) => t.toLowerCase()));
  return a.filter((t) => setB.has(t.toLowerCase())).length;
}

/** Pick the next playlist track sharing at least one mood or vibe tag. */
export function findSimilarTrackIndex(tracks: PlaylistTrack[], currentIndex: number): number | null {
  if (tracks.length < 2 || currentIndex < 0 || currentIndex >= tracks.length) return null;

  const current = trackDisplayInfo(tracks[currentIndex]!);
  if (!current.moodTags.length && !current.vibeTags.length) return null;

  let bestIndex: number | null = null;
  let bestScore = 0;

  for (let i = 0; i < tracks.length; i++) {
    if (i === currentIndex) continue;
    const info = trackDisplayInfo(tracks[i]!);
    const score =
      sharedMoodVibeTagCount(current.moodTags, info.moodTags) +
      sharedMoodVibeTagCount(current.vibeTags, info.vibeTags);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestScore > 0 ? bestIndex : null;
}

export function similarTrackAvailable(tracks: PlaylistTrack[], currentIndex: number): boolean {
  return findSimilarTrackIndex(tracks, currentIndex) != null;
}

export type SkipReason = "not-mp5" | "unreadable";

export interface IngestResult {
  tracks: PlaylistTrack[];
  dropErrors: { name: string; message: string; reason: SkipReason }[];
  addedCount: number;
  skippedCount: number;
  unreadableCount: number;
}

export type IngestProgressCallback = (
  fileName: string,
  progress: Mp5ParseProgress | Mp5IndexProgress,
) => void;

export async function ingestMp5Files(
  files: File[],
  onProgress?: IngestProgressCallback,
): Promise<IngestResult> {
  const tracks: PlaylistTrack[] = [];
  const dropErrors: IngestResult["dropErrors"] = [];
  const lazyThreshold = getLazyIngestThresholdBytes();

  for (const file of files) {
    if (!isMp5FileName(file.name)) {
      dropErrors.push({
        name: file.name,
        message: "Not an .mp5 / .mp5p file — use Converter for source audio.",
        reason: "not-mp5",
      });
      continue;
    }

    try {
      const useLazy = file.size >= lazyThreshold;
      resetIngestDiagnostics();
      updateIngestDiagnostics({
        ingestMode: useLazy ? "lazy-indexed" : "eager",
        fileSizeBytes: file.size,
        integrityStatus: "pending",
      });

      const scanStart = performance.now();
      let parsed: Mp5File;

      if (useLazy) {
        parsed = await indexMp5FromBlob(file, {
          yieldEveryChunks: 2,
          onProgress: (p) => onProgress?.(file.name, p),
        });
        const scanMs = Math.round(performance.now() - scanStart);
        updateIngestDiagnostics({
          chunkCount: parsed.lazy?.chunkIndex.length ?? 0,
          stdfIndexed: parsed.lazy?.stdfFragmentIndex.length ?? 0,
          loadedBinaryMb: (parsed.lazy?.loadedPayloadBytes ?? 0) / (1024 * 1024),
          audiLoaded: parsed.audioFrames.length > 0,
          scanMs,
        });
      } else {
        const buf = await file.arrayBuffer();
        // Always async-parse: sync parseMp5 freezes the tab on multi‑MB files.
        parsed = await parseMp5Async(buf, {
          yieldEveryChunks: 2,
          onProgress: (p) => onProgress?.(file.name, p),
        });
        updateIngestDiagnostics({
          chunkCount: parsed.stdfFragments.length + parsed.audioFrames.length,
          stdfIndexed: parsed.stdfFragments.length,
          loadedBinaryMb: buf.byteLength / (1024 * 1024),
          audiLoaded: parsed.audioFrames.length > 0,
          scanMs: Math.round(performance.now() - scanStart),
        });
        tracks.push({
          id: createRandomId(),
          name: file.name,
          file,
          rawBuffer: buf,
          parsed,
          durationSec: trackDurationSec(parsed) ?? undefined,
          lazyIngest: false,
        });
        continue;
      }

      tracks.push({
        id: createRandomId(),
        name: file.name,
        file,
        parsed,
        durationSec: trackDurationSec(parsed) ?? undefined,
        lazyIngest: true,
      });
    } catch {
      tracks.push({
        id: createRandomId(),
        name: file.name,
        file,
        parseError: USER_ERRORS.invalidMp5,
      });
      dropErrors.push({
        name: file.name,
        message: formatPlaylistParseError(file.name),
        reason: "unreadable",
      });
    }
  }

  const addedCount = tracks.filter((t) => !t.parseError).length;
  const unreadableCount = tracks.filter((t) => t.parseError).length;
  const skippedCount = dropErrors.filter((e) => e.reason === "not-mp5").length;

  return { tracks, dropErrors, addedCount, skippedCount, unreadableCount };
}

export { mapIndexProgressToIngestStage, indexStageDetail, mapParseProgressToIngestStage, parseStageDetail };

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatPlaybackTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  if (sec > 0 && sec < 1) return `${sec.toFixed(2)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
