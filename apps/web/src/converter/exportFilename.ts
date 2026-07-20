import type { OutputCodec } from "./convertToMp5";

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
/** Windows reserved device names (case-insensitive), with or without extension. */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeFilenamePart(part: string): string {
  return part
    .replace(INVALID_CHARS, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120)
    .trim();
}

/** Sanitize a filename base, guarding reserved device names and empty results. */
export function safeFilenameBase(part: string, fallback = "track"): string {
  let base = sanitizeFilenamePart(part);
  if (!base) base = fallback;
  if (RESERVED_NAMES.test(base)) base = `_${base}`;
  return base;
}

export function buildExportFilename(
  meta: { title?: string; artist?: string },
  codec: OutputCodec,
  sourceFilename?: string,
): string {
  const artist = meta.artist?.trim();
  const title = meta.title?.trim();
  let base: string;
  if (artist && title) {
    base = `${artist} - ${title}`;
  } else if (title) {
    base = title;
  } else if (artist) {
    base = artist;
  } else if (sourceFilename) {
    base = sourceFilename.replace(/\.[^.]+$/i, "");
  } else {
    base = "track";
  }
  base = safeFilenameBase(base);

  const variant =
    codec === "pcm"
      ? " (PCM reference)"
      : codec === "mp5h"
        ? " (MP5-H hybrid)"
        : codec === "mp5c"
          ? " (MP5-C lab)"
          : codec === "mp5c2"
            ? " (MP5-C2)"
            : "";

  return `${base}${variant}.mp5`;
}

/** Suggested duplicate-friendly name when the browser may save a second copy. */
export function suggestDuplicateExportFilename(baseFilename: string, codec: OutputCodec): string {
  if (codec !== "mp5l") return baseFilename;
  const withoutExt = baseFilename.replace(/\.mp5$/i, "");
  if (withoutExt.includes("(MP5-L v3)")) return baseFilename;
  return `${withoutExt} (MP5-L v3).mp5`;
}

/**
 * Ensure every name in a batch is unique by appending " (2)", " (3)" … before
 * the extension. Comparison is case-insensitive so exports stay distinct on
 * case-insensitive filesystems.
 */
export function dedupeExportFilenames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    if (!used.has(name.toLowerCase())) {
      used.add(name.toLowerCase());
      return name;
    }
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let n = 2;
    let candidate = `${stem} (${n})${ext}`;
    while (used.has(candidate.toLowerCase())) {
      n += 1;
      candidate = `${stem} (${n})${ext}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/** Safe `.mp5p` package filename from "artist - title", guarding empties/reserved names. */
export function safePackageFilename(artist: string | undefined, title: string): string {
  const artistPart = safeFilenameBase(artist?.trim() || "", "Album");
  const titlePart = safeFilenameBase(title?.trim() || "", "Album");
  const base = artist?.trim() ? `${artistPart} - ${titlePart}` : titlePart;
  return base.toLowerCase().endsWith(".mp5p") ? base : `${base}.mp5p`;
}
