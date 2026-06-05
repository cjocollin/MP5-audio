import type { AlbmPackageManifest, CoverArt } from "@mp5/container";
import { parseMp5 } from "@mp5/container";
import { getBatchItemMp5Summary } from "./batchItemMp5Summary";
import type { BatchQueueItem } from "../../converter/batchTypes";
import { downloadBlob } from "../performance/downloadBlob";
import type { PlaylistTrack } from "../../store/playerStore";
import {
  createAlbumManifestFromTracks,
  defaultAlbumPackageFilename,
  downloadAlbumManifest,
  buildEmbeddedAlbumPackageBytes,
  type CreateAlbumInput,
} from "./createAlbumPackage";
import {
  albumExportModeFromTarget,
  batchOutputFilenameForTrack,
  completedBatchItems,
  type BatchAlbumExportTarget,
  type BatchAlbumLevelMeta,
  type BatchTrackAlbumMeta,
} from "./batchAlbumMetadata";

export interface BatchAlbumPackagePreview {
  exportTarget: BatchAlbumExportTarget;
  albumTitle: string;
  albumArtist: string;
  trackCount: number;
  totalBytes: number;
  estimatedEmbeddedBytes: number;
  warnings: string[];
  features: {
    withCover: number;
    withLyrics: number;
    withStems: number;
    withVisu: number;
  };
  missingTitle: number;
  missingArtist: number;
}

function mp5FileFromItem(item: BatchQueueItem): File {
  const blob = new Blob([new Uint8Array(item.mp5!)], { type: "audio/mp5" });
  return new File([blob], item.outputFilename!, { type: "audio/mp5" });
}

export function batchItemsToPlaylistTracks(
  items: BatchQueueItem[],
  order: string[],
): PlaylistTrack[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const tracks: PlaylistTrack[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (!item?.mp5 || !item.outputFilename) continue;
    const file = mp5FileFromItem(item);
    let parsed;
    try {
      parsed = parseMp5(new Uint8Array(item.mp5));
    } catch {
      parsed = undefined;
    }
    tracks.push({
      id: item.id,
      name: item.outputFilename,
      file,
      parsed,
      parseError: parsed ? undefined : "Could not parse exported MP5",
    });
  }
  return tracks;
}

export function computeBatchAlbumPreview(
  items: BatchQueueItem[],
  order: string[],
  album: BatchAlbumLevelMeta,
  trackMetas: Record<string, BatchTrackAlbumMeta>,
): BatchAlbumPackagePreview {
  const done = completedBatchItems(items);
  const ordered = order.filter((id) => done.some((i) => i.id === id));
  const warnings: string[] = [];
  let totalBytes = 0;
  let withCover = 0;
  let withLyrics = 0;
  let withStems = 0;
  let withVisu = 0;
  let missingTitle = 0;
  let missingArtist = 0;

  for (const id of ordered) {
    const item = done.find((i) => i.id === id);
    if (!item?.mp5) continue;
    totalBytes += item.mp5.byteLength;
    const meta = trackMetas[id];
    if (!meta?.title?.trim()) missingTitle++;
    if (!meta?.artist?.trim()) missingArtist++;
    const summary = getBatchItemMp5Summary(item);
    if (summary) {
      if (summary.hasCover) withCover++;
      if (summary.hasLyrics) withLyrics++;
      if (summary.hasStems) withStems++;
      if (summary.hasVisu) withVisu++;
    }
  }

  if (ordered.length < 2 && album.exportTarget !== "individual") {
    warnings.push("Album packages need at least two completed tracks.");
  }
  if (missingTitle > 0) warnings.push(`${missingTitle} track(s) missing title.`);
  if (missingArtist > 0) warnings.push(`${missingArtist} track(s) missing artist.`);
  if (withStems > 0 && album.exportTarget === "embedded") {
    warnings.push("Some tracks include stems — embedded package may be very large.");
  }
  if (album.exportTarget === "manifest") {
    warnings.push("Manifest .mp5p must stay with its sidecar .mp5 files in the same folder.");
  }
  if (album.exportTarget === "embedded" && totalBytes > 80 * 1024 * 1024) {
    warnings.push("Estimated package exceeds ~80 MB — download and memory limits may apply.");
  }
  if (album.exportTarget === "manifest" && ordered.length >= 4) {
    warnings.push("Multiple browser downloads — your browser may block or prompt for each file.");
  }

  const overhead = album.exportTarget === "embedded" ? Math.ceil(totalBytes * 0.02) + 4096 : 0;

  return {
    exportTarget: album.exportTarget,
    albumTitle: album.title.trim() || "Untitled album",
    albumArtist: album.albumArtist.trim() || album.artist.trim(),
    trackCount: ordered.length,
    totalBytes,
    estimatedEmbeddedBytes: totalBytes + overhead,
    warnings,
    features: { withCover, withLyrics, withStems, withVisu },
    missingTitle,
    missingArtist,
  };
}

export async function downloadIndividualBatchTracks(
  items: BatchQueueItem[],
  order: string[],
  staggerMs = 300,
): Promise<void> {
  const done = completedBatchItems(items);
  const byId = new Map(done.map((i) => [i.id, i]));
  const list = order.map((id) => byId.get(id)).filter(Boolean) as BatchQueueItem[];
  for (let i = 0; i < list.length; i++) {
    const item = list[i]!;
    downloadBlob(
      new Blob([new Uint8Array(item.mp5!)], { type: "audio/mp5" }),
      item.outputFilename!,
    );
    if (i < list.length - 1) {
      await new Promise((r) => setTimeout(r, staggerMs));
    }
  }
}

export interface BatchAlbumExportResult {
  ok: boolean;
  message?: string;
  exportTarget?: BatchAlbumExportTarget;
  trackCount?: number;
  packageFilename?: string;
  packageBytes?: Uint8Array;
  manifest?: AlbmPackageManifest;
  playableTracks?: PlaylistTrack[];
}

export async function exportBatchAlbumPackage(
  items: BatchQueueItem[],
  order: string[],
  album: BatchAlbumLevelMeta,
  trackMetas: Record<string, BatchTrackAlbumMeta>,
): Promise<BatchAlbumExportResult> {
  const done = completedBatchItems(items);
  if (done.length < 1) {
    return { ok: false, message: "No completed tracks to export." };
  }

  if (album.exportTarget === "individual") {
    await downloadIndividualBatchTracks(items, order);
    return { ok: true, exportTarget: "individual", trackCount: done.length };
  }

  if (album.exportTarget !== "manifest" && album.exportTarget !== "embedded") {
    return { ok: false, message: "Unknown export target." };
  }

  if (done.length < 2) {
    return { ok: false, message: "Album packages need at least two completed tracks." };
  }

  const tracks = batchItemsToPlaylistTracks(done, order.filter((id) => done.some((i) => i.id === id)));
  const playable = tracks.filter((t) => !t.parseError && t.file);
  if (playable.length < 2) {
    return { ok: false, message: "Could not prepare enough playable tracks for the album." };
  }

  const input: CreateAlbumInput = {
    albumTitle: album.title.trim() || "Untitled album",
    albumArtist: album.albumArtist.trim() || album.artist.trim(),
    year: album.year,
    genre: album.genre,
    credits: album.credits,
  };

  const mode = albumExportModeFromTarget(album.exportTarget)!;
  const manifest = await createAlbumManifestFromTracks(playable, input, {
    includeFileHashes: true,
    embedded: mode === "embedded",
  });
  if (!manifest) {
    return { ok: false, message: "Could not build album manifest." };
  }

  const filename = defaultAlbumPackageFilename(manifest);

  if (mode === "embedded") {
    const packageBytes = await buildEmbeddedAlbumPackageBytes(manifest, playable);
    downloadBlob(
      new Blob([packageBytes.slice().buffer], { type: "application/octet-stream" }),
      filename.endsWith(".mp5p") ? filename : `${filename}.mp5p`,
    );
    return {
      ok: true,
      exportTarget: "embedded",
      trackCount: playable.length,
      packageFilename: filename,
      packageBytes,
      manifest,
      playableTracks: playable,
    };
  }

  downloadAlbumManifest(manifest, filename);
  await downloadIndividualBatchTracks(items, order);
  return {
    ok: true,
    exportTarget: "manifest",
    trackCount: playable.length,
    packageFilename: filename,
    manifest,
    playableTracks: playable,
  };
}

/** Recompute output filenames from track metadata (call before batch encode in album mode). */
export function syncBatchOutputFilenames(
  items: BatchQueueItem[],
  trackMetas: Record<string, BatchTrackAlbumMeta>,
  album: BatchAlbumLevelMeta,
): BatchQueueItem[] {
  return items.map((item) => {
    const meta = trackMetas[item.id];
    if (!meta) return item;
    return {
      ...item,
      outputFilename: batchOutputFilenameForTrack(meta, album, item.sourceName),
      detectedTitle: meta.title,
      detectedArtist: meta.artist,
    };
  });
}

export function coverArtFromFile(file: File, data: Uint8Array): CoverArt {
  const mime = file.type.startsWith("image/") ? file.type : "image/jpeg";
  return { mime, data };
}
