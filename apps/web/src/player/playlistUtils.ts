import {
  decodeExpl,
  decodeMood,
  decodeVibe,
  getMetaValue,
  getLazyIngestThresholdBytes,
  indexMp5FromBlob,
  parseMp5,
  parseMp5Async,
  type Mp5File,
  type Mp5IndexProgress,
  type Mp5ParseProgress,
} from "@mp5/container";
import type { PlaylistTrack } from "../store/playerStore";

/** Yield during eager parse so medium STDF fixtures do not freeze the UI thread. */
const EAGER_PARSE_ASYNC_BYTES = 12 * 1024 * 1024;
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
        message: "Not an .mp5 file — skipped.",
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
        const useAsyncParse = buf.byteLength >= EAGER_PARSE_ASYNC_BYTES;
        parsed = useAsyncParse
          ? await parseMp5Async(buf, {
              yieldEveryChunks: 2,
              onProgress: (p) => onProgress?.(file.name, p),
            })
          : parseMp5(buf);
        updateIngestDiagnostics({
          chunkCount: parsed.stdfFragments.length + parsed.audioFrames.length,
          stdfIndexed: parsed.stdfFragments.length,
          loadedBinaryMb: buf.byteLength / (1024 * 1024),
          audiLoaded: parsed.audioFrames.length > 0,
          scanMs: Math.round(performance.now() - scanStart),
        });
        tracks.push({
          id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
        name: file.name,
        file,
        parsed,
        durationSec: trackDurationSec(parsed) ?? undefined,
        lazyIngest: true,
      });
    } catch {
      tracks.push({
        id: crypto.randomUUID(),
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
