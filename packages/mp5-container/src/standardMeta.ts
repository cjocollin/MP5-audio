import { sanitizeMetadata } from "./metadata.js";
import type { MetaField } from "./types.js";

/** Standard META keys for MP5 Metadata MVP */
export const META_KEYS = [
  "title",
  "artist",
  "album",
  "albumartist",
  "genre",
  "date",
  "year",
  "tracknumber",
  "discnumber",
  "composer",
  "comment",
  "cover_mime",
  "cover_size",
  "waveform_peak",
  "waveform_rms",
] as const;

export type StandardMetaKey = (typeof META_KEYS)[number];

const FF_MAP: Record<string, StandardMetaKey> = {
  title: "title",
  artist: "artist",
  album: "album",
  album_artist: "albumartist",
  albumartist: "albumartist",
  genre: "genre",
  date: "date",
  year: "year",
  track: "tracknumber",
  tracknumber: "tracknumber",
  disc: "discnumber",
  discnumber: "discnumber",
  composer: "composer",
  comment: "comment",
  description: "comment",
  lyrics: "comment",
};

export function normalizeMetaKey(key: string): string {
  const k = key.trim().toLowerCase().replace(/\s+/g, "");
  return FF_MAP[k] ?? sanitizeMetadata(key).toLowerCase();
}

export function metaFieldsFromRecord(record: Record<string, string>): MetaField[] {
  const out: MetaField[] = [];
  for (const [key, value] of Object.entries(record)) {
    const v = sanitizeMetadata(value);
    if (!v) continue;
    out.push({ key: normalizeMetaKey(key), value: v });
  }
  return out;
}

export function recordFromMetaFields(fields: MetaField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of fields) {
    if (value) out[key] = value;
  }
  return out;
}

export function getMetaValue(fields: MetaField[], key: string): string | undefined {
  const k = key.toLowerCase();
  return fields.find((f) => f.key.toLowerCase() === k)?.value;
}
