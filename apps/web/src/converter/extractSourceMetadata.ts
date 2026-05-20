import { fetchFile } from "@ffmpeg/util";
import type { CoverArt, LyrcPayload } from "@mp5/container";
import { getFfmpeg } from "./ffmpegLoader";
import type { DecodeProgress } from "./decodeSourceToPcm";

export interface SourceMetadata {
  meta: Record<string, string>;
  cover?: CoverArt;
  lyrics?: LyrcPayload;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : ".bin";
}

function parseFfmetadata(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed.slice(eq + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

function mapFfToStandard(raw: Record<string, string>): Record<string, string> {
  const meta: Record<string, string> = {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (raw[k]) return raw[k];
    }
    return undefined;
  };

  const title = pick("title", "track");
  const artist = pick("artist", "album_artist");
  const album = pick("album");
  const albumartist = pick("album_artist", "albumartist");
  const genre = pick("genre");
  const date = pick("date", "year");
  const year = pick("year") ?? (date?.slice(0, 4) ?? "");
  const tracknumber = pick("track", "tracknumber");
  const discnumber = pick("disc", "discnumber");
  const composer = pick("composer");
  const comment = pick("comment", "description");

  if (title) meta.title = title;
  if (artist) meta.artist = artist;
  if (album) meta.album = album;
  if (albumartist) meta.albumartist = albumartist;
  if (genre) meta.genre = genre;
  if (date) meta.date = date;
  if (year) meta.year = year;
  if (tracknumber) meta.tracknumber = tracknumber;
  if (discnumber) meta.discnumber = discnumber;
  if (composer) meta.composer = composer;
  if (comment) meta.comment = comment;

  const lyrics = pick("lyrics", "lyric", "unsyncedlyrics");
  if (lyrics) {
    meta._lyrics_unsynced = lyrics;
  }

  return meta;
}

function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  return "image/jpeg";
}

/**
 * Extract tags and optional cover from source via FFmpeg (no audio decode).
 * Does not invent content warnings or AI mood tags.
 */
export async function extractSourceMetadata(
  file: File,
  onProgress?: DecodeProgress,
): Promise<SourceMetadata> {
  const fallbackTitle = file.name.replace(/\.[^.]+$/, "");
  const base: SourceMetadata = { meta: { title: fallbackTitle } };

  try {
    const ffmpeg = await getFfmpeg(onProgress);
    const input = `meta_in${extOf(file.name)}`;
    const metaOut = "meta.ffmeta";
    const coverOut = "meta_cover.jpg";

    onProgress?.("Reading metadata…");
    await ffmpeg.writeFile(input, await fetchFile(file));

    try {
      const exit = await ffmpeg.exec(["-i", input, "-f", "ffmetadata", "-y", metaOut], 60_000);
      if (exit === 0) {
        const raw = await ffmpeg.readFile(metaOut);
        const text =
          raw instanceof Uint8Array
            ? new TextDecoder().decode(raw)
            : String(raw);
        const mapped = mapFfToStandard(parseFfmetadata(text));
        if (mapped.title) base.meta = { ...base.meta, ...mapped };
        else base.meta = { ...mapped, title: base.meta.title ?? fallbackTitle };
        if (mapped._lyrics_unsynced) {
          base.lyrics = {
            unsynced: mapped._lyrics_unsynced,
            source: "embedded",
          };
          delete base.meta._lyrics_unsynced;
        }
      }
    } catch {
      /* metadata file optional */
    }

    try {
      onProgress?.("Extracting cover art…");
      const coverExit = await ffmpeg.exec(
        ["-i", input, "-an", "-map", "0:v:0", "-c:v", "copy", "-frames:v", "1", coverOut],
        60_000,
      );
      if (coverExit === 0) {
        const img = await ffmpeg.readFile(coverOut);
        const bytes = img instanceof Uint8Array ? img : new TextEncoder().encode(String(img));
        if (bytes.length > 0 && bytes.length <= 2 * 1024 * 1024) {
          base.cover = { mime: sniffImageMime(bytes), data: bytes };
        }
      }
    } catch {
      /* no embedded cover */
    }

    try {
      await ffmpeg.deleteFile(input);
      await ffmpeg.deleteFile(metaOut);
      await ffmpeg.deleteFile(coverOut);
    } catch {
      /* cleanup */
    }
  } catch {
    /* FFmpeg metadata path failed — keep filename title only */
  }

  if (!base.meta.title) base.meta.title = fallbackTitle;
  return base;
}
