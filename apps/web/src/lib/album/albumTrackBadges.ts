import { codecLabel } from "../codecDisplay";
import type { PlaylistTrack } from "../../store/playerStore";
import { hasContentNotice } from "../../player/playlistUtils";
import type { ResolvedAlbumTrack } from "./resolveAlbum";

export type TrackAvailabilityState =
  | "available"
  | "missing-sidecar"
  | "extractable"
  | "integrity-warning"
  | "unreadable";

export interface AlbumTrackBadges {
  codec: string | null;
  hasStems: boolean;
  hasLyrics: boolean;
  hasVisu: boolean;
  hasContentGuidance: boolean;
  availability: TrackAvailabilityState;
  availabilityLabel: string;
}

export function trackAvailability(
  row: ResolvedAlbumTrack,
  isEmbedded: boolean,
): TrackAvailabilityState {
  if (row.missing) return "missing-sidecar";
  if (row.playlistTrack?.parseError) return "unreadable";
  if (row.sidecarStatus === "found-mismatch") return "integrity-warning";
  if (isEmbedded && !row.playlistTrack) return "extractable";
  if (row.playlistTrack) return "available";
  return isEmbedded ? "extractable" : "missing-sidecar";
}

function availabilityLabel(state: TrackAvailabilityState): string {
  switch (state) {
    case "available":
      return "Available";
    case "missing-sidecar":
      return "Missing sidecar";
    case "extractable":
      return "Extractable";
    case "integrity-warning":
      return "Integrity warning";
    case "unreadable":
      return "Unreadable";
  }
}

export function badgesForAlbumTrack(
  row: ResolvedAlbumTrack,
  isEmbedded: boolean,
): AlbumTrackBadges {
  const parsed = row.playlistTrack?.parsed;
  const availability = trackAvailability(row, isEmbedded);
  return {
    codec: parsed?.head != null ? codecLabel(parsed.head.codecId) : null,
    hasStems: parsed?.optional.has("STEM") ?? false,
    hasLyrics: parsed?.optional.has("LYRC") ?? false,
    hasVisu: parsed?.optional.has("VISU") ?? false,
    hasContentGuidance: hasContentNotice(parsed),
    availability,
    availabilityLabel: availabilityLabel(availability),
  };
}
