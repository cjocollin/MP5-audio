import type { RepeatMode } from "../store/playerStore";
import type { PlaybackReadiness } from "../lib/playback/playbackState";
import { repeatModeLabel } from "./queueNavigation";
import { formatTimelineRange, playbackStateLabel } from "./playerDisplay";

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
  const legacyStatusLabel = isPlaying
    ? playbackStatus === "preparing"
      ? playbackStatusDetail || "Preparing audio…"
      : "Playing"
    : playbackStatus === "preparing"
      ? playbackStatusDetail || "Preparing audio…"
      : playbackStatus === "paused" && ready
        ? "Ready to play"
        : playbackStatusDetail;
  void legacyStatusLabel;
  const timeline = formatTimelineRange(currentTime, duration);
  const statusLabel = playbackStateLabel({
    readiness: playbackReadiness,
    playState: playbackStatus ?? "stopped",
    detail: playbackStatusDetail,
    hasTrack,
    isEnded,
  });
  return (
    <div className="space-y-3" data-testid="player-controls">
      {!ready && (
        <p className="text-xs text-gray-500 text-center" data-testid="player-not-ready">
          Load an .mp5 file to enable playback
        </p>
      )}
      {statusLabel && (
        <p
          className="text-xs text-center text-gray-400"
          data-testid="player-playback-status"
          data-playback-status={playbackStatus ?? "stopped"}
        >
          {statusLabel}
        </p>
      )}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.01}
        value={currentTime}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="w-full h-8 accent-accent touch-pan-x disabled:opacity-40"
        data-testid="seek-slider"
        aria-label="Seek"
        disabled={!ready}
      />
      <div className="flex items-center justify-between gap-3 text-xs text-gray-500 font-mono">
        <span data-testid="current-time">{timeline.current}</span>
        <span className="text-gray-600" data-testid="remaining-time">{timeline.remaining}</span>
        <span data-testid="duration-time">{timeline.duration}</span>
      </div>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onToggleShuffle}
          className={`px-3 py-2 rounded-full text-xs border min-h-10 ${
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
          className={`px-3 py-2 rounded-full text-xs border min-h-10 ${
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
      <div className="flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className="min-h-12 min-w-12 p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border border-white/5"
          aria-label="Previous"
          data-testid="player-prev"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={onPlayPause}
          disabled={!ready}
          className="min-h-16 min-w-16 p-4 rounded-full bg-accent hover:bg-violet-500 text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="play-pause"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="min-h-12 min-w-12 p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border border-white/5"
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
          className="flex-1 h-8 accent-accent"
          data-testid="volume-slider"
          aria-label="Volume"
        />
      </label>
    </div>
  );
}
