import type { OutputCodec } from "./convertToMp5";

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeFilenamePart(part: string): string {
  return part.replace(INVALID_CHARS, "_").replace(/\s+/g, " ").trim().slice(0, 120);
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
  base = sanitizeFilenamePart(base) || "track";

  const variant =
    codec === "pcm"
      ? " (PCM reference)"
      : codec === "mp5h"
        ? " (MP5-H hybrid)"
        : codec === "mp5c"
          ? " (MP5-C lab)"
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
