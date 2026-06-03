import type { CoverArt } from "@mp5/container";
import type { BatchQueueItem } from "../../converter/batchTypes";
import type { ManualMetadataEdits } from "../../converter/manualMetadata";
import { manualEditsFromSource } from "../../converter/manualMetadata";
import type { SourceMetadata } from "../../converter/extractSourceMetadata";
import { buildExportFilename } from "../../converter/exportFilename";
import { BATCH_CODEC } from "../../converter/batchTypes";
import type { AlbumPackageExportMode } from "./createAlbumPackage";

export type BatchAlbumExportTarget = "individual" | "manifest" | "embedded";

export interface BatchAlbumLevelMeta {
  title: string;
  artist: string;
  albumArtist: string;
  year: string;
  genre: string;
  credits: string;
  exportTarget: BatchAlbumExportTarget;
  /** When set and useAlbumCoverForAll, applied to tracks that inherit cover. */
  cover?: CoverArt;
  useAlbumCoverForAll: boolean;
}

export interface BatchTrackAlbumMeta {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNumber: string;
  discNumber: string;
  genre: string;
  year: string;
  date: string;
  useAlbumCover: boolean;
}

export const BATCH_ALBUM_LIMITATIONS = [
  "Batch album export uses MP5-L v3 only (same as batch convert).",
  "No per-file stem editing in batch — use Single file mode for stems.",
  "No AI metadata generation — values come from source tags or your edits only.",
  "Manifest .mp5p references sidecar .mp5 files — keep them together when sharing.",
  "Embedded .mp5p can be very large if tracks include stems or long audio.",
  "Browsers may block many simultaneous downloads — manifest export staggers files.",
] as const;

const TRACK_PREFIX =
  /^(?:track\s*)?(\d{1,2})(?:\s*[-._]\s*|\s+)(.+)$/i;
const LEADING_NUMBER = /^(\d{1,2})[\s._-]+(.+)$/;

export function inferTrackNumberFromFilename(filename: string): number | undefined {
  const base = filename.replace(/\.[^.]+$/i, "").trim();
  const m = base.match(TRACK_PREFIX) ?? base.match(LEADING_NUMBER);
  if (!m) return undefined;
  const n = parseInt(m[1]!, 10);
  return n >= 1 && n <= 99 ? n : undefined;
}

export function inferTitleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/i, "").trim();
  const m = base.match(TRACK_PREFIX) ?? base.match(LEADING_NUMBER);
  if (m?.[2]) return m[2].trim();
  return base || "Untitled";
}

/** First path segment when dropping a folder (webkitRelativePath). */
export function inferAlbumNameFromFiles(files: File[]): string | undefined {
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (!rel) continue;
    const parts = rel.split(/[/\\]/).filter(Boolean);
    if (parts.length >= 2) {
      const folder = parts[0]!.trim();
      if (folder && !folder.startsWith(".")) return folder;
    }
  }
  return undefined;
}

export function emptyAlbumMeta(exportTarget: BatchAlbumExportTarget = "manifest"): BatchAlbumLevelMeta {
  return {
    title: "",
    artist: "",
    albumArtist: "",
    year: "",
    genre: "",
    credits: "",
    exportTarget,
    useAlbumCoverForAll: true,
  };
}

export function initTrackMetaFromSource(
  item: BatchQueueItem,
  extracted: SourceMetadata | undefined,
  album: BatchAlbumLevelMeta,
): BatchTrackAlbumMeta {
  const m = extracted?.meta ?? {};
  const fromFile = inferTrackNumberFromFilename(item.sourceName);
  const trackNum =
    m.tracknumber?.replace(/\/.*/, "").trim() ||
    (fromFile != null ? String(fromFile) : "");
  return {
    id: item.id,
    title: m.title?.trim() || inferTitleFromFilename(item.sourceName),
    artist: m.artist?.trim() || "",
    album: m.album?.trim() || album.title || "",
    albumArtist: m.albumartist?.trim() || album.albumArtist || album.artist || "",
    trackNumber: trackNum,
    discNumber: m.discnumber?.trim() || "1",
    genre: m.genre?.trim() || album.genre || "",
    year: m.year?.trim() || album.year || "",
    date: m.date?.trim() || "",
    useAlbumCover: album.useAlbumCoverForAll,
  };
}

export function suggestAlbumMetaFromBatch(
  trackMetas: BatchTrackAlbumMeta[],
  files: File[],
): BatchAlbumLevelMeta {
  const folder = inferAlbumNameFromFiles(files);
  const first = trackMetas[0];
  return {
    title: folder || first?.album?.trim() || first?.title?.trim() || "My album",
    artist: first?.artist?.trim() || "",
    albumArtist: first?.albumArtist?.trim() || first?.artist?.trim() || "",
    year: first?.year?.trim() || "",
    genre: first?.genre?.trim() || "",
    credits: "",
    exportTarget: "manifest",
    useAlbumCoverForAll: true,
  };
}

export function applyAlbumMetaToTracks(
  trackMetas: Record<string, BatchTrackAlbumMeta>,
  album: BatchAlbumLevelMeta,
): Record<string, BatchTrackAlbumMeta> {
  const next: Record<string, BatchTrackAlbumMeta> = {};
  for (const [id, t] of Object.entries(trackMetas)) {
    next[id] = {
      ...t,
      album: album.title || t.album,
      albumArtist: album.albumArtist || album.artist || t.albumArtist,
      genre: album.genre || t.genre,
      year: album.year || t.year,
    };
  }
  return next;
}

export function trackMetaToManualEdits(
  track: BatchTrackAlbumMeta,
  album: BatchAlbumLevelMeta,
  sourceCover?: CoverArt,
): ManualMetadataEdits {
  const base = manualEditsFromSource({
    meta: {
      title: track.title,
      artist: track.artist,
      album: track.album || album.title,
      albumartist: track.albumArtist || album.albumArtist || album.artist,
      genre: track.genre || album.genre,
      year: track.year || album.year,
      date: track.date,
      tracknumber: track.trackNumber,
      discnumber: track.discNumber,
    },
  });
  const cover =
    track.useAlbumCover && album.cover
      ? album.cover
      : sourceCover ?? base.cover;
  return { ...base, meta: { ...base.meta, ...trackMetaToMetaRecord(track, album) }, cover };
}

function trackMetaToMetaRecord(
  track: BatchTrackAlbumMeta,
  album: BatchAlbumLevelMeta,
): ManualMetadataEdits["meta"] {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album || album.title,
    albumartist: track.albumArtist || album.albumArtist || album.artist,
    genre: track.genre || album.genre,
    year: track.year || album.year,
    date: track.date,
    tracknumber: track.trackNumber,
    discnumber: track.discNumber,
    composer: "",
    comment: "",
  };
}

export function batchOutputFilenameForTrack(
  track: BatchTrackAlbumMeta,
  album: BatchAlbumLevelMeta,
  sourceName: string,
): string {
  const edits = trackMetaToManualEdits(track, album);
  let name = buildExportFilename(
    { title: edits.meta.title, artist: edits.meta.artist },
    BATCH_CODEC,
    sourceName,
  );
  const n = track.trackNumber.trim();
  if (n) {
    const pad = n.padStart(2, "0");
    const base = name.replace(/\.mp5$/i, "");
    if (!base.startsWith(`${pad} `)) {
      name = `${pad} - ${base}.mp5`;
    }
  }
  return name;
}

export function sortItemIdsByFilename(
  items: BatchQueueItem[],
  order: string[],
): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const sorted = [...order].sort((a, b) => {
    const fa = byId.get(a)?.sourceName ?? "";
    const fb = byId.get(b)?.sourceName ?? "";
    return fa.localeCompare(fb, undefined, { numeric: true, sensitivity: "base" });
  });
  return sorted;
}

export function sortItemIdsByTrackNumber(
  items: BatchQueueItem[],
  order: string[],
  trackMetas: Record<string, BatchTrackAlbumMeta>,
): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return [...order].sort((a, b) => {
    const na = parseInt(trackMetas[a]?.trackNumber ?? "", 10);
    const nb = parseInt(trackMetas[b]?.trackNumber ?? "", 10);
    const aNum = Number.isFinite(na) ? na : inferTrackNumberFromFilename(byId.get(a)?.sourceName ?? "") ?? 999;
    const bNum = Number.isFinite(nb) ? nb : inferTrackNumberFromFilename(byId.get(b)?.sourceName ?? "") ?? 999;
    if (aNum !== bNum) return aNum - bNum;
    return (byId.get(a)?.sourceName ?? "").localeCompare(byId.get(b)?.sourceName ?? "");
  });
}

export function moveInOrder(order: string[], index: number, direction: -1 | 1): string[] {
  const j = index + direction;
  if (j < 0 || j >= order.length) return order;
  const next = [...order];
  const tmp = next[index]!;
  next[index] = next[j]!;
  next[j] = tmp;
  return next;
}

export function completedBatchItems(items: BatchQueueItem[]): BatchQueueItem[] {
  return items.filter((i) => i.status === "complete" && i.mp5 && i.outputFilename);
}

export function albumExportModeFromTarget(
  target: BatchAlbumExportTarget,
): AlbumPackageExportMode | null {
  if (target === "manifest") return "manifest";
  if (target === "embedded") return "embedded";
  return null;
}
