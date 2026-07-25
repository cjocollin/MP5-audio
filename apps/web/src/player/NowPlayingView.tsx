import type { IntegrityCheckResult, Mp5File } from "@mp5/container";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { useCoverObjectUrl } from "../hooks/useCoverObjectUrl";
import type { AlbumPlaybackContext } from "../lib/album/albumPlaybackContext";
import {
  resolveCoverCardStyle,
  type ResolvedPlayerTheme,
  visuFallbackLabel,
} from "../lib/visualTheme/applyVisualTheme";
import type { PlaylistTrack } from "../store/playerStore";
import { buildNowPlayingSummary } from "./playerDisplay";
import { hasContentNotice, trackDisplayInfo } from "./playlistUtils";
import { NowPlayingClock } from "./SeekTimeline";

interface Props {
  track?: PlaylistTrack;
  parsed?: Mp5File;
  loading: boolean;
  loadError: string;
  playerTheme?: ResolvedPlayerTheme | null;
  albumContext?: AlbumPlaybackContext | null;
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

function sampleRateLabel(sampleRate?: number) {
  if (!sampleRate) return "—";
  return sampleRate % 1000 === 0 ? `${sampleRate / 1000} kHz` : `${(sampleRate / 1000).toFixed(1)} kHz`;
}

function channelsLabel(channels?: number) {
  if (!channels) return "—";
  if (channels === 1) return "1 (mono)";
  if (channels === 2) return "2 (stereo)";
  return `${channels} channels`;
}

export function NowPlayingView({
  track,
  parsed,
  loading,
  loadError,
  playerTheme,
  albumContext,
  duration,
  embeddedHydrating = false,
  integrity,
  canPlaySimilar = false,
  onPlaySimilar,
}: Props) {
  const coverUrl = useCoverObjectUrl(coverFromParsed(parsed));
  const info = track ? trackDisplayInfo(track) : null;
  const summary = buildNowPlayingSummary({
    track,
    parsed,
    albumContext,
    currentTimeSec: 0,
    durationSec: duration,
    loading,
    embeddedHydrating,
    integrity,
  });
  const head = parsed?.head;
  const moodTags = info?.moodTags ?? [];
  const vibeTags = info?.vibeTags ?? [];
  const codecBadgeLabel = summary.codecLabel?.replace(/\s*\(.+\)$/, "") ?? null;
  const showCodecAsPrimaryBadge = summary.sourceLabel === ".mp5" && codecBadgeLabel;
  const primaryBadgeLabel = showCodecAsPrimaryBadge ? codecBadgeLabel : summary.sourceLabel;
  const isLossless = /lossless/i.test(summary.codecLabel ?? "");
  const isBitExact = isLossless || /bit[- ]exact/i.test(summary.integrityLabel ?? "");
  const technicalSummary = [
    head?.sampleRate ? sampleRateLabel(head.sampleRate) : null,
    head?.channels ? `${head.channels} ${head.channels === 1 ? "channel" : "channels"}` : null,
    head?.bitsPerSample ? `${head.bitsPerSample}-bit` : null,
    summary.durationLabel,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      data-testid="now-playing"
      data-theme-active={playerTheme ? "true" : "false"}
    >
      <div className="mp5-track-identity">
        <div
          className="mp5-track-cover mp5-now-playing-cover-card"
          style={resolveCoverCardStyle(playerTheme, Boolean(coverUrl))}
          data-testid="now-playing-theme-card"
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={`${summary.title} cover`}
              className="absolute inset-0 z-0 h-full w-full object-cover"
              data-testid="now-playing-cover"
            />
          ) : (
            <div
              className="mp5-now-playing-cover-placeholder"
              data-testid="now-playing-cover-placeholder"
              aria-hidden
            >
              <img
                src="/brand/mp5-brand-icon.svg"
                alt=""
                className="mp5-now-playing-cover-mark"
                decoding="async"
              />
            </div>
          )}
          {playerTheme && coverUrl && (
            <div
              className="absolute inset-0 z-[1]"
              style={playerTheme.coverOverlayStyle}
              data-testid="now-playing-cover-overlay"
              aria-hidden
            />
          )}
        </div>

        <div className="mp5-track-details">
          <h1
            className="text-2xl font-bold tracking-[-0.03em] text-white"
            style={playerTheme?.titleStyle}
            data-testid="now-playing-title"
          >
            {summary.title}
          </h1>
          <p className="truncate text-base text-gray-400" data-testid="now-playing-artist">
            {summary.artist}
          </p>
          {summary.album && !albumContext && (
            <p className="truncate text-sm text-gray-500" data-testid="now-playing-album">
              {summary.album}
            </p>
          )}

          {albumContext && (
            <div className="space-y-1" data-testid="now-playing-album-context">
              <p className="truncate text-sm text-gray-500" data-testid="now-playing-package-title">
                {albumContext.packageTitle}
              </p>
              {albumContext.packageArtist && (
                <p className="truncate text-xs text-gray-500" data-testid="now-playing-package-artist">
                  {albumContext.packageArtist}
                </p>
              )}
              <p className="text-xs text-gray-600" data-testid="now-playing-album-position">
                {summary.trackPositionLabel}
              </p>
            </div>
          )}

          <div className="mp5-now-playing-badges flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 pt-1" data-testid="now-playing-badges">
            <span className="mp5-mini-badge" data-testid="now-playing-source-badge">
              <span aria-hidden>{primaryBadgeLabel}</span>
              {showCodecAsPrimaryBadge && <span className="sr-only">{summary.sourceLabel}</span>}
            </span>
            {codecBadgeLabel && !showCodecAsPrimaryBadge && (
              <span
                className="mp5-mini-badge"
                style={playerTheme?.badgeStyle}
                data-testid="now-playing-codec-badge"
              >
                {codecBadgeLabel}
              </span>
            )}
            {isLossless && (
              <span className="mp5-quality-badge">
                <CheckCircle size={12} weight="bold" aria-hidden /> Lossless
              </span>
            )}
            {isBitExact && (
              <span className="mp5-quality-badge" data-testid="now-playing-integrity-badge">
                <CheckCircle size={12} weight="bold" aria-hidden /> Bit-exact
              </span>
            )}
            {playerTheme?.themeName ? (
              <span className="mp5-mini-badge" style={playerTheme.badgeStyle} data-testid="now-playing-theme-badge">
                {playerTheme.themeName}
              </span>
            ) : (
              <span className="sr-only" data-testid="now-playing-visu-fallback">
                {visuFallbackLabel(playerTheme)}
              </span>
            )}
            {albumContext && (
              <span className="mp5-album-badge" data-testid="now-playing-package-badge">
                {summary.sourceLabel}
              </span>
            )}
            {hasContentNotice(parsed) && (
              <span className="mp5-album-badge" data-testid="now-playing-content-badge">
                Content guidance
              </span>
            )}
          </div>

          {(moodTags.length > 0 || vibeTags.length > 0) && (
            <div className="flex flex-wrap gap-1 pt-1" data-testid="now-playing-mood-vibe">
              {[...moodTags, ...vibeTags].map((tag, index) => (
                <span key={`${tag}-${index}`} className="mp5-album-badge">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {canPlaySimilar && onPlaySimilar && (
            <button
              type="button"
              onClick={onPlaySimilar}
              className="mp5-btn-secondary mt-1 min-h-9 px-3 py-1 text-xs"
              data-testid="play-similar-mood-button"
            >
              Play similar mood
            </button>
          )}

          <p className="mp5-track-technical-summary">{technicalSummary}</p>
        </div>

        <dl className="mp5-track-facts" data-testid="now-playing-time-strip">
          <dt>Codec</dt>
          <dd>{codecBadgeLabel ?? "—"}</dd>
          <dt>Mode</dt>
          <dd>{!track ? "—" : isLossless ? "Lossless" : "Standard"}</dd>
          <dt>Integrity</dt>
          <dd className={track && isBitExact ? "text-cyan-300" : undefined}>
            {!track
              ? "—"
              : isBitExact ? (
                <span className="mp5-integrity-value">
                  <CheckCircle size={12} weight="bold" aria-hidden /> Bit-exact
                </span>
              ) : (
                "Not verified"
              )}
          </dd>
          <dt>Duration</dt>
          <dd data-testid="now-playing-duration">{summary.durationLabel}</dd>
          <dt>Channels</dt>
          <dd>{channelsLabel(head?.channels)}</dd>
          <dt>Sample rate</dt>
          <dd>{sampleRateLabel(head?.sampleRate)}</dd>
          <dt>Bit depth</dt>
          <dd>{head?.bitsPerSample ? `${head.bitsPerSample}-bit` : "—"}</dd>
          <NowPlayingClock duration={duration} />
        </dl>
      </div>

      {summary.loadingLabel && (
        <p className="mx-5 mb-4 text-sm text-violet-300" data-testid="player-loading">
          {summary.loadingLabel}
        </p>
      )}
      {loadError && (
        <p className="mx-5 mb-4 rounded-lg bg-red-950/40 p-2 text-sm text-red-400" data-testid="player-load-error">
          {track?.parseError ? "This file could not be loaded." : loadError}
        </p>
      )}
    </div>
  );
}
