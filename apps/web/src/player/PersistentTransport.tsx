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
import { Waveform } from "@phosphor-icons/react/Waveform";
import { CodecId, type Mp5File } from "@mp5/container";
import { useCoverObjectUrl } from "../hooks/useCoverObjectUrl";
import type { PlaylistTrack } from "../store/playerStore";
import { trackDisplayInfo } from "./playlistUtils";
import { codecLabel } from "../lib/codecDisplay";
import { formatTimelineRange } from "./playerDisplay";

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
  currentTime: number;
  duration: number;
  volume: number;
  onSeek: (time: number) => void;
  onVolume: (volume: number) => void;
  onQueue: () => void;
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
  currentTime,
  duration,
  volume,
  onSeek,
  onVolume,
  onQueue,
}: Props) {
  const coverUrl = useCoverObjectUrl(coverFromParsed(parsed));
  if (!track) return null;

  const info = trackDisplayInfo(track);
  const timeline = formatTimelineRange(currentTime, duration);

  return (
    <section className="mp5-persistent-transport" data-testid="persistent-transport" aria-label="Now playing controls">
      <div className="mp5-persistent-track">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="mp5-persistent-cover" />
        ) : (
          <span className="mp5-persistent-cover mp5-waveform-tile" aria-hidden>
            <Waveform size={28} weight="bold" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-100">{info.title}</p>
          <p className="mp5-persistent-artist truncate text-xs text-gray-500">{info.artist}</p>
          <p className="mp5-persistent-mobile-time">{timeline.current} / {timeline.duration}</p>
          <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
            {parsed?.head && (
              <span className="mp5-mini-badge">
                {codecLabel(parsed.head.codecId).replace(/\s*\(.+\)$/, "")}
              </span>
            )}
            {parsed?.head?.codecId === CodecId.MP5L && (
              <>
                <span className="mp5-quality-badge"><CheckCircle size={11} weight="bold" aria-hidden /> Lossless</span>
                <span className="mp5-quality-badge"><CheckCircle size={11} weight="bold" aria-hidden /> Bit-exact</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mp5-persistent-controls">
        <button type="button" onClick={onShuffle} aria-label="Toggle shuffle">
          <Shuffle size={18} />
        </button>
        <button type="button" onClick={onPrevious} disabled={!canPrevious} aria-label="Previous">
          <SkipBack size={20} weight="fill" />
        </button>
        <button type="button" className="mp5-persistent-play" onClick={onPlayPause} disabled={duration <= 0} aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Pause size={21} weight="fill" /> : <Play size={21} weight="fill" />}
        </button>
        <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next">
          <SkipForward size={20} weight="fill" />
        </button>
        <button type="button" onClick={onRepeat} aria-label="Cycle repeat mode">
          <Repeat size={18} />
        </button>
      </div>

      <div className="mp5-persistent-timeline">
        <span>{timeline.current}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Persistent seek"
          disabled={duration <= 0}
        />
        <span>{timeline.duration}</span>
      </div>

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
        <button type="button" className="mp5-persistent-queue mp5-persistent-collapse" onClick={onQueue} aria-label="Open queue details">
          <CaretUp size={17} weight="bold" />
        </button>
      </div>
    </section>
  );
}
