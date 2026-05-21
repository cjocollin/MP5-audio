import {
  CodecId,
  decodeExpl,
  decodeFing,
  decodeMood,
  decodeStemManifest,
  decodeVibe,
  fingIdentityKey,
  getMetaValue,
  parseMp5,
  type Mp5File,
} from "@mp5/container";
import {
  codecLabel,
  describeMp5cPlayback,
  describeMp5hPlayback,
} from "../codecDisplay";
import {
  hasContentNotice,
  trackDurationSec,
} from "../../player/playlistUtils";
import type { LibraryMetadataSummary } from "./types";

const MAX_THUMBNAIL_BYTES = 48 * 1024;

export function buildContentGuidanceSummary(parsed?: Mp5File): string {
  if (!parsed) return "";
  const parts: string[] = [];
  try {
    const expl = decodeExpl(parsed.optional.get("EXPL"));
    if (expl?.explicit) parts.push("Explicit");
    if (expl?.strongLanguage) parts.push("Strong language");
    if (expl?.matureThemes) parts.push("Mature themes");
    if (expl?.contentWarnings?.length) parts.push(...expl.contentWarnings.slice(0, 3));
  } catch {
    /* optional */
  }
  if (parsed.optional.has("SAFE")) parts.push("Listener comfort");
  if (parsed.optional.has("SENS")) parts.push("Sensitive themes");
  if (parsed.optional.has("RECV")) parts.push("Recovery / haven");
  return parts.join(" · ");
}

export function buildFormatWarnings(parsed?: Mp5File): string[] {
  if (!parsed?.head) return [];
  const warnings: string[] = [];
  const head = parsed.head;
  const frameData = parsed.audioFrames[0]?.data;

  if (head.codecId === CodecId.MP5C) {
    warnings.push(describeMp5cPlayback(frameData).warning);
  }
  if (head.codecId === CodecId.MP5H) {
    const info = describeMp5hPlayback(parsed, false);
    if (info.warning) warnings.push(info.warning);
  }
  if (head.codecId !== CodecId.MP5L && head.codecId !== CodecId.PCM) {
    warnings.push("Not the default MP5-L v3 listening mode.");
  }
  return warnings;
}

export function extractCoverThumbnail(parsed?: Mp5File): { data: Uint8Array; mime: string } | undefined {
  const cover = parsed?.coverArt;
  if (!cover?.data.length) return undefined;
  if (cover.data.length > MAX_THUMBNAIL_BYTES) return undefined;
  return { data: cover.data, mime: cover.mime || "image/jpeg" };
}

export function buildMetadataSummaryFromParsed(
  filename: string,
  parsed?: Mp5File,
  parseError?: string,
): LibraryMetadataSummary {
  const title =
    getMetaValue(parsed?.meta ?? [], "title") ??
    (filename.replace(/\.mp5$/i, "") || "Untitled");
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
      /* safe */
    }
  }

  const hasGuidance = !!(
    hasContentNotice(parsed) ||
    parsed?.optional.has("SAFE") ||
    parsed?.optional.has("SENS") ||
    parsed?.optional.has("RECV")
  );

  let fingerprintKey: string | undefined;
  let hasFingerprint = false;
  if (parsed) {
    try {
      const fing = decodeFing(parsed.optional.get("FING"));
      fingerprintKey = fingIdentityKey(fing) ?? undefined;
      hasFingerprint = !!fing;
    } catch {
      /* optional */
    }
  }

  return {
    title,
    artist,
    album,
    genre,
    durationSec: trackDurationSec(parsed),
    codecLabel: parsed?.head != null ? codecLabel(parsed.head.codecId) : "—",
    moodTags,
    vibeTags,
    hasContentGuidance: hasGuidance,
    contentGuidanceSummary: buildContentGuidanceSummary(parsed),
    hasCoverArt: !!(parsed?.coverArt?.data.length || parsed?.cover?.length),
    hasLyrics: !!parsed?.optional.has("LYRC"),
    hasStems: !!(parsed && decodeStemManifest(parsed.optional.get("STEM"))?.stems.length),
    stemCount: parsed ? (decodeStemManifest(parsed.optional.get("STEM"))?.stems.length ?? 0) : 0,
    formatWarnings: buildFormatWarnings(parsed),
    parseError,
    fingerprintKey,
    hasFingerprint,
  };
}

export interface ParsedLibraryInput {
  data: ArrayBuffer;
  filename: string;
  parsed?: Mp5File;
  parseError?: string;
  summary: LibraryMetadataSummary;
  coverThumbnail?: Uint8Array;
  coverMime?: string;
}

/** Parse MP5 bytes and build a library-ready record payload. Never throws. */
export function parseForLibrary(data: ArrayBuffer, filename: string): ParsedLibraryInput {
  let parsed: Mp5File | undefined;
  let parseError: string | undefined;
  try {
    parsed = parseMp5(data);
  } catch {
    parseError = "This file could not be read.";
  }
  const summary = buildMetadataSummaryFromParsed(filename, parsed, parseError);
  const thumb = extractCoverThumbnail(parsed);
  return {
    data,
    filename,
    parsed,
    parseError,
    summary,
    coverThumbnail: thumb?.data,
    coverMime: thumb?.mime,
  };
}
