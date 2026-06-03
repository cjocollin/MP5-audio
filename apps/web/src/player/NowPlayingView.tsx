import type { Mp5File } from "@mp5/container";
import { useCoverObjectUrl } from "../hooks/useCoverObjectUrl";
import { codecLabel } from "../lib/codecDisplay";
import type { Mp5hDecodeInfo } from "./decodeMp5";
import { hasContentNotice, trackDisplayInfo } from "./playlistUtils";
import type { PlaylistTrack } from "../store/playerStore";
import {
  resolveCoverCardStyle,
  type ResolvedPlayerTheme,
} from "../lib/visualTheme/applyVisualTheme";
import { TrackMetadata } from "./TrackMetadata";

interface Props {
  track?: PlaylistTrack;
  parsed?: Mp5File;
  loading: boolean;
  loadError: string;
  decodePath: string;
  mp5h?: Mp5hDecodeInfo;
  playerTheme?: ResolvedPlayerTheme | null;
}

function coverFromParsed(parsed?: Mp5File) {
  if (parsed?.coverArt?.data.length) return parsed.coverArt;
  if (parsed?.cover?.length) {
    return { mime: "image/jpeg", data: new Uint8Array(parsed.cover) };
  }
  return undefined;
}

export function NowPlayingView({
  track,
  parsed,
  loading,
  loadError,
  decodePath,
  mp5h,
  playerTheme,
}: Props) {
  const cover = coverFromParsed(parsed);
  const coverUrl = useCoverObjectUrl(cover);
  const info = track ? trackDisplayInfo(track) : null;
  const codec = parsed?.head != null ? codecLabel(parsed.head.codecId) : null;
  const showContentBadge = hasContentNotice(parsed);
  const moodTags = info?.moodTags ?? [];
  const vibeTags = info?.vibeTags ?? [];

  const cardClass = [
    "mp5-now-playing-cover-card aspect-square max-w-[11rem] sm:max-w-sm md:max-w-md mx-auto w-full rounded-2xl flex items-center justify-center",
    coverUrl ? "relative" : "",
    playerTheme ? "border" : "bg-surface-elevated shadow-xl",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="space-y-4"
      data-testid="now-playing"
      data-theme-active={playerTheme ? "true" : "false"}
    >
      <div
        className={cardClass}
        style={resolveCoverCardStyle(playerTheme, Boolean(coverUrl))}
        data-testid="now-playing-theme-card"
      >
        {coverUrl ? (
          <>
            <img
              src={coverUrl}
              alt="Cover"
              className="absolute inset-0 z-0 w-full h-full object-cover object-center max-w-full max-h-full"
              data-testid="now-playing-cover"
            />
            {playerTheme && (
              <div
                className="absolute inset-0 z-[1]"
                style={playerTheme.coverOverlayStyle}
                data-testid="now-playing-cover-overlay"
                aria-hidden
              />
            )}
          </>
        ) : (
          <span className="text-7xl opacity-30" data-testid="now-playing-cover-placeholder">
            ♪
          </span>
        )}
      </div>

      <div className="space-y-2 text-center md:text-left">
        <h1
          className="text-2xl md:text-3xl font-bold truncate"
          style={playerTheme?.titleStyle}
          data-testid="now-playing-title"
        >
          {info?.title ?? "No track selected"}
        </h1>
        <p className="text-gray-400 text-lg truncate" data-testid="now-playing-artist">
          {info?.artist || (track ? "Unknown artist" : "Drop MP5 files to build a playlist")}
        </p>
        {info?.album && (
          <p className="text-gray-500 text-sm truncate" data-testid="now-playing-album">
            {info.album}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
          {codec && (
            <span
              className={
                playerTheme
                  ? "px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                  : "px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/15 text-accent border border-accent/30"
              }
              style={playerTheme?.badgeStyle}
              data-testid="now-playing-codec-badge"
            >
              {codec}
            </span>
          )}
          {playerTheme?.themeName && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-medium border"
              style={playerTheme.badgeStyle}
              data-testid="now-playing-theme-badge"
            >
              {playerTheme.themeName}
            </span>
          )}
          {playerTheme?.moodLabel && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-medium text-gray-400 border border-white/10"
              data-testid="now-playing-mood-badge"
            >
              {playerTheme.moodLabel}
            </span>
          )}
          {showContentBadge && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-800 text-gray-300 border border-gray-700"
              data-testid="now-playing-content-badge"
            >
              Content guidance
            </span>
          )}
        </div>
        {(moodTags.length > 0 || vibeTags.length > 0) && (
          <div className="flex flex-wrap gap-1 justify-center md:justify-start pt-1" data-testid="now-playing-mood-vibe">
            {moodTags.map((tag) => (
              <span
                key={`m-${tag}`}
                className="px-2 py-0.5 rounded-full text-[10px] bg-violet-950/50 text-violet-200 border border-violet-800/40"
              >
                {tag}
              </span>
            ))}
            {vibeTags.map((tag) => (
              <span
                key={`v-${tag}`}
                className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800/80 text-slate-300 border border-slate-700/50"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <p className="text-sm text-accent text-center md:text-left" data-testid="player-loading">
          Decoding…
        </p>
      )}
      {loadError && (
        <p
          className="text-sm text-red-400 bg-red-950/40 rounded-lg p-2"
          data-testid="player-load-error"
        >
          {track?.parseError ? "This file could not be loaded." : loadError}
        </p>
      )}

      <TrackMetadata
        parsed={parsed}
        title={track?.name}
        decodePath={decodePath}
        mp5h={mp5h}
        fileBytes={track?.file?.size}
        hideTrackTitles
      />
    </div>
  );
}
