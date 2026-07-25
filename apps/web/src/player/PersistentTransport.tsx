import { ListBullets } from "@phosphor-icons/react/ListBullets";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { Pause } from "@phosphor-icons/react/Pause";
import { Play } from "@phosphor-icons/react/Play";
import { Repeat } from "@phosphor-icons/react/Repeat";
import { Shuffle } from "@phosphor-icons/react/Shuffle";
import { SkipBack } from "@phosphor-icons/react/SkipBack";
import { SkipForward } from "@phosphor-icons/react/SkipForward";
import { SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { CodecId, type Mp5File } from "@mp5/container";
import { SignalMarkSprite } from "../components/SignalMarkSprite";
import { useCoverObjectUrl } from "../hooks/useCoverObjectUrl";
import type { PlaylistTrack } from "../store/playerStore";
import { usePlayerStore } from "../store/playerStore";
import { trackDisplayInfo } from "./playlistUtils";
import { codecLabel } from "../lib/codecDisplay";
import { formatTimelineRange } from "./playerDisplay";
import { SeekTimeline } from "./SeekTimeline";

function coverFromParsed(parsed?: Mp5File) {
  if (parsed?.coverArt?.data.length) return parsed.coverArt;
  if (parsed?.cover?.length) {
    return { mime: "image/jpeg", data: new Uint8Array(parsed.cover) };
  }
  return undefined;
}

interface Props {
  track?: PlaylistTrack;
  parsed?: Mp5File;
  isPlaying: boolean;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onShuffle: () => void;
  onRepeat: () => void;
  canPrevious: boolean;
  canNext: boolean;
  duration: number;
  volume: number;
  onSeek: (time: number) => void;
  onVolume: (volume: number) => void;
  onQueue: () => void;
  loading?: boolean;
}

export function PersistentTransport({
  track,
  parsed,
  isPlaying,
  onPlayPause,
  onPrevious,
  onNext,
  onShuffle,
  onRepeat,
  canPrevious,
  canNext,
  duration,
  volume,
  onSeek,
  onVolume,
  onQueue,
  loading = false,
}: Props) {
  const coverUrl = useCoverObjectUrl(coverFromParsed(parsed));
  const hasTrack = !!track;
  const info = track ? trackDisplayInfo(track) : null;
  // Mobile time label — isolated currentTime subscription.
  const currentTime = usePlayerStore((s) => s.currentTime);
  const timeline = formatTimelineRange(currentTime, duration);
  const playbackReady = hasTrack && duration > 0 && !loading;

  return (
    <section
      className="mp5-persistent-transport"
      data-testid="persistent-transport"
      data-empty={hasTrack ? "false" : "true"}
      aria-label="Now playing controls"
    >
      <div className="mp5-persistent-track">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="mp5-persistent-cover" />
        ) : (
          <SignalMarkSprite
            playing={hasTrack && isPlaying}
            size="md"
            className="mp5-persistent-cover"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-100">
            {info?.title ?? "Nothing playing"}
          </p>
          <p className="mp5-persistent-artist truncate text-xs text-gray-500">
            {info?.artist ?? "Open a file or load a demo from Settings"}
          </p>
          <p className="mp5-persistent-mobile-time">
            {timeline.current} / {timeline.duration}
          </p>
          {hasTrack && (
            <div
              className="mp5-persistent-badges hidden min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto sm:flex"
              data-testid="persistent-transport-badges"
            >
              {parsed?.head && (
                <span className="mp5-mini-badge">
                  {codecLabel(parsed.head.codecId, parsed.audioFrames[0]?.data).replace(
                    /\s*\(.+\)$/,
                    "",
                  )}
                </span>
              )}
              {parsed?.head?.codecId === CodecId.MP5L && (
                <>
                  <span className="mp5-quality-badge">
                    <CheckCircle size={11} weight="bold" aria-hidden /> Lossless
                  </span>
                  <span className="mp5-quality-badge">
                    <CheckCircle size={11} weight="bold" aria-hidden /> Bit-exact
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mp5-persistent-controls">
        <button
          type="button"
          className="mp5-persistent-shuffle"
          onClick={onShuffle}
          disabled={!hasTrack}
          aria-label="Toggle shuffle"
        >
          <Shuffle size={18} />
        </button>
        <button
          type="button"
          className="mp5-persistent-prev"
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label="Previous"
        >
          <SkipBack size={20} weight="fill" />
        </button>
        <button
          type="button"
          className="mp5-persistent-play"
          onClick={onPlayPause}
          disabled={!playbackReady}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={21} weight="fill" /> : <Play size={21} weight="fill" />}
        </button>
        <button
          type="button"
          className="mp5-persistent-next"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next"
        >
          <SkipForward size={20} weight="fill" />
        </button>
        <button
          type="button"
          className="mp5-persistent-repeat"
          onClick={onRepeat}
          disabled={!hasTrack}
          aria-label="Cycle repeat mode"
        >
          <Repeat size={18} />
        </button>
      </div>

      <SeekTimeline
        duration={duration}
        onSeek={onSeek}
        disabled={!playbackReady}
        layout="inline"
        className="mp5-persistent-seek-input"
        testId="persistent-seek"
        ariaLabel="Persistent seek"
        showLabels={false}
      />

      <label className="mp5-persistent-volume">
        <SpeakerHigh size={18} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => onVolume(Number(event.target.value))}
          className="mp5-volume-slider"
          style={{
            backgroundImage: `linear-gradient(to right, var(--mp5-accent) 0%, var(--mp5-accent) ${volume * 100}%, rgba(148, 148, 152, 0.24) ${volume * 100}%, rgba(148, 148, 152, 0.24) 100%)`,
          }}
          aria-label="Persistent volume"
        />
      </label>

      <div className="mp5-persistent-queue-group">
        <button type="button" className="mp5-persistent-queue" onClick={onQueue} aria-label="Open queue">
          <ListBullets size={22} weight="bold" />
        </button>
        <button
          type="button"
          className="mp5-persistent-queue mp5-persistent-collapse"
          onClick={onQueue}
          aria-label="Open queue details"
        >
          <CaretUp size={17} weight="bold" />
        </button>
      </div>
    </section>
  );
}
