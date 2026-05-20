import { CodecId } from "@mp5/container";
import type { LibraryCodecFilter, LibrarySearchFilters, LocalLibraryRecord } from "./types";

function codecFilterMatches(record: LocalLibraryRecord, filter: LibraryCodecFilter): boolean {
  if (filter === "all") return true;
  const label = record.summary.codecLabel.toLowerCase();
  switch (filter) {
    case "mp5l":
      return label.includes("mp5-l");
    case "mp5c":
      return label.includes("mp5-c");
    case "mp5h":
      return label.includes("mp5-h");
    case "pcm":
      return label.includes("pcm");
    case "other":
      return (
        !label.includes("mp5-l") &&
        !label.includes("mp5-c") &&
        !label.includes("mp5-h") &&
        !label.includes("pcm")
      );
    default:
      return true;
  }
}

/** Map codec filter to CodecId for tests that use numeric ids in summaries. */
export function codecFilterFromLabel(codecLabel: string): LibraryCodecFilter {
  const l = codecLabel.toLowerCase();
  if (l.includes("mp5-l")) return "mp5l";
  if (l.includes("mp5-c")) return "mp5c";
  if (l.includes("mp5-h")) return "mp5h";
  if (l.includes("pcm")) return "pcm";
  return "other";
}

export function matchesLibrarySearch(record: LocalLibraryRecord, filters: LibrarySearchFilters): boolean {
  if (!codecFilterMatches(record, filters.codec)) return false;
  if (filters.contentGuidanceOnly && !record.summary.hasContentGuidance) return false;
  if (filters.hasCoverOnly && !record.summary.hasCoverArt) return false;
  if (filters.hasLyricsOnly && !record.summary.hasLyrics) return false;

  const q = filters.query.trim().toLowerCase();
  if (!q) return true;

  const s = record.summary;
  const haystack = [
    s.title,
    s.artist,
    s.album,
    s.genre,
    record.filename,
    ...s.moodTags,
    ...s.vibeTags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function filterLibraryRecords(
  records: LocalLibraryRecord[],
  filters: LibrarySearchFilters,
): LocalLibraryRecord[] {
  return records.filter((r) => matchesLibrarySearch(r, filters));
}

/** Infer codec id from stored label for display filters (optional). */
export function inferCodecIdFromLabel(label: string): number | null {
  const l = label.toLowerCase();
  if (l.includes("mp5-l")) return CodecId.MP5L;
  if (l.includes("mp5-c")) return CodecId.MP5C;
  if (l.includes("mp5-h")) return CodecId.MP5H;
  if (l.includes("pcm")) return CodecId.PCM;
  return null;
}
