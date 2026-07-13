import type { Mp5File } from "@mp5/container";
import { useCoverObjectUrl } from "../hooks/useCoverObjectUrl";
import type { Mp5hDecodeInfo } from "./decodeMp5";
import { hasContentNotice, trackDisplayInfo } from "./playlistUtils";
import type { PlaylistTrack } from "../store/playerStore";
import {
  resolveCoverCardStyle,
  type ResolvedPlayerTheme,
  visuFallbackLabel,
} from "../lib/visualTheme/applyVisualTheme";
import { TrackMetadata } from "./TrackMetadata";
import type { AlbumPlaybackContext } from "../lib/album/albumPlaybackContext";
import type { IntegrityCheckResult } from "@mp5/container";
import { buildNowPlayingSummary } from "./playerDisplay";

interface Props {
  track?: PlaylistTrack;
  parsed?: Mp5File;
  loading: boolean;
  loadError: string;
  decodePath: string;
  mp5h?: Mp5hDecodeInfo;
  playerTheme?: ResolvedPlayerTheme | null;
  albumContext?: AlbumPlaybackContext | null;
  currentTime: number;
  duration: number;
  embeddedHydrating?: boolean;
  integrity?: IntegrityCheckResult | null;
  canPlaySimilar?: boolean;
  onPlaySimilar?: () => void;
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
  albumContext,
  currentTime,
  duration,
  embeddedHydrating = false,
  integrity,
  canPlaySimilar = false,
  onPlaySimilar,
}: Props) {
  const cover = coverFromParsed(parsed);
  const coverUrl = useCoverObjectUrl(cover);
  const info = track ? trackDisplayInfo(track) : null;
  const summary = buildNowPlayingSummary({
    track,
    parsed,
    albumContext,
    currentTimeSec: currentTime,
    durationSec: duration,
    loading,
    embeddedHydrating,
    integrity,
  });
  const codec = summary.codecLabel;
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
          {summary.title}
        </h1>
        <p className="text-gray-400 text-lg truncate" data-testid="now-playing-artist">
          {summary.artist}
        </p>
        {summary.album && !albumContext && (
          <p className="text-gray-500 text-sm truncate" data-testid="now-playing-album">
            {summary.album}
          </p>
        )}
        {albumContext && (
          <div className="space-y-1" data-testid="now-playing-album-context">
            <p className="text-gray-500 text-sm truncate" data-testid="now-playing-package-title">
              {albumContext.packageTitle}
            </p>
            {albumContext.packageArtist && (
              <p className="text-xs text-gray-500 truncate" data-testid="now-playing-package-artist">
                {albumContext.packageArtist}
              </p>
            )}
            <p className="text-xs text-gray-600" data-testid="now-playing-album-position">
              {summary.trackPositionLabel}
            </p>
            <span
              className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-950/50 text-violet-200 border border-violet-800/30"
              data-testid="now-playing-package-badge"
            >
              {summary.sourceLabel}
            </span>
          </div>
        )}
        <div
          className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1"
          data-testid="now-playing-badges"
        >
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-gray-300 border border-white/10"
            data-testid="now-playing-source-badge"
          >
            {summary.sourceLabel}
          </span>
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
          {!playerTheme && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-white/10 text-gray-500"
              data-testid="now-playing-visu-fallback"
            >
              {visuFallbackLabel(playerTheme)}
            </span>
          )}
          {summary.integrityLabel && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-emerald-500/30 text-emerald-200/80 bg-emerald-950/20"
              data-testid="now-playing-integrity-badge"
            >
              {summary.integrityLabel}
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
        {canPlaySimilar && onPlaySimilar && (
          <button
            type="button"
            onClick={onPlaySimilar}
            className="text-[10px] px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-gray-300 mt-1"
            data-testid="play-similar-mood-button"
          >
            Play similar mood
          </button>
        )}
      </div>

      <div
        className="grid grid-cols-3 gap-2 rounded-xl border border-white/5 bg-surface/40 px-3 py-2 text-center"
        data-testid="now-playing-time-strip"
      >
        <div>
          <p className="text-[10px] uppercase text-gray-600">Now</p>
          <p className="text-xs font-mono text-gray-300" data-testid="now-playing-current-time">
            {summary.currentTimeLabel}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-600">Duration</p>
          <p className="text-xs font-mono text-gray-300" data-testid="now-playing-duration">
            {summary.durationLabel}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-600">Left</p>
          <p className="text-xs font-mono text-gray-300" data-testid="now-playing-remaining">
            {summary.remainingLabel}
          </p>
        </div>
      </div>

      {summary.loadingLabel && (
        <p className="text-sm text-accent text-center md:text-left" data-testid="player-loading">
          {summary.loadingLabel}
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
