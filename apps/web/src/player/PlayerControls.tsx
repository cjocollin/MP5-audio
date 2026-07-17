import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { Repeat } from "@phosphor-icons/react/Repeat";
import { RepeatOnce } from "@phosphor-icons/react/RepeatOnce";
import { Shuffle } from "@phosphor-icons/react/Shuffle";
import { SkipBack } from "@phosphor-icons/react/SkipBack";
import { SkipForward } from "@phosphor-icons/react/SkipForward";
import { SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import type { PlaybackReadiness } from "../lib/playback/playbackState";
import type { RepeatMode } from "../store/playerStore";
import { formatTimelineRange, playbackStateLabel } from "./playerDisplay";
import { repeatModeLabel } from "./queueNavigation";

export type PlayerPlaybackStatus = "stopped" | "playing" | "paused" | "preparing";

interface Props {
  isPlaying: boolean;
  onPlayPause: () => void;
  playbackStatus?: PlayerPlaybackStatus;
  playbackReadiness?: PlaybackReadiness;
  playbackStatusDetail?: string;
  hasTrack?: boolean;
  isEnded?: boolean;
  onPrev: () => void;
  onNext: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  repeatMode: RepeatMode;
  shuffle: boolean;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
  volume: number;
  onVolume: (v: number) => void;
}

export function PlayerControls({
  isPlaying,
  onPlayPause,
  playbackStatus,
  playbackReadiness = "not_loaded",
  playbackStatusDetail,
  hasTrack = false,
  isEnded = false,
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
  repeatMode,
  shuffle,
  onToggleShuffle,
  onCycleRepeat,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolume,
}: Props) {
  const ready = duration > 0;
  const timeline = formatTimelineRange(currentTime, duration);
  const statusLabel = playbackStateLabel({
    readiness: playbackReadiness,
    playState: playbackStatus ?? "stopped",
    detail: playbackStatusDetail,
    hasTrack,
    isEnded,
  });
  const RepeatIcon = repeatMode === "one" ? RepeatOnce : Repeat;

  return (
    <div className="mp5-player-controls" data-testid="player-controls">
      {statusLabel && (
        <p
          className="sr-only"
          data-testid="player-playback-status"
          data-playback-status={playbackStatus ?? "stopped"}
        >
          {statusLabel}
        </p>
      )}
      {!ready && (
        <p className="sr-only" data-testid="player-not-ready">
          Load an .mp5 file to enable playback
        </p>
      )}

      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.01}
        value={currentTime}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="mp5-seek-slider w-full touch-pan-x disabled:opacity-40"
        data-testid="seek-slider"
        aria-label="Seek"
        disabled={!ready}
      />

      <div className="mp5-timeline-labels">
        <span data-testid="current-time">{timeline.current}</span>
        <span className="sr-only" data-testid="remaining-time">{timeline.remaining}</span>
        <span data-testid="duration-time">{timeline.duration}</span>
      </div>

      <div className="mp5-transport-actions">
        <button
          type="button"
          onClick={onToggleShuffle}
          className={`mp5-transport-button ${shuffle ? "bg-violet-500/15 text-violet-300" : ""}`}
          aria-label={shuffle ? "Turn shuffle off" : "Turn shuffle on"}
          aria-pressed={shuffle}
          data-testid="player-shuffle"
        >
          <Shuffle size={21} weight={shuffle ? "fill" : "regular"} />
        </button>
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className="mp5-transport-button"
          aria-label="Previous"
          data-testid="player-prev"
        >
          <SkipBack size={24} weight="fill" />
        </button>
        <button
          type="button"
          onClick={onPlayPause}
          disabled={!ready}
          className="mp5-transport-play"
          data-testid="play-pause"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={25} weight="fill" /> : <Play size={25} weight="fill" />}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="mp5-transport-button"
          aria-label="Next"
          data-testid="player-next"
        >
          <SkipForward size={24} weight="fill" />
        </button>
        <button
          type="button"
          onClick={onCycleRepeat}
          className={`mp5-transport-button ${repeatMode !== "off" ? "bg-violet-500/15 text-violet-300" : ""}`}
          aria-label={repeatModeLabel(repeatMode)}
          data-testid="player-repeat"
          data-repeat-mode={repeatMode}
        >
          <RepeatIcon size={21} weight={repeatMode !== "off" ? "fill" : "regular"} />
        </button>
      </div>

      <label className="mp5-volume-control">
        <SpeakerHigh size={18} aria-hidden />
        <span className="sr-only">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => onVolume(Number(event.target.value))}
          className="h-7 min-w-0 flex-1 accent-accent"
          data-testid="volume-slider"
          aria-label="Volume"
        />
        <span className="w-7 text-right font-mono text-[10px]">{Math.round(volume * 100)}</span>
      </label>
    </div>
  );
}
