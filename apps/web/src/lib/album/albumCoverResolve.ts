import type { AlbmCoverEmbedded, AlbmPackageManifest } from "@mp5/container";
import type { EmbeddedAlbumPackageIndex } from "@mp5/container";
import type { ResolvedAlbumPackage } from "./resolveAlbum";
import { readEmbeddedTrackMetadataPrefix } from "./embeddedTrackMetadata";

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

function coverUrlFromArt(mime: string, data: Uint8Array): string | undefined {
  try {
    const bytes = data.slice();
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
      type: mime,
    });
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

/** Read COVR from first embedded track metadata prefix (fragment slices only). */
export async function resolveFirstTrackCoverFromEmbedded(
  file: File | Blob,
  index: EmbeddedAlbumPackageIndex,
  firstTrackId: string,
): Promise<ResolvedAlbumCover> {
  try {
    const meta = await readEmbeddedTrackMetadataPrefix(file, index, firstTrackId);
    const art =
      meta.coverArt ??
      (meta.cover?.length ? { mime: "image/jpeg", data: meta.cover } : undefined);
    if (!art?.data?.length) return { source: "none" };
    const mime = "mime" in art && typeof art.mime === "string" ? art.mime : "image/jpeg";
    const url = coverUrlFromArt(mime, art.data);
    if (!url) return { source: "none" };
    return { url, source: "first-track" };
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
