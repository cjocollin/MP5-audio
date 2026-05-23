import { useEffect, useRef } from "react";
import {
  clampPlaybackSeconds,
  type ActiveClockMode,
} from "../lib/playback/activePlaybackClock";

const SEEK_UI_INTERVAL_MS = 100;

/**
 * Single UI clock driver for the seek bar — reads the active engine only.
 */
export function useActivePlaybackClock(
  isPlaying: boolean,
  duration: number,
  getPlaybackTime: () => number,
  setCurrentTime: (t: number) => void,
  _mode: ActiveClockMode,
  hasActiveSource: () => boolean,
): void {
  const getRef = useRef(getPlaybackTime);
  getRef.current = getPlaybackTime;
  const hasActiveRef = useRef(hasActiveSource);
  hasActiveRef.current = hasActiveSource;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  useEffect(() => {
    if (!isPlaying || durationRef.current <= 0) return;
    let raf = 0;
    let lastSample = 0;
    const tick = (now: number) => {
      // Sources may start after isPlaying (e.g. karaoke stem load) — keep polling until active.
      if (hasActiveRef.current() && now - lastSample >= SEEK_UI_INTERVAL_MS) {
        const raw = getRef.current();
        setCurrentTime(clampPlaybackSeconds(raw, durationRef.current));
        lastSample = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, setCurrentTime]);
}
