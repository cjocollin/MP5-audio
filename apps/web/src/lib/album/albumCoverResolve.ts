import type { AlbmCoverEmbedded, AlbmPackageManifest } from "@mp5/container";
import { decodeEmbeddedFragment, type EmbeddedAlbumPackageIndex } from "@mp5/container";
import { parseMp5 } from "@mp5/container";
import type { ResolvedAlbumPackage } from "./resolveAlbum";

export type AlbumCoverSource = "album" | "first-track" | "none";

export interface ResolvedAlbumCover {
  url?: string;
  source: AlbumCoverSource;
  loading?: boolean;
  error?: string;
}

function coverUrlFromEmbedded(cover: AlbmCoverEmbedded): string | undefined {
  try {
    const binary = atob(cover.dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: cover.mime });
    return URL.createObjectURL(blob);
  } catch {
    return undefined;
  }
}

export function resolveAlbumCoverFromManifest(
  manifest: AlbmPackageManifest,
): ResolvedAlbumCover {
  const cover = manifest.album.cover;
  if (cover?.type === "embedded") {
    const url = coverUrlFromEmbedded(cover);
    if (url) return { url, source: "album" };
  }
  if (cover?.type === "file") {
    return {
      source: "album",
      error: `Album cover is a sidecar file (${cover.path}) — not loaded in browser.`,
    };
  }
  return { source: "none" };
}

const MAX_COVER_PROBE_BYTES = 4 * 1024 * 1024;

/** Assemble first N bytes of an embedded track from fragment records (no full-package read). */
async function readEmbeddedTrackPrefix(
  source: File | Blob,
  index: EmbeddedAlbumPackageIndex,
  trackId: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const entry = index.tracks.find((t) => t.trackId === trackId);
  if (!entry?.fragments.length) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const ref of entry.fragments) {
    if (total >= maxBytes) break;
    const slice = source.slice(ref.recordOffset, ref.recordOffset + ref.recordLength);
    const recordBytes = new Uint8Array(await slice.arrayBuffer());
    const decoded = decodeEmbeddedFragment(recordBytes);
    if (!decoded) continue;
    parts.push(decoded.payload);
    total += decoded.payload.length;
  }
  if (!parts.length) return new Uint8Array(0);
  const out = new Uint8Array(Math.min(total, maxBytes));
  let o = 0;
  for (const p of parts) {
    const take = Math.min(p.length, maxBytes - o);
    out.set(p.subarray(0, take), o);
    o += take;
    if (o >= maxBytes) break;
  }
  return out;
}

/** Load first embedded track prefix (up to 4 MiB) to read COVR when album cover is missing. */
export async function resolveFirstTrackCoverFromEmbedded(
  file: File | Blob,
  index: EmbeddedAlbumPackageIndex,
  firstTrackId: string,
): Promise<ResolvedAlbumCover> {
  try {
    const assembled = await readEmbeddedTrackPrefix(file, index, firstTrackId, MAX_COVER_PROBE_BYTES);
    if (!assembled.length) return { source: "none" };
    const parsed = parseMp5(assembled);
    const art =
      parsed.coverArt ??
      (parsed.cover?.length ? { mime: "image/jpeg", data: parsed.cover } : undefined);
    if (!art?.data?.length) return { source: "none" };
    const mime = "mime" in art && typeof art.mime === "string" ? art.mime : "image/jpeg";
    const coverBytes = art.data.slice();
    const blob = new Blob([coverBytes.buffer], { type: mime });
    return { url: URL.createObjectURL(blob), source: "first-track" };
  } catch {
    return { source: "none", error: "Could not read cover from first embedded track." };
  }
}

export async function resolveAlbumCoverForPackage(
  album: ResolvedAlbumPackage,
): Promise<ResolvedAlbumCover> {
  const fromManifest = resolveAlbumCoverFromManifest(album.manifest);
  if (fromManifest.url) return fromManifest;
  if (album.packageKind === "embedded" && album.embeddedSource && album.tracks.length) {
    const firstId = album.tracks[0]!.ref.trackId;
    const fromTrack = await resolveFirstTrackCoverFromEmbedded(
      album.embeddedSource.file,
      album.embeddedSource.index,
      firstId,
    );
    if (fromTrack.url) return fromTrack;
    return fromTrack;
  }
  return fromManifest.source === "album" && fromManifest.error
    ? fromManifest
    : { source: "none" };
}
