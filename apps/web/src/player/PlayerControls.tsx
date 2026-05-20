import type { RepeatMode } from "../store/playerStore";
import { repeatModeLabel } from "./queueNavigation";
import { formatDuration, formatPlaybackTime } from "./playlistUtils";

interface Props {
  isPlaying: boolean;
  onPlayPause: () => void;
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
  return (
    <div className="space-y-3">
      {!ready && (
        <p className="text-xs text-gray-500 text-center" data-testid="player-not-ready">
          Load an .mp5 file to enable playback
        </p>
      )}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.01}
        value={currentTime}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="w-full accent-accent"
        data-testid="seek-slider"
        aria-label="Seek"
        disabled={!ready}
      />
      <div className="flex items-center justify-between text-xs text-gray-500 font-mono">
        <span data-testid="current-time">{formatPlaybackTime(currentTime)}</span>
        <span data-testid="duration-time">{formatDuration(duration)}</span>
      </div>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onToggleShuffle}
          className={`px-2.5 py-1 rounded-full text-xs border ${
            shuffle
              ? "border-accent/50 bg-accent/20 text-accent"
              : "border-white/10 text-gray-500 hover:text-gray-300"
          }`}
          aria-pressed={shuffle}
          data-testid="player-shuffle"
        >
          Shuffle
        </button>
        <button
          type="button"
          onClick={onCycleRepeat}
          className={`px-2.5 py-1 rounded-full text-xs border ${
            repeatMode !== "off"
              ? "border-accent/50 bg-accent/20 text-accent"
              : "border-white/10 text-gray-500 hover:text-gray-300"
          }`}
          aria-label={repeatModeLabel(repeatMode)}
          data-testid="player-repeat"
          data-repeat-mode={repeatMode}
        >
          {repeatMode === "one" ? "Repeat 1" : repeatMode === "all" ? "Repeat all" : "Repeat off"}
        </button>
      </div>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous"
          data-testid="player-prev"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={onPlayPause}
          disabled={!ready}
          className="p-4 rounded-full bg-accent hover:bg-violet-500 text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="play-pause"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next"
          data-testid="player-next"
        >
          ⏭
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-500">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolume(Number(e.target.value))}
          className="flex-1 accent-accent"
          data-testid="volume-slider"
          aria-label="Volume"
        />
      </label>
    </div>
  );
}
