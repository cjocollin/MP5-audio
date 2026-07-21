import type { Mp5File } from "@mp5/container";
import { getMetaValue } from "@mp5/container";
import { codecLabel } from "../lib/codecDisplay";
import type { AlbumPlaybackContext } from "../lib/album/albumPlaybackContext";
import type { IntegrityCheckResult } from "@mp5/container";
import type { PlaybackPlayState, PlaybackReadiness } from "../lib/playback/playbackState";
import type { PlaylistTrack } from "../store/playerStore";
import { formatDuration, formatPlaybackTime, trackDisplayInfo } from "./playlistUtils";

export type PlayerSourceKind = "mp5" | "manifest-mp5p" | "embedded-mp5p" | "unknown";

export interface NowPlayingSummary {
  title: string;
  artist: string;
  album: string;
  codecLabel: string | null;
  sourceKind: PlayerSourceKind;
  sourceLabel: string;
  trackPositionLabel: string | null;
  currentTimeLabel: string;
  durationLabel: string;
  remainingLabel: string;
  loadingLabel: string | null;
  integrityLabel: string | null;
  hasCoverArt: boolean;
}

export interface QueueRowSummary {
  title: string;
  artist: string;
  album: string;
  durationLabel: string;
  sourceKind: PlayerSourceKind;
  sourceLabel: string;
  albumContextLabel: string | null;
  statusLabel: string | null;
  metadataPending: boolean;
}

export function sourceKindForTrack(
  track: PlaylistTrack | undefined,
  albumContext?: AlbumPlaybackContext | null,
): PlayerSourceKind {
  if (track?.embeddedAlbum || albumContext?.packageKind === "embedded") return "embedded-mp5p";
  if (albumContext?.packageKind === "manifest") return "manifest-mp5p";
  if (track?.file || track?.parsed) return "mp5";
  return "unknown";
}

export function playerSourceLabel(kind: PlayerSourceKind): string {
  switch (kind) {
    case "mp5":
      return ".mp5";
    case "manifest-mp5p":
      return "manifest .mp5p";
    case "embedded-mp5p":
      return "embedded .mp5p";
    case "unknown":
      return "No file";
  }
}

function hasCoverArt(parsed?: Mp5File): boolean {
  return !!(parsed?.coverArt?.data.length || parsed?.cover?.length);
}

function integrityLabel(integrity: IntegrityCheckResult | null | undefined): string | null {
  const status = integrity?.status;
  if (!status || status === "missing") return null;
  switch (status) {
    case "verified":
      return "Verified";
    case "audio_verified":
      return "Audio verified";
    case "pending":
      return "Integrity pending";
    case "mismatch":
      return "Integrity warning";
    case "unsupported":
      return "Integrity partial";
    case "partial":
      return "Partially verified";
    default:
      return status;
  }
}

export function buildNowPlayingSummary(input: {
  track?: PlaylistTrack;
  parsed?: Mp5File;
  albumContext?: AlbumPlaybackContext | null;
  currentTimeSec: number;
  durationSec: number;
  loading: boolean;
  embeddedHydrating: boolean;
  integrity?: IntegrityCheckResult | null;
}): NowPlayingSummary {
  const info = input.track ? trackDisplayInfo(input.track) : null;
  const title = info?.title || "Song Name";
  const artist = info?.artist || (input.track ? "Unknown artist" : "Artist");
  const album =
    info?.album ||
    getMetaValue(input.parsed?.meta ?? [], "album") ||
    input.albumContext?.packageTitle ||
    "";
  const sourceKind = sourceKindForTrack(input.track, input.albumContext);
  const trackPositionLabel = input.albumContext
    ? `Track ${input.albumContext.trackNumber} of ${input.albumContext.trackCount}`
    : null;
  const durationLabel = formatDuration(input.durationSec || info?.durationSec || null);
  const loadingLabel = input.embeddedHydrating
    ? "Hydrating embedded track"
    : input.loading
      ? "Decoding audio"
      : null;
  const remaining =
    input.durationSec > 0 ? Math.max(0, input.durationSec - input.currentTimeSec) : 0;

  return {
    title,
    artist,
    album,
    codecLabel:
      input.parsed?.head != null
        ? codecLabel(input.parsed.head.codecId, input.parsed.audioFrames[0]?.data)
        : null,
    sourceKind,
    sourceLabel: playerSourceLabel(sourceKind),
    trackPositionLabel,
    currentTimeLabel: formatPlaybackTime(input.currentTimeSec),
    durationLabel,
    remainingLabel: input.durationSec > 0 ? `-${formatPlaybackTime(remaining)}` : "-:--",
    loadingLabel,
    integrityLabel: integrityLabel(input.integrity),
    hasCoverArt: hasCoverArt(input.parsed),
  };
}

export function buildQueueRowSummary(input: {
  track: PlaylistTrack;
  index: number;
  isCurrent: boolean;
  isPlayingNow: boolean;
  albumContext?: AlbumPlaybackContext | null;
  isHydrating?: boolean;
}): QueueRowSummary {
  const info = trackDisplayInfo(input.track);
  const sourceKind = sourceKindForTrack(input.track, input.albumContext);
  const albumContextLabel = input.albumContext
    ? `${input.albumContext.packageTitle} - track ${input.albumContext.trackNumber}/${input.albumContext.trackCount}`
    : info.album || null;
  const metadataPending =
    !!input.track.embeddedAlbum &&
    !input.track.file &&
    !input.track.parsed?.coverArt &&
    !input.track.parsed?.cover?.length;
  const statusLabel = input.isHydrating
    ? "Hydrating"
    : input.track.parseError
      ? "Unreadable file"
      : input.isPlayingNow
        ? "Playing"
        : input.isCurrent
          ? "Selected"
          : null;

  return {
    title: info.title,
    artist: info.artist || "Unknown artist",
    album: info.album,
    durationLabel: formatDuration(info.durationSec),
    sourceKind,
    sourceLabel: playerSourceLabel(sourceKind),
    albumContextLabel,
    statusLabel,
    metadataPending,
  };
}

export function playbackStateLabel(input: {
  readiness: PlaybackReadiness;
  playState: PlaybackPlayState;
  detail?: string;
  hasTrack: boolean;
  isEnded?: boolean;
}): string {
  if (input.detail?.trim()) return input.detail.trim();
  if (input.readiness === "error") return "Playback error";
  if (!input.hasTrack) return "Drop an .mp5 or .mp5p package to start listening";
  if (input.isEnded) return "Ended";
  if (input.readiness === "indexing") return "Reading file";
  if (input.readiness === "decoding") return "Decoding audio";
  if (input.playState === "preparing") return "Preparing audio";
  if (input.playState === "playing") return "Playing";
  if (input.playState === "paused") return "Paused";
  return "Ready";
}

export function formatTimelineRange(currentTimeSec: number, durationSec: number): {
  current: string;
  duration: string;
  remaining: string;
} {
  const safeDuration = Number.isFinite(durationSec) ? durationSec : 0;
  const safeCurrent = Number.isFinite(currentTimeSec) ? Math.max(0, currentTimeSec) : 0;
  return {
    current: formatPlaybackTime(safeCurrent),
    duration: formatDuration(safeDuration),
    remaining: safeDuration > 0 ? `-${formatPlaybackTime(Math.max(0, safeDuration - safeCurrent))}` : "-:--",
  };
}
