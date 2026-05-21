import {
  albumTrackBasename,
  type AlbmAuditWarning,
  type AlbmPackageManifest,
  type AlbmTrackRef,
} from "@mp5/container";
import type { PlaylistTrack } from "../../store/playerStore";
import { trackDisplayInfo } from "../../player/playlistUtils";
import type { SidecarIntegrityStatus } from "../fingerprint/sidecar";

export interface ResolvedAlbumTrack {
  ref: AlbmTrackRef;
  trackNumber: number;
  discNumber: number;
  displayTitle: string;
  displayArtist: string;
  durationMs: number | null;
  playlistTrack: PlaylistTrack | null;
  missing: boolean;
  sidecarStatus?: SidecarIntegrityStatus;
}

export interface ResolvedAlbumPackage {
  manifest: AlbmPackageManifest;
  manifestName?: string;
  tracks: ResolvedAlbumTrack[];
  missingCount: number;
  resolvedCount: number;
  /** Basenames of manifest file refs that matched loaded tracks. */
  foundFiles: string[];
  /** Manifest file refs still missing. */
  missingFiles: string[];
  totalDurationMs: number | null;
  warnings: AlbmAuditWarning[];
}

function basenameKey(name: string): string {
  return name.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? name.toLowerCase();
}

/** Match manifest track refs to available playlist tracks (by basename or trackId). */
export function resolveAlbumTracks(
  manifest: AlbmPackageManifest,
  available: PlaylistTrack[],
): ResolvedAlbumPackage {
  const byName = new Map<string, PlaylistTrack>();
  const byId = new Map<string, PlaylistTrack>();
  for (const t of available) {
    if (!t.parseError) {
      byName.set(basenameKey(t.name), t);
      byId.set(t.id, t);
    }
  }

  const albumArtist =
    manifest.album.albumArtist ?? manifest.album.artist ?? "";

  const tracks: ResolvedAlbumTrack[] = manifest.tracks.map((ref) => {
    const base = albumTrackBasename(ref.file);
    const playlistTrack =
      byId.get(ref.trackId) ?? byName.get(basenameKey(base)) ?? byName.get(basenameKey(ref.file)) ?? null;
    const info = playlistTrack ? trackDisplayInfo(playlistTrack) : null;
    const displayTitle = ref.title ?? info?.title ?? base.replace(/\.mp5$/i, "");
    const displayArtist = ref.artist ?? info?.artist ?? albumArtist;
    const durationMs =
      ref.durationMs ??
      (info?.durationSec != null ? Math.round(info.durationSec * 1000) : null);

    return {
      ref,
      trackNumber: ref.trackNumber,
      discNumber: ref.discNumber ?? 1,
      displayTitle,
      displayArtist,
      durationMs,
      playlistTrack,
      missing: !playlistTrack,
    };
  });

  const missingCount = tracks.filter((t) => t.missing).length;
  const foundFiles = tracks.filter((t) => !t.missing).map((t) => t.ref.file);
  const missingFiles = tracks.filter((t) => t.missing).map((t) => t.ref.file);
  let totalDurationMs = 0;
  let hasDuration = false;
  for (const t of tracks) {
    if (t.durationMs != null && t.durationMs > 0) {
      totalDurationMs += t.durationMs;
      hasDuration = true;
    }
  }

  return {
    manifest,
    tracks,
    missingCount,
    resolvedCount: tracks.length - missingCount,
    foundFiles,
    missingFiles,
    totalDurationMs: hasDuration ? totalDurationMs : null,
    warnings: [],
  };
}

export function enrichResolvedAlbum(
  album: ResolvedAlbumPackage,
  opts?: { manifestName?: string; warnings?: AlbmAuditWarning[] },
): ResolvedAlbumPackage {
  return {
    ...album,
    manifestName: opts?.manifestName ?? album.manifestName,
    warnings: opts?.warnings ?? album.warnings,
  };
}

export function resolvedTracksInOrder(album: ResolvedAlbumPackage): PlaylistTrack[] {
  return album.tracks
    .filter((t) => t.playlistTrack)
    .map((t) => t.playlistTrack!);
}
