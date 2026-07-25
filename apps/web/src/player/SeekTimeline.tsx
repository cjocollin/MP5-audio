import { useState, type ReactNode } from "react";
import { usePlayerStore } from "../store/playerStore";
import { formatTimelineRange } from "./playerDisplay";

interface SeekTimelineProps {
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
  /** Extra class on the range input */
  className?: string;
  testId?: string;
  ariaLabel?: string;
  /** Show current/duration labels under the slider */
  showLabels?: boolean;
  /** Compact inline labels (persistent transport) */
  layout?: "stacked" | "inline";
}

/**
 * Seek scrubber that selects only currentTime from the store so clock ticks
 * do not re-render the parent player tree. onInput updates UI only; commit on change.
 */
export function SeekTimeline({
  duration,
  onSeek,
  disabled = false,
  className = "mp5-seek-slider w-full touch-pan-x disabled:opacity-40",
  testId = "seek-slider",
  ariaLabel = "Seek",
  showLabels = true,
  layout = "stacked",
}: SeekTimelineProps) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const displayTime = scrubTime ?? currentTime;
  const ready = duration > 0 && !disabled;
  const timeline = formatTimelineRange(displayTime, duration);

  const commit = (value: number) => {
    onSeek(value);
    setScrubTime(null);
  };

  const slider = (
    <input
      type="range"
      min={0}
      max={duration || 1}
      step={0.01}
      value={displayTime}
      onInput={(event) => setScrubTime(Number(event.currentTarget.value))}
      // Commit on pointer/touch release (and keyboard change), not every drag tick.
      onPointerUp={(event) => commit(Number(event.currentTarget.value))}
      onTouchEnd={(event) => commit(Number(event.currentTarget.value))}
      onKeyUp={(event) => {
        if (
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.key === "Home" ||
          event.key === "End" ||
          event.key === "PageUp" ||
          event.key === "PageDown"
        ) {
          commit(Number(event.currentTarget.value));
        }
      }}
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
      disabled={!ready}
    />
  );

  if (layout === "inline") {
    return (
      <div className="mp5-persistent-timeline" data-testid="seek-timeline">
        {showLabels && <span className="mp5-seek-time">{timeline.current}</span>}
        {slider}
        {showLabels && <span className="mp5-seek-time">{timeline.duration}</span>}
      </div>
    );
  }

  // Times flank the track on one row so the thumb never covers "0:00".
  return (
    <div className="mp5-seek-block" data-testid="seek-timeline">
      <div className="mp5-seek-row">
        {showLabels && (
          <span className="mp5-seek-time" data-testid="current-time">
            {timeline.current}
          </span>
        )}
        {slider}
        {showLabels && (
          <>
            <span className="sr-only" data-testid="remaining-time">
              {timeline.remaining}
            </span>
            <span className="mp5-seek-time" data-testid="duration-time">
              {timeline.duration}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Compact clock that only re-renders on currentTime ticks. */
export function NowPlayingClock({ duration }: { duration: number }) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const timeline = formatTimelineRange(currentTime, duration);
  return (
    <>
      <dt className="sr-only">Current time</dt>
      <dd className="sr-only" data-testid="now-playing-current-time">
        {timeline.current}
      </dd>
      <dt className="sr-only">Remaining</dt>
      <dd className="sr-only" data-testid="now-playing-remaining">
        {timeline.remaining}
      </dd>
    </>
  );
}

/** Waveform progress wrapper - isolates currentTime subscription. */
export function WaveformProgress({
  duration,
  children,
}: {
  duration: number;
  children: (progress: number) => ReactNode;
}) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const progress = duration > 0 ? currentTime / duration : 0;
  return <>{children(progress)}</>;
}
