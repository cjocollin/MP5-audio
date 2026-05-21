import { useMemo, useState } from "react";
import { useCoverObjectUrl } from "../hooks/useCoverObjectUrl";
import { codecLabel } from "../lib/codecDisplay";
import type { PlaylistTrack, RepeatMode } from "../store/playerStore";
import { repeatModeLabel } from "./queueNavigation";
import { formatDuration, matchesSearch, trackDisplayInfo } from "./playlistUtils";
import type { Mp5File } from "@mp5/container";

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
}) {
  const info = trackDisplayInfo(track);
  const coverUrl = useCoverObjectUrl(coverFromParsed(track.parsed));
  const failed = !!track.parseError;

  return (
    <li
      className={`flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors ${
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
        <span className="relative w-10 h-10 shrink-0 rounded-md bg-surface-elevated overflow-hidden flex items-center justify-center">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm opacity-40">♪</span>
          )}
          {isPlayingNow && (
            <span
              className="absolute inset-0 flex items-center justify-center bg-black/50 text-accent text-xs"
              data-testid="playlist-item-now-playing"
            >
              ▶
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block text-sm text-gray-100 truncate" data-testid="playlist-item-title">
              {info.title}
            </span>
            {isCurrent && !isPlayingNow && (
              <span className="shrink-0 text-[10px] text-accent/90 font-medium">Selected</span>
            )}
          </span>
          <span className="block text-xs text-gray-500 truncate">
            {info.artist || "Unknown artist"}
            {info.album ? ` · ${info.album}` : ""}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {track.parsed?.head != null && (
              <span className="text-[10px] font-semibold text-accent/90">
                {codecLabel(track.parsed.head.codecId)}
              </span>
            )}
            <span className="text-[10px] text-gray-600 font-mono">{formatDuration(info.durationSec)}</span>
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
      {onSaveToLibrary && track.file && (
        <button
          type="button"
          className="shrink-0 px-2 py-1 rounded text-[10px] text-gray-400 hover:text-accent border border-white/10 disabled:opacity-30"
          onClick={onSaveToLibrary}
          disabled={saveBusy}
          data-testid="playlist-item-save-library"
        >
          Save
        </button>
      )}
      <button
        type="button"
        className="shrink-0 px-2 py-1.5 rounded text-xs text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-30 border border-white/10"
        onClick={onPlay}
        disabled={failed}
        aria-label={`Play ${info.title}`}
        data-testid="playlist-item-play"
      >
        Play
      </button>
      <button
        type="button"
        className="shrink-0 p-1.5 rounded text-gray-500 hover:text-red-300 hover:bg-white/10"
        onClick={onRemove}
        aria-label="Remove from queue"
        data-testid="playlist-item-remove"
      >
        ✕
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
}: Props) {
  const [search, setSearch] = useState("");

  const filteredIndices = useMemo(() => {
    return tracks
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => matchesSearch(t, search))
      .map(({ i }) => i);
  }, [tracks, search]);

  return (
    <section className="space-y-3" data-testid="library-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-300">Playlist</p>
        <div className="flex items-center gap-2">
          {tracks.length > 0 && onSaveToLibrary && tracks[currentIndex]?.file && (
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-accent disabled:opacity-40"
              onClick={() => onSaveToLibrary(tracks[currentIndex]!)}
              disabled={librarySaveBusy}
              data-testid="playlist-save-current-library"
            >
              Save current to library
            </button>
          )}
          {tracks.length > 0 && (
            <button
              type="button"
              className="text-xs text-gray-500 hover:text-red-300"
              onClick={onClear}
              data-testid="playlist-clear"
            >
              Clear queue
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onToggleShuffle}
          className={`px-2 py-1 rounded text-xs border ${
            shuffle ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-gray-500"
          }`}
          data-testid="library-shuffle"
        >
          Shuffle {shuffle ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={onCycleRepeat}
          className={`px-2 py-1 rounded text-xs border ${
            repeatMode !== "off" ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-gray-500"
          }`}
          data-testid="library-repeat"
          data-repeat-mode={repeatMode}
        >
          {repeatModeLabel(repeatMode)}
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search title, artist, album, genre, mood, vibe…"
        className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-gray-200 border border-white/5"
        data-testid="library-search"
        disabled={!tracks.length}
      />

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
          <p className="text-sm text-gray-500">No tracks yet — drop .mp5 or .mp5p files above.</p>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed">
            Search by title, artist, album, genre, or mood/vibe once tracks are loaded.
          </p>
        </div>
      ) : filteredIndices.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-6 text-center" data-testid="library-no-matches">
          No matching tracks.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-80 overflow-y-auto" data-testid="playlist-list">
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
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
