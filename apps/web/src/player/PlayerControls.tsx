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
import { usePlayerStore } from "../store/playerStore";
import { playbackStateLabel } from "./playerDisplay";
import { repeatModeLabel } from "./queueNavigation";
import { SeekTimeline } from "./SeekTimeline";

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
  duration: number;
  onSeek: (t: number) => void;
  volume: number;
  onVolume: (v: number) => void;
  /** True while mix decode / AudioBuffer upload is in progress. */
  loading?: boolean;
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
  duration,
  onSeek,
  volume,
  onVolume,
  loading = false,
}: Props) {
  const ready = duration > 0 && !loading;
  // Ended detection selects currentTime here so Mp5Player need not subscribe.
  const currentTime = usePlayerStore((s) => s.currentTime);
  const ended =
    isEnded ||
    (duration > 0 &&
      !isPlaying &&
      currentTime >= Math.max(0, duration - 0.05) &&
      playbackReadiness !== "error");
  const statusLabel = playbackStateLabel({
    readiness: playbackReadiness,
    playState: playbackStatus ?? "stopped",
    detail: playbackStatusDetail,
    hasTrack,
    isEnded: ended,
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

      <SeekTimeline duration={duration} onSeek={onSeek} disabled={!ready} />

      <div className="mp5-transport-actions">
        <button
          type="button"
          onClick={onToggleShuffle}
          className={`mp5-transport-button ${shuffle ? "mp5-transport-button-active" : ""}`}
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
          className={`mp5-transport-button ${repeatMode !== "off" ? "mp5-transport-button-active" : ""}`}
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
          className="mp5-volume-slider h-7 min-w-0 flex-1"
          style={{
            backgroundImage: `linear-gradient(to right, var(--mp5-accent) 0%, var(--mp5-accent) ${volume * 100}%, rgba(148, 148, 152, 0.24) ${volume * 100}%, rgba(148, 148, 152, 0.24) 100%)`,
          }}
          data-testid="volume-slider"
          aria-label="Volume"
        />
        <span className="w-7 text-right font-mono text-[10px]">{Math.round(volume * 100)}</span>
      </label>
    </div>
  );
}
