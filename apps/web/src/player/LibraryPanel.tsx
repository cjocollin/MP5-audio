import { useMemo, useState } from "react";
import { FloppyDisk } from "@phosphor-icons/react/FloppyDisk";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { Play } from "@phosphor-icons/react/Play";
import { Repeat } from "@phosphor-icons/react/Repeat";
import { Shuffle } from "@phosphor-icons/react/Shuffle";
import { Trash } from "@phosphor-icons/react/Trash";
import { X } from "@phosphor-icons/react/X";
import { Waveform } from "@phosphor-icons/react/Waveform";
import { useCoverObjectUrl } from "../hooks/useCoverObjectUrl";
import { codecLabel } from "../lib/codecDisplay";
import type { PlaylistTrack, RepeatMode } from "../store/playerStore";
import { repeatModeLabel } from "./queueNavigation";
import { matchesSearch, trackDisplayInfo } from "./playlistUtils";
import type { Mp5File } from "@mp5/container";
import type { ResolvedAlbumPackage } from "../lib/album/resolveAlbum";
import { albumPlaybackContext } from "../lib/album/albumPlaybackContext";
import { buildQueueRowSummary } from "./playerDisplay";

function coverFromParsed(parsed?: Mp5File) {
  if (parsed?.coverArt?.data.length) return parsed.coverArt;
  if (parsed?.cover?.length) {
    return { mime: "image/jpeg", data: new Uint8Array(parsed.cover) };
  }
  return undefined;
}

function PlaylistRow({
  track,
  index,
  isCurrent,
  isPlayingNow,
  onSelect,
  onPlay,
  onRemove,
  onSaveToLibrary,
  saveBusy,
  album,
  isHydrating,
}: {
  track: PlaylistTrack;
  index: number;
  isCurrent: boolean;
  isPlayingNow: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onRemove: () => void;
  onSaveToLibrary?: () => void;
  saveBusy?: boolean;
  album?: ResolvedAlbumPackage | null;
  isHydrating?: boolean;
}) {
  const albumContext = albumPlaybackContext(album ?? null, track);
  const info = trackDisplayInfo(track);
  const summary = buildQueueRowSummary({
    track,
    index,
    isCurrent,
    isPlayingNow,
    albumContext,
    isHydrating,
  });
  const coverUrl = useCoverObjectUrl(coverFromParsed(track.parsed));
  const failed = !!track.parseError;

  return (
    <li
      className={`mp5-queue-row ${
        isCurrent
          ? "border-accent/50 bg-accent/15 ring-1 ring-accent/20"
          : "border-white/5 bg-surface/40 hover:bg-white/5"
      } ${failed ? "border-red-900/30 bg-red-950/10" : ""}`}
      data-testid="playlist-item"
      data-playlist-index={index}
      data-current={isCurrent ? "true" : "false"}
      data-playing={isPlayingNow ? "true" : "false"}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-2 min-w-0 text-left"
        data-testid="playlist-item-select"
        aria-current={isCurrent ? "true" : undefined}
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-elevated">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
          ) : summary.metadataPending ? (
            <span className="animate-pulse text-gray-500" data-testid="playlist-item-cover-pending">
              <MusicNotes size={18} />
            </span>
          ) : (
            <span className="mp5-waveform-tile" aria-hidden>
              <Waveform size={22} weight="bold" />
            </span>
          )}
          {isPlayingNow && (
            <span
              className="absolute inset-0 flex items-center justify-center bg-black/50 text-accent text-xs"
              data-testid="playlist-item-now-playing"
            >
              <Play size={16} weight="fill" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block text-sm text-gray-100 truncate" data-testid="playlist-item-title">
              {summary.title}
            </span>
            {summary.statusLabel && (
              <span
                className="shrink-0 text-[10px] text-accent/90 font-medium"
                data-testid="playlist-item-status"
              >
                {summary.statusLabel}
              </span>
            )}
            <span className="mp5-queue-compact-duration font-mono text-[10px] text-gray-500">
              {summary.durationLabel}
            </span>
          </span>
          <span className="block text-xs text-gray-500 truncate">
            {summary.artist}
            {info.album ? ` · ${info.album}` : ""}
          </span>
          {summary.albumContextLabel && (
            <span
              className="block text-[10px] text-gray-600 truncate"
              data-testid="playlist-item-album-context"
            >
              {summary.albumContextLabel}
            </span>
          )}
          <span className="mp5-queue-technical mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className="text-[10px] px-1.5 py-0 rounded border border-white/10 text-gray-500"
              data-testid="playlist-item-source-badge"
            >
              {summary.sourceLabel}
            </span>
            {track.parsed?.head != null && (
              <span className="text-[10px] font-semibold text-accent/90">
                {codecLabel(track.parsed.head.codecId)}
              </span>
            )}
            <span className="text-[10px] text-gray-600 font-mono">{summary.durationLabel}</span>
            {info.hasContentNotice && (
              <span className="text-[10px] px-1.5 py-0 rounded bg-gray-800 text-gray-400 border border-gray-700">
                Content
              </span>
            )}
            {failed && (
              <span
                className="text-[10px] px-1.5 py-0 rounded bg-red-950/50 text-red-300 border border-red-900/40"
                data-testid="playlist-item-error"
                title={track.parseError}
              >
                Unreadable file
              </span>
            )}
          </span>
        </span>
      </button>
      <span className="mp5-queue-compact-more" aria-hidden>
        <DotsThreeVertical size={17} weight="bold" />
      </span>
      {onSaveToLibrary && track.file && (
        <button
          type="button"
          className="mp5-queue-action"
          onClick={onSaveToLibrary}
          disabled={saveBusy}
          data-testid="playlist-item-save-library"
        >
          <FloppyDisk size={15} />
        </button>
      )}
      <button
        type="button"
        className="mp5-queue-action"
        onClick={onPlay}
        disabled={failed}
        aria-label={`Play ${summary.title}`}
        data-testid="playlist-item-play"
      >
        <Play size={16} weight="fill" />
      </button>
      <button
        type="button"
        className="mp5-queue-action hover:text-red-300"
        onClick={onRemove}
        aria-label="Remove from queue"
        data-testid="playlist-item-remove"
      >
        <X size={16} />
      </button>
    </li>
  );
}

interface Props {
  tracks: PlaylistTrack[];
  currentIndex: number;
  isPlaying: boolean;
  dropErrors: { name: string; message: string }[];
  repeatMode: RepeatMode;
  shuffle: boolean;
  onSelect: (index: number) => void;
  onPlay: (index: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSaveToLibrary?: (track: PlaylistTrack) => void;
  librarySaveBusy?: boolean;
  album?: ResolvedAlbumPackage | null;
  hydratingTrackId?: string | null;
  compact?: boolean;
}

export function LibraryPanel({
  tracks,
  currentIndex,
  isPlaying,
  dropErrors,
  repeatMode,
  shuffle,
  onSelect,
  onPlay,
  onRemove,
  onClear,
  onToggleShuffle,
  onCycleRepeat,
  onSaveToLibrary,
  librarySaveBusy,
  album,
  hydratingTrackId,
  compact = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const filteredIndices = useMemo(() => {
    return tracks
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => matchesSearch(t, search))
      .map(({ i }) => i);
  }, [tracks, search]);

  return (
    <section
      className={`space-y-3 ${compact ? "mp5-library-compact" : ""}`}
      data-testid="library-panel"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="mp5-queue-header flex items-center justify-between gap-2">
        <div>
          <p className="mp5-eyebrow">Up next</p>
          <h2 className="text-sm font-semibold text-gray-200">
            Queue <span className="font-normal text-gray-600">· {tracks.length} {tracks.length === 1 ? "track" : "tracks"}</span>
          </h2>
        </div>
        <div className="mp5-queue-header-actions flex items-center gap-2">
          {tracks.length > 0 && onSaveToLibrary && tracks[currentIndex]?.file && (
            <button
              type="button"
              className="mp5-queue-action"
              onClick={() => onSaveToLibrary(tracks[currentIndex]!)}
              disabled={librarySaveBusy}
              data-testid="playlist-save-current-library"
              aria-label="Save current track to library"
            >
              <FloppyDisk size={16} />
            </button>
          )}
          {tracks.length > 0 && (
            <button
              type="button"
              className="mp5-queue-action hover:text-red-300"
              onClick={onClear}
              data-testid="playlist-clear"
              aria-label="Clear queue"
            >
              <Trash size={16} />
            </button>
          )}
          {compact && (
            <button
              type="button"
              className="mp5-queue-collapse mp5-focus-ring"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Expand queue" : "Collapse queue"}
              aria-expanded={!collapsed}
            >
              <CaretDown size={15} weight="bold" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="mp5-queue-toggles flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onToggleShuffle}
          className={`mp5-queue-toggle ${
            shuffle ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-gray-500"
          }`}
          data-testid="library-shuffle"
        >
          <Shuffle size={15} /> Shuffle {shuffle ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={onCycleRepeat}
          className={`mp5-queue-toggle ${
            repeatMode !== "off" ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-gray-500"
          }`}
          data-testid="library-repeat"
          data-repeat-mode={repeatMode}
        >
          <Repeat size={15} /> {repeatModeLabel(repeatMode)}
        </button>
      </div>

      {tracks.length > 1 && (
        <label className="relative block">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search queue…"
            className="w-full rounded-lg border border-white/5 bg-surface py-2 pl-9 pr-3 text-sm text-gray-200"
            data-testid="library-search"
          />
        </label>
      )}

      {dropErrors.length > 0 && (
        <ul className="text-xs text-amber-200/80 space-y-1" data-testid="drop-errors">
          {dropErrors.map((e) => (
            <li key={e.name}>
              <span className="text-gray-500">{e.name}:</span> {e.message}
            </li>
          ))}
        </ul>
      )}

      {!tracks.length ? (
        <div className="py-4 px-2 text-center sm:text-left" data-testid="library-empty">
          <p className="text-sm text-gray-500">No tracks yet — drop or open an .mp5 or .mp5p file below.</p>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed">
            Search by title, artist, album, genre, or mood/vibe once tracks are loaded.
          </p>
        </div>
      ) : filteredIndices.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-6 text-center" data-testid="library-no-matches">
          No matching tracks.
        </p>
      ) : (
        <ul
          className="space-y-1.5 max-h-[min(40vh,16rem)] sm:max-h-80 overflow-y-auto overscroll-contain"
          data-testid="playlist-list"
        >
          {filteredIndices.map((index) => {
            const track = tracks[index]!;
            return (
              <PlaylistRow
                key={track.id}
                track={track}
                index={index}
                isCurrent={index === currentIndex}
                isPlayingNow={index === currentIndex && isPlaying}
                onSelect={() => onSelect(index)}
                onPlay={() => onPlay(index)}
                onRemove={() => onRemove(track.id)}
                onSaveToLibrary={
                  onSaveToLibrary && track.file ? () => onSaveToLibrary(track) : undefined
                }
                saveBusy={librarySaveBusy}
                album={album}
                isHydrating={hydratingTrackId === track.id}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
