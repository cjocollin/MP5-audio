import { getMetaValue } from "@mp5/container";
import type { RepeatMode } from "./queueNavigation";
import type { PlaylistTrack } from "../store/playerStore";

const STORAGE_KEY = "mp5-player-session-v1";

export interface PersistedTrackSummary {
  id: string;
  name: string;
  parseError?: string;
  durationSec?: number;
  title?: string;
  artist?: string;
  album?: string;
}

export interface PersistedPlayerSession {
  version: 1;
  repeatMode: RepeatMode;
  shuffle: boolean;
  volume: number;
  currentIndex: number;
  tracks: PersistedTrackSummary[];
}

export function trackToSummary(track: PlaylistTrack): PersistedTrackSummary {
  const meta = track.parsed?.meta ?? [];
  return {
    id: track.id,
    name: track.name,
    parseError: track.parseError,
    durationSec: track.durationSec,
    title: getMetaValue(meta, "title"),
    artist: getMetaValue(meta, "artist"),
    album: getMetaValue(meta, "album"),
  };
}

export function savePlayerSession(session: PersistedPlayerSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* quota or private mode */
  }
}

export function loadPlayerSession(): PersistedPlayerSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedPlayerSession;
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearPlayerSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * File handles cannot be restored after reload — summaries are for display / preferences only.
 */
export const PLAYLIST_PERSISTENCE_NOTE =
  "Playlist metadata is saved for this browser tab session only. Audio files must be dropped again after a full page reload.";
