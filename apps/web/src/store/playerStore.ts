import { create } from "zustand";
import type { Mp5File } from "@mp5/container";
import {
  buildShuffleOrder,
  canNavigateNext,
  canNavigatePrev,
  computeAdvanceAfterEnd,
  computeManualNextIndex,
  computeManualPrevIndex,
  cycleRepeatMode,
  type RepeatMode,
  resolveAutoAdvanceIndex,
} from "../player/queueNavigation";
import type { ResolvedAlbumPackage } from "../lib/album/resolveAlbum";
import type { PlayIntentSource } from "../player/engine/playbackMachine";

export type { RepeatMode };

export interface EmbeddedAlbumPackageMeta {
  albumTitle: string;
  albumArtist?: string;
  year?: string;
  genre?: string;
}

export interface EmbeddedAlbumTrackDisplay {
  title?: string;
  artist?: string;
  album?: string;
}

export interface EmbeddedAlbumTrackRef {
  trackId: string;
  filename: string;
  display?: EmbeddedAlbumTrackDisplay;
  packageMeta?: EmbeddedAlbumPackageMeta;
}

export interface PlaylistTrack {
  id: string;
  name: string;
  /** The concept's first-load demo; replaced atomically when the user imports real audio. */
  origin?: "default-demo";
  file?: File;
  /** Cached file bytes — eager ingest only (large files use lazy index + File ref). */
  rawBuffer?: ArrayBuffer;
  parsed?: Mp5File;
  /** True when opened via blob chunk index (no full rawBuffer). */
  lazyIngest?: boolean;
  parseError?: string;
  durationSec?: number;
  objectUrl?: string;
  /** Queued embedded album track — bytes load when selected/played. */
  embeddedAlbum?: EmbeddedAlbumTrackRef;
}

export function isDefaultDemoTrack(track: PlaylistTrack | undefined): boolean {
  return track?.origin === "default-demo";
}

/** User-owned queues and album resolution must never treat the first-load demo as imported audio. */
export function withoutDefaultDemoTracks(tracks: readonly PlaylistTrack[]): PlaylistTrack[] {
  return tracks.filter((track) => !isDefaultDemoTrack(track));
}

interface PlayerState {
  tracks: PlaylistTrack[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  shuffleOrder: number[];
  theme: "dark" | "light";
  /** When false, ignore VISU chunk styling and use default app chrome. */
  useFileThemes: boolean;
  activeTab: "player" | "converter" | "library" | "demo" | "about" | "settings";
  sessionRestored: boolean;
  /** Prevents a pending demo fetch from reseeding after the user opens their own content. */
  defaultDemoDismissed: boolean;
  /** Set from Library when opening a saved album; consumed by Mp5Player. */
  pendingAlbumPackage: ResolvedAlbumPackage | null;
  /** Source audio staged from Player Open/drop for Converter handoff. */
  pendingConverterFiles: File[] | null;
  /** MP5 files staged from the shell for Local Library import. */
  pendingLibraryFiles: File[] | null;
  /** Files picked from shell/empty Open (named picker); consumed by Mp5Player. */
  pendingPlayerFiles: File[] | null;
  /**
   * Owned "play when ready" intent, keyed by track id. Set by out-of-component
   * play requests (import playFirst, library/converter/demo open-and-play) that
   * cannot reach the player's refs; consumed only when playback actually starts
   * for that exact track, so an aborted/superseded load can never deliver it to
   * the wrong track or drop it.
   */
  pendingPlayTrackId: string | null;
  /**
   * Source tag paired with `pendingPlayTrackId` — how the play was requested
   * (import/library/converter default to "external"; auto-advance tags
   * "autoAdvance" so a failed skip can chain to the next track). Read alongside
   * the id when the track-load effect drains the mailbox into the machine.
   */
  pendingPlaySource: PlayIntentSource | null;
  setTracks: (t: PlaylistTrack[]) => void;
  replacePlaylistTrack: (id: string, next: PlaylistTrack) => void;
  appendTracks: (t: PlaylistTrack[]) => void;
  removeTrack: (id: string) => void;
  clearTracks: () => void;
  setCurrentIndex: (i: number, opts?: { keepPlaying?: boolean }) => void;
  playNext: () => void;
  playPrevious: () => void;
  handleTrackEnded: () => AdvanceAfterEndResult;
  cycleRepeatMode: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  setShuffle: (shuffle: boolean) => void;
  setPlaying: (p: boolean) => void;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setVolume: (v: number) => void;
  setTheme: (t: "dark" | "light") => void;
  setUseFileThemes: (v: boolean) => void;
  setActiveTab: (t: PlayerState["activeTab"]) => void;
  setSessionRestored: (v: boolean) => void;
  dismissDefaultDemo: () => void;
  setPendingAlbumPackage: (album: ResolvedAlbumPackage | null) => void;
  consumePendingAlbumPackage: () => ResolvedAlbumPackage | null;
  setPendingConverterFiles: (files: File[] | null) => void;
  consumePendingConverterFiles: () => File[] | null;
  setPendingLibraryFiles: (files: File[] | null) => void;
  consumePendingLibraryFiles: () => File[] | null;
  setPendingPlayerFiles: (files: File[] | null) => void;
  consumePendingPlayerFiles: () => File[] | null;
  setPendingPlayTrackId: (id: string | null, source?: PlayIntentSource) => void;
  /** Clear + return true iff the pending play intent is for this exact track. */
  consumePendingPlayTrackId: (trackId: string) => boolean;
  syncShuffleOrder: () => void;
  navArgs: () => {
    tracks: PlaylistTrack[];
    currentIndex: number;
    repeatMode: RepeatMode;
    shuffle: boolean;
    shuffleOrder: number[];
  };
}

export type AdvanceAfterEndResult =
  | { type: "repeat_one" }
  | { type: "stop" }
  | { type: "goto"; index: number; autoPlay: boolean };

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

const FILE_THEMES_STORAGE_KEY = "mp5-use-file-themes-v1";
const MP5_THEME_STORAGE_KEY = "mp5-theme-v1";

function loadThemePref(): "dark" | "light" {
  try {
    return localStorage.getItem(MP5_THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function loadUseFileThemesPref(): boolean {
  try {
    const v = localStorage.getItem(FILE_THEMES_STORAGE_KEY);
    if (v === "0" || v === "false") return false;
    return true;
  } catch {
    return true;
  }
}

function rebuildShuffle(tracks: PlaylistTrack[], currentIndex: number): number[] {
  if (!tracks.length) return [];
  return buildShuffleOrder(tracks, currentIndex);
}

function revokeTrackObjectUrls(tracks: PlaylistTrack[]): void {
  for (const t of tracks) {
    if (t.objectUrl) {
      URL.revokeObjectURL(t.objectUrl);
    }
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  tracks: [],
  currentIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  repeatMode: "off",
  shuffle: false,
  shuffleOrder: [],
  theme: loadThemePref(),
  useFileThemes: loadUseFileThemesPref(),
  activeTab: "player",
  sessionRestored: false,
  defaultDemoDismissed: false,
  pendingAlbumPackage: null,
  pendingConverterFiles: null,
  pendingLibraryFiles: null,
  pendingPlayerFiles: null,
  pendingPlayTrackId: null,
  pendingPlaySource: null,
  navArgs: () => {
    const s = get();
    return {
      tracks: s.tracks,
      currentIndex: s.currentIndex,
      repeatMode: s.repeatMode,
      shuffle: s.shuffle,
      shuffleOrder: s.shuffleOrder,
    };
  },
  setTracks: (tracks) =>
    set((s) => ({
      tracks,
      currentIndex: clampIndex(s.currentIndex, tracks.length),
      isPlaying: tracks.length ? s.isPlaying : false,
      shuffleOrder: s.shuffle ? rebuildShuffle(tracks, clampIndex(s.currentIndex, tracks.length)) : [],
      defaultDemoDismissed:
        s.defaultDemoDismissed || tracks.some((track) => !isDefaultDemoTrack(track)),
    })),
  replacePlaylistTrack: (id, next) =>
    set((s) => {
      const idx = s.tracks.findIndex((t) => t.id === id);
      if (idx < 0) return s;
      const tracks = [...s.tracks];
      tracks[idx] = next;
      return { tracks };
    }),
  appendTracks: (incoming) =>
    set((s) => {
      if (!incoming.length) return s;
      const replaceDefaultDemo =
        s.tracks.length === 1 &&
        s.tracks[0]?.origin === "default-demo" &&
        incoming.some((track) => track.origin !== "default-demo");
      const tracks = replaceDefaultDemo ? incoming : [...s.tracks, ...incoming];
      const wasEmpty = s.tracks.length === 0 || replaceDefaultDemo;
      const currentIndex = wasEmpty ? 0 : s.currentIndex;
      return {
        tracks,
        currentIndex,
        isPlaying: replaceDefaultDemo ? false : s.isPlaying,
        currentTime: replaceDefaultDemo ? 0 : s.currentTime,
        duration: replaceDefaultDemo ? 0 : s.duration,
        shuffleOrder: s.shuffle ? rebuildShuffle(tracks, currentIndex) : s.shuffleOrder,
        defaultDemoDismissed:
          s.defaultDemoDismissed || incoming.some((track) => !isDefaultDemoTrack(track)),
      };
    }),
  removeTrack: (id) =>
    set((s) => {
      const removeIndex = s.tracks.findIndex((t) => t.id === id);
      if (removeIndex < 0) return s;
      const removed = s.tracks[removeIndex];
      if (removed?.objectUrl) URL.revokeObjectURL(removed.objectUrl);
      const tracks = s.tracks.filter((t) => t.id !== id);
      if (!tracks.length) {
        return {
          tracks: [],
          currentIndex: 0,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          shuffleOrder: [],
          defaultDemoDismissed:
            s.defaultDemoDismissed || isDefaultDemoTrack(removed),
        };
      }
      let currentIndex = s.currentIndex;
      if (removeIndex < currentIndex) currentIndex -= 1;
      else if (removeIndex === currentIndex) currentIndex = Math.min(currentIndex, tracks.length - 1);
      currentIndex = clampIndex(currentIndex, tracks.length);
      return {
        tracks,
        currentIndex,
        shuffleOrder: s.shuffle ? rebuildShuffle(tracks, currentIndex) : [],
        defaultDemoDismissed:
          s.defaultDemoDismissed || isDefaultDemoTrack(removed),
      };
    }),
  clearTracks: () =>
    set((s) => {
      revokeTrackObjectUrls(s.tracks);
      return {
        tracks: [],
        currentIndex: 0,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        shuffleOrder: [],
        defaultDemoDismissed: true,
        pendingPlayTrackId: null,
        pendingPlaySource: null,
      };
    }),
  setCurrentIndex: (currentIndex, opts) =>
    set((s) => ({
      currentIndex: clampIndex(currentIndex, s.tracks.length),
      isPlaying: opts?.keepPlaying ? s.isPlaying : false,
      currentTime: opts?.keepPlaying ? s.currentTime : 0,
    })),
  playNext: () => {
    const s = get();
    const next = computeManualNextIndex(s.navArgs());
    if (next === null) return;
    const keep = s.isPlaying;
    set({
      currentIndex: next,
      isPlaying: keep,
      currentTime: 0,
    });
  },
  playPrevious: () => {
    const s = get();
    const prev = computeManualPrevIndex(s.navArgs());
    if (prev === null) return;
    const keep = s.isPlaying;
    set({
      currentIndex: prev,
      isPlaying: keep,
      currentTime: 0,
    });
  },
  handleTrackEnded: () => {
    const s = get();
    const args = s.navArgs();
    const action = computeAdvanceAfterEnd(args);
    if (action.type === "repeat_one") {
      return { type: "repeat_one" };
    }
    if (action.type === "stop") {
      set({ isPlaying: false, currentTime: 0 });
      return { type: "stop" };
    }
    const resolved = resolveAutoAdvanceIndex(
      s.tracks,
      action.index,
      s.repeatMode,
      s.shuffle,
      s.shuffleOrder,
    );
    if (resolved === null) {
      set({ isPlaying: false });
      return { type: "stop" };
    }
    set({ currentIndex: resolved, isPlaying: false, currentTime: 0 });
    return { type: "goto", index: resolved, autoPlay: true };
  },
  cycleRepeatMode: () =>
    set((s) => ({
      repeatMode: cycleRepeatMode(s.repeatMode),
    })),
  setRepeatMode: (repeatMode) => set({ repeatMode }),
  toggleShuffle: () =>
    set((s) => {
      const shuffle = !s.shuffle;
      return {
        shuffle,
        shuffleOrder: shuffle ? rebuildShuffle(s.tracks, s.currentIndex) : [],
      };
    }),
  setShuffle: (shuffle) =>
    set((s) => ({
      shuffle,
      shuffleOrder: shuffle ? rebuildShuffle(s.tracks, s.currentIndex) : [],
    })),
  syncShuffleOrder: () =>
    set((s) => ({
      shuffleOrder: s.shuffle ? rebuildShuffle(s.tracks, s.currentIndex) : [],
    })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  setTheme: (theme) => {
    try {
      localStorage.setItem(MP5_THEME_STORAGE_KEY, theme);
    } catch {
      /* private mode */
    }
    set({ theme });
  },
  setUseFileThemes: (useFileThemes) => {
    try {
      localStorage.setItem(FILE_THEMES_STORAGE_KEY, useFileThemes ? "1" : "0");
    } catch {
      /* private mode */
    }
    set({ useFileThemes });
  },
  setActiveTab: (activeTab) => set({ activeTab }),
  setSessionRestored: (sessionRestored) => set({ sessionRestored }),
  dismissDefaultDemo: () =>
    set((s) => {
      const tracks = withoutDefaultDemoTracks(s.tracks);
      if (tracks.length === s.tracks.length) {
        return s.defaultDemoDismissed ? s : { defaultDemoDismissed: true };
      }

      for (const track of s.tracks) {
        if (isDefaultDemoTrack(track) && track.objectUrl) URL.revokeObjectURL(track.objectUrl);
      }
      const currentTrack = s.tracks[s.currentIndex];
      const currentIndex = currentTrack && !isDefaultDemoTrack(currentTrack)
        ? Math.max(0, tracks.findIndex((track) => track.id === currentTrack.id))
        : 0;
      const resetPlayback = tracks.length === 0 || isDefaultDemoTrack(currentTrack);
      return {
        tracks,
        currentIndex,
        isPlaying: resetPlayback ? false : s.isPlaying,
        currentTime: resetPlayback ? 0 : s.currentTime,
        duration: resetPlayback ? 0 : s.duration,
        shuffleOrder: s.shuffle ? rebuildShuffle(tracks, currentIndex) : [],
        defaultDemoDismissed: true,
      };
    }),
  setPendingAlbumPackage: (pendingAlbumPackage) => {
    if (pendingAlbumPackage) get().dismissDefaultDemo();
    set({ pendingAlbumPackage });
  },
  consumePendingAlbumPackage: () => {
    const album = get().pendingAlbumPackage;
    set({ pendingAlbumPackage: null });
    return album;
  },
  setPendingConverterFiles: (pendingConverterFiles) => set({ pendingConverterFiles }),
  consumePendingConverterFiles: () => {
    const files = get().pendingConverterFiles;
    set({ pendingConverterFiles: null });
    return files;
  },
  setPendingLibraryFiles: (pendingLibraryFiles) => set({ pendingLibraryFiles }),
  consumePendingLibraryFiles: () => {
    const files = get().pendingLibraryFiles;
    set({ pendingLibraryFiles: null });
    return files;
  },
  setPendingPlayerFiles: (pendingPlayerFiles) => {
    if (pendingPlayerFiles?.length) get().dismissDefaultDemo();
    set({ pendingPlayerFiles });
  },
  consumePendingPlayerFiles: () => {
    const files = get().pendingPlayerFiles;
    set({ pendingPlayerFiles: null });
    return files;
  },
  setPendingPlayTrackId: (pendingPlayTrackId, source) =>
    set({
      pendingPlayTrackId,
      pendingPlaySource: pendingPlayTrackId ? (source ?? "external") : null,
    }),
  consumePendingPlayTrackId: (trackId) => {
    if (get().pendingPlayTrackId === trackId) {
      set({ pendingPlayTrackId: null, pendingPlaySource: null });
      return true;
    }
    return false;
  },
}));

export function selectCanGoNext(state: PlayerState): boolean {
  return canNavigateNext(state.navArgs());
}

export function selectCanGoPrev(state: PlayerState): boolean {
  return canNavigatePrev(state.navArgs());
}
