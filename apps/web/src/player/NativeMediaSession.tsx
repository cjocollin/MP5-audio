import { useEffect, useRef } from "react";
import type { Mp5File } from "@mp5/container";
import type { PlaylistTrack } from "../store/playerStore";
import { usePlayerStore } from "../store/playerStore";
import { trackDisplayInfo } from "./playlistUtils";

export interface MediaSessionActions {
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
}

type MediaSessionLike = Pick<MediaSession, "setActionHandler">;

export function clampMediaPosition(position: number, duration: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(position, duration));
}

export function bindMediaSessionHandlers(
  session: MediaSessionLike,
  actions: MediaSessionActions,
  getPosition: () => { currentTime: number; duration: number },
): () => void {
  const set = (
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null,
  ) => {
    try {
      session.setActionHandler(action, handler);
    } catch {
      /* Browser does not implement this action. */
    }
  };

  set("play", () => actions.onPlay());
  set("pause", () => actions.onPause());
  set("previoustrack", () => actions.onPrevious());
  set("nexttrack", () => actions.onNext());
  set("seekto", (details) => {
    if (details.seekTime == null) return;
    const { duration } = getPosition();
    actions.onSeek(clampMediaPosition(details.seekTime, duration));
  });
  set("seekbackward", (details) => {
    const { currentTime, duration } = getPosition();
    actions.onSeek(clampMediaPosition(currentTime - (details.seekOffset ?? 10), duration));
  });
  set("seekforward", (details) => {
    const { currentTime, duration } = getPosition();
    actions.onSeek(clampMediaPosition(currentTime + (details.seekOffset ?? 10), duration));
  });

  return () => {
    for (const action of [
      "play",
      "pause",
      "previoustrack",
      "nexttrack",
      "seekto",
      "seekbackward",
      "seekforward",
    ] as MediaSessionAction[]) {
      set(action, null);
    }
  };
}

function coverFromParsed(parsed?: Mp5File): { mime: string; data: Uint8Array } | undefined {
  if (parsed?.coverArt?.data.length) return parsed.coverArt;
  if (parsed?.cover?.length) {
    return { mime: "image/jpeg", data: new Uint8Array(parsed.cover) };
  }
  return undefined;
}

interface Props extends MediaSessionActions {
  track?: PlaylistTrack;
  parsed?: Mp5File;
  isPlaying: boolean;
  duration: number;
}

/** Headless native-control bridge kept separate so playback clock ticks do not re-render Mp5Player. */
export function NativeMediaSession({
  track,
  parsed,
  isPlaying,
  duration,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSeek,
}: Props) {
  const currentTime = usePlayerStore((state) => state.currentTime);
  const actionsRef = useRef<MediaSessionActions>({
    onPlay,
    onPause,
    onPrevious,
    onNext,
    onSeek,
  });
  actionsRef.current = { onPlay, onPause, onPrevious, onNext, onSeek };

  useEffect(() => {
    const session = typeof navigator === "undefined" ? undefined : navigator.mediaSession;
    if (!session) return;
    return bindMediaSessionHandlers(
      session,
      {
        onPlay: () => actionsRef.current.onPlay(),
        onPause: () => actionsRef.current.onPause(),
        onPrevious: () => actionsRef.current.onPrevious(),
        onNext: () => actionsRef.current.onNext(),
        onSeek: (seconds) => actionsRef.current.onSeek(seconds),
      },
      () => {
        const state = usePlayerStore.getState();
        return { currentTime: state.currentTime, duration: state.duration };
      },
    );
  }, []);

  useEffect(() => {
    const session = typeof navigator === "undefined" ? undefined : navigator.mediaSession;
    if (!session) return;
    session.playbackState = track ? (isPlaying ? "playing" : "paused") : "none";
  }, [isPlaying, track]);

  useEffect(() => {
    const session = typeof navigator === "undefined" ? undefined : navigator.mediaSession;
    if (!session || !track || typeof MediaMetadata === "undefined") {
      if (session) session.metadata = null;
      return;
    }
    const info = trackDisplayInfo(track);
    const cover = coverFromParsed(parsed);
    const coverUrl = cover
      ? URL.createObjectURL(new Blob([cover.data.slice().buffer], { type: cover.mime }))
      : undefined;
    session.metadata = new MediaMetadata({
      title: info.title,
      artist: info.artist,
      album: info.album,
      artwork: coverUrl ? [{ src: coverUrl, type: cover?.mime }] : undefined,
    });
    return () => {
      if (coverUrl) URL.revokeObjectURL(coverUrl);
      session.metadata = null;
    };
  }, [parsed, track]);

  useEffect(() => {
    const session = typeof navigator === "undefined" ? undefined : navigator.mediaSession;
    if (!session?.setPositionState || !track || duration <= 0) return;
    try {
      session.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(clampMediaPosition(currentTime, duration), Math.max(0, duration - 0.001)),
      });
    } catch {
      /* Invalid/transient position state should never interrupt playback. */
    }
  }, [currentTime, duration, track]);

  return null;
}
