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

export type { RepeatMode };

export interface PlaylistTrack {
  id: string;
  name: string;
  file?: File;
  /** Cached file bytes — eager ingest only (large files use lazy index + File ref). */
  rawBuffer?: ArrayBuffer;
  parsed?: Mp5File;
  /** True when opened via blob chunk index (no full rawBuffer). */
  lazyIngest?: boolean;
  parseError?: string;
  durationSec?: number;
  objectUrl?: string;
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
  /** Set from Library when opening a saved album; consumed by Mp5Player. */
  pendingAlbumPackage: ResolvedAlbumPackage | null;
  setTracks: (t: PlaylistTrack[]) => void;
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
  setPendingAlbumPackage: (album: ResolvedAlbumPackage | null) => void;
  consumePendingAlbumPackage: () => ResolvedAlbumPackage | null;
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
  theme: "dark",
  useFileThemes: loadUseFileThemesPref(),
  activeTab: "player",
  sessionRestored: false,
  pendingAlbumPackage: null,
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
    })),
  appendTracks: (incoming) =>
    set((s) => {
      if (!incoming.length) return s;
      const tracks = [...s.tracks, ...incoming];
      const wasEmpty = s.tracks.length === 0;
      const currentIndex = wasEmpty ? 0 : s.currentIndex;
      return {
        tracks,
        currentIndex,
        shuffleOrder: s.shuffle ? rebuildShuffle(tracks, currentIndex) : s.shuffleOrder,
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
      };
    }),
  setCurrentIndex: (currentIndex, opts) =>
    set((s) => ({
      currentIndex: clampIndex(currentIndex, s.tracks.length),
      isPlaying: opts?.keepPlaying ? s.isPlaying : false,
      currentTime: opts?.keepPlaying ? s.currentTime : 0,
    })),
  playNext: () => {
    const args = get().navArgs();
    const next = computeManualNextIndex(args);
    if (next === null) return;
    set({ currentIndex: next, isPlaying: false, currentTime: 0 });
  },
  playPrevious: () => {
    const args = get().navArgs();
    const prev = computeManualPrevIndex(args);
    if (prev === null) return;
    set({ currentIndex: prev, isPlaying: false, currentTime: 0 });
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
  setTheme: (theme) => set({ theme }),
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
  setPendingAlbumPackage: (pendingAlbumPackage) => set({ pendingAlbumPackage }),
  consumePendingAlbumPackage: () => {
    const album = get().pendingAlbumPackage;
    set({ pendingAlbumPackage: null });
    return album;
  },
}));

export function selectCanGoNext(state: PlayerState): boolean {
  return canNavigateNext(state.navArgs());
}

export function selectCanGoPrev(state: PlayerState): boolean {
  return canNavigatePrev(state.navArgs());
}
