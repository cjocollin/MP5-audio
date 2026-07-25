import { useEffect } from "react";
import { usePlayerStore } from "../store/playerStore";
import {
  applyPlaybackRangeTick,
  type ActivePlaybackRange,
} from "../lib/sections/playbackRange";

/**
 * Isolates currentTime subscription for section/highlight loop ticks so the
 * parent Mp5Player does not re-render on every clock tick.
 */
export function PlaybackRangeTicker({
  activeRange,
  isPlaying,
  onSeek,
  onStop,
}: {
  activeRange: ActivePlaybackRange | null;
  isPlaying: boolean;
  onSeek: (sec: number) => void;
  onStop: () => void;
}) {
  const currentTime = usePlayerStore((s) => s.currentTime);

  useEffect(() => {
    if (!isPlaying || !activeRange) return;
    const tick = applyPlaybackRangeTick(currentTime, activeRange);
    if (tick.action === "stop") {
      onStop();
      return;
    }
    if (tick.action === "loop") {
      onSeek(tick.seekSec);
    }
  }, [currentTime, isPlaying, activeRange, onSeek, onStop]);

  return null;
}