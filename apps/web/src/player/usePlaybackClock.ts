import { useEffect, useRef, useState } from "react";

const LYRIC_UI_INTERVAL_MS = 66; // ~15 fps

/** Lyrics/highlight UI time from AudioContext clock — not laggy React playback state. */
export function usePlaybackClock(
  getPlaybackTime: () => number,
  isPlaying: boolean,
  pausedTime: number,
): number {
  const [uiTime, setUiTime] = useState(pausedTime);
  const getRef = useRef(getPlaybackTime);
  getRef.current = getPlaybackTime;

  useEffect(() => {
    setUiTime(pausedTime);
  }, [pausedTime]);

  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let lastSample = 0;
    const tick = (now: number) => {
      if (now - lastSample >= LYRIC_UI_INTERVAL_MS) {
        setUiTime(getRef.current());
        lastSample = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return isPlaying ? uiTime : pausedTime;
}
