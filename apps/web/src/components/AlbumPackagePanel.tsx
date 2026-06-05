import { useEffect, useRef, useState } from "react";
import type { ResolvedAlbumPackage } from "../lib/album/resolveAlbum";
import { formatDuration } from "../player/playlistUtils";
import { albumTrackBasename, type AlbmCoverEmbedded } from "@mp5/container";
import {
  CreditsSection,
  RightsSection,
  IdentifiersSection,
} from "../lib/creditsRights/CreditsRightsDisplay";
import {
  formatPackageBytes,
  integrityStatusLabel,
  largeEmbeddedWarning,
  LIBRARY_STORAGE_NOTE,
  MANIFEST_SIDECAR_NOTE,
  packageTypeBadgeLabel,
  summarizeAlbumIntegrity,
} from "../lib/album/albumPackageUi";
import { badgesForAlbumTrack } from "../lib/album/albumTrackBadges";

function msToSec(ms: number | null): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return ms / 1000;
}

function albumCoverUrl(manifest: ResolvedAlbumPackage["manifest"]): string | undefined {
  const cover = manifest.album.cover;
  if (!cover || cover.type !== "embedded") return undefined;
  const emb = cover as AlbmCoverEmbedded;
  try {
    const binary = atob(emb.dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: emb.mime });
    return URL.createObjectURL(blob);
  } catch {
    return undefined;
  }
}

interface Props {
  album: ResolvedAlbumPackage;
  onPlayAlbum: () => void;
  onAddToQueue: () => void;
  onDismiss: () => void;
  onSelectTrack: (index: number) => void;
  onPlayTrack?: (index: number) => void;
  onAddTrackToQueue?: (index: number) => void;
  onAddSidecarFiles?: (files: FileList) => void;
  onSaveAlbum?: () => void;
  onExtractTrack?: (index: number) => void;
  onExtractAll?: () => void;
  saveBusy?: boolean;
  embeddedLoading?: boolean;
  currentTrackId?: string | null;
}

export function AlbumPackagePanel({
  album,
  onPlayAlbum,
  onAddToQueue,
  onDismiss,
  onSelectTrack,
  onPlayTrack,
  onAddTrackToQueue,
  onAddSidecarFiles,
  onSaveAlbum,
  onExtractTrack,
  onExtractAll,
  saveBusy,
  embeddedLoading,
  currentTrackId,
}: Props) {
  const { manifest, tracks, missingCount, resolvedCount, manifestName, packageKind, packageFileSize } =
    album;
  const isEmbedded = packageKind === "embedded";
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    const url = albumCoverUrl(manifest);
    setCoverUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [manifest]);
  const sidecarInputRef = useRef<HTMLInputElement>(null);
  const artist = manifest.album.albumArtist ?? manifest.album.artist;
  const metaLine = [manifest.album.year, manifest.album.genre].filter(Boolean).join(" · ");
  const integrity = summarizeAlbumIntegrity(album);
  const sizeWarning = isEmbedded ? largeEmbeddedWarning(packageFileSize) : null;

  return (
    <div
      className="mp5-card p-3 sm:p-4 space-y-4 mp5-album-package"
      data-testid="album-package-panel"
    >
      <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
        <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl bg-surface-elevated overflow-hidden flex items-center justify-center mx-auto sm:mx-0">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="w-full h-full object-cover"
              data-testid="album-package-cover"
            />
          ) : (
            <span className="text-3xl sm:text-4xl opacity-30">♪</span>
          )}
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
          <span
            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-950/60 text-violet-200 border border-violet-800/40"
            data-testid="album-package-type"
          >
            {isEmbedded ? "Embedded" : "Manifest"}
          </span>
          <h2 className="text-lg sm:text-xl font-bold text-white truncate" data-testid="album-package-title">
            {manifest.album.title}
          </h2>
          {artist && (
            <p className="text-gray-400 truncate text-sm" data-testid="album-package-artist">
              {artist}
            </p>
          )}
          {metaLine && (
            <p className="text-xs text-gray-500" data-testid="album-package-meta">
              {metaLine}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs max-w-md mx-auto sm:mx-0">
            <dt className="text-gray-600">Tracks</dt>
            <dd data-testid="album-track-count">{tracks.length}</dd>
            {packageFileSize != null && (
              <>
                <dt className="text-gray-600">Size</dt>
                <dd data-testid="album-package-size">{formatPackageBytes(packageFileSize)}</dd>
              </>
            )}
            <dt className="text-gray-600">Available</dt>
            <dd data-testid="album-resolved-count">
              {isEmbedded
                ? `${tracks.length} embedded`
                : `${resolvedCount} found${missingCount > 0 ? ` · ${missingCount} missing` : ""}`}
            </dd>
            {album.totalDurationMs != null && (
              <>
                <dt className="text-gray-600">Duration</dt>
                <dd data-testid="album-total-duration">
                  {formatDuration(msToSec(album.totalDurationMs))}
                </dd>
              </>
            )}
          </dl>
          <p className="text-[10px] text-gray-500" data-testid="album-integrity-status">
            {integrityStatusLabel(integrity)}
          </p>
          {manifestName && (
            <p className="text-[10px] text-gray-600 font-mono truncate" data-testid="album-manifest-name">
              {manifestName}
            </p>
          )}
        </div>
      </div>

      <div
        className="rounded-lg border border-violet-900/30 bg-violet-950/20 px-3 py-2 text-xs text-gray-300 leading-relaxed"
        data-testid="album-import-explainer"
      >
        {isEmbedded ? (
          <p>
            <strong className="text-violet-200 font-medium">Embedded album package</strong> — self-contained
            album; tracks load on demand when you play or select them.
          </p>
        ) : (
          <p>
            <strong className="text-violet-200 font-medium">Manifest album package</strong> —{" "}
            {MANIFEST_SIDECAR_NOTE}
          </p>
        )}
      </div>

      {sizeWarning && (
        <p className="text-xs text-amber-200/90 bg-amber-950/25 rounded-lg px-3 py-2" data-testid="album-size-warning">
          {sizeWarning}
        </p>
      )}

      {embeddedLoading && (
        <p className="text-xs text-accent/90 bg-accent/5 rounded-lg px-3 py-2" data-testid="album-embedded-loading">
          Loading embedded track…
        </p>
      )}

      {!isEmbedded && album.foundFiles.length > 0 && (
        <div className="text-xs" data-testid="album-found-files">
          <p className="text-gray-500 font-medium mb-1">Found sidecar tracks</p>
          <p className="text-gray-400">{album.foundFiles.length} matched .mp5 file(s)</p>
        </div>
      )}

      {!isEmbedded && missingCount > 0 && (
        <div className="space-y-2" data-testid="album-missing-section">
          <p className="text-xs text-amber-200/90" data-testid="album-missing-tracks-note">
            {missingCount} sidecar .mp5 file{missingCount === 1 ? "" : "s"} not found — drop them
            below or add matching files to the playlist.
          </p>
          <ul
            className="font-mono text-xs text-amber-200/70 space-y-0.5 max-h-20 overflow-y-auto"
            data-testid="album-missing-files"
          >
            {album.missingFiles.map((f) => (
              <li key={f} className="truncate">
                {albumTrackBasename(f)}
              </li>
            ))}
          </ul>
          {onAddSidecarFiles && (
            <>
              <input
                ref={sidecarInputRef}
                type="file"
                accept=".mp5,audio/mp5"
                multiple
                className="hidden"
                data-testid="album-add-sidecar-input"
                onChange={(e) => {
                  if (e.target.files?.length) onAddSidecarFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="mp5-btn-secondary text-xs min-h-9"
                onClick={() => sidecarInputRef.current?.click()}
                data-testid="album-add-sidecar-btn"
              >
                Add missing .mp5 files
              </button>
            </>
          )}
        </div>
      )}

      {album.warnings.length > 0 && (
        <ul className="text-xs text-gray-400 space-y-0.5 list-disc pl-4" data-testid="album-warnings">
          {album.warnings.map((w) => (
            <li key={`${w.path}-${w.message}`}>
              {w.path}: {w.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 mp5-album-actions">
        <button
          type="button"
          className="mp5-btn-primary text-sm min-h-10 px-4"
          onClick={onPlayAlbum}
          disabled={embeddedLoading || (isEmbedded ? tracks.length === 0 : resolvedCount === 0)}
          data-testid="album-play-all"
        >
          Play album
        </button>
        <button
          type="button"
          className="mp5-btn-secondary text-sm min-h-10 px-3"
          onClick={onAddToQueue}
          disabled={embeddedLoading || (isEmbedded ? tracks.length === 0 : resolvedCount === 0)}
          data-testid="album-add-to-queue"
        >
          Add to queue
        </button>
        {onSaveAlbum && (
          <button
            type="button"
            className="mp5-btn-secondary text-sm min-h-10 px-3"
            onClick={onSaveAlbum}
            disabled={saveBusy || embeddedLoading}
            data-testid="album-save-to-library"
          >
            {saveBusy ? "Saving…" : "Save to library"}
          </button>
        )}
        {isEmbedded && onExtractAll && (
          <button
            type="button"
            className="mp5-btn-secondary text-sm min-h-10 px-3"
            onClick={onExtractAll}
            disabled={embeddedLoading}
            data-testid="album-extract-all"
          >
            Extract all tracks
          </button>
        )}
        <button
          type="button"
          className="mp5-btn-secondary text-sm min-h-10 px-3"
          onClick={onDismiss}
          data-testid="album-dismiss"
        >
          Dismiss
        </button>
      </div>

      {onSaveAlbum && (
        <p className="text-[10px] text-gray-500 leading-relaxed" data-testid="album-save-storage-note">
          {isEmbedded
            ? `Saving stores the full .mp5p in this browser (~${packageFileSize != null ? formatPackageBytes(packageFileSize) : "unknown size"}). ${LIBRARY_STORAGE_NOTE}`
            : `Saving stores the manifest JSON locally. Sidecar .mp5 files are not copied. ${LIBRARY_STORAGE_NOTE}`}
        </p>
      )}

      <div>
        <button
          type="button"
          className="text-xs text-gray-500 hover:text-gray-300 mb-2"
          onClick={() => setDetailsOpen((o) => !o)}
          data-testid="album-details-toggle"
        >
          {detailsOpen ? "Hide album details" : "Album details"}
        </button>
        {detailsOpen && (
          <div
            className="rounded-lg border border-white/5 bg-surface/30 p-3 text-xs space-y-2"
            data-testid="album-details-panel"
          >
            <p>
              <span className="text-gray-500">Format:</span>{" "}
              <span data-testid="album-package-format">{manifest.format}</span> v{manifest.version}
            </p>
            <p className="text-gray-500 leading-relaxed">
              {isEmbedded
                ? "Embedded packages contain complete .mp5 tracks. No sidecar files required."
                : "Manifest packages reference external .mp5 files by filename."}
            </p>
            <p className="text-gray-600 italic">
              Credits and rights metadata are informational only — no DRM or legal verification.
            </p>
            {(manifest.credits || manifest.crdt || manifest.licn || manifest.iden) && (
              <div className="space-y-2 pt-2 border-t border-white/5" data-testid="album-package-credits-block">
                {manifest.crdt && (
                  <div data-testid="album-package-credits">
                    <CreditsSection crdt={manifest.crdt} testId="album-credits-section" />
                  </div>
                )}
                {manifest.licn && (
                  <div data-testid="album-package-rights">
                    <RightsSection licn={manifest.licn} testId="album-rights-section" />
                  </div>
                )}
                {manifest.iden && (
                  <div data-testid="album-package-identifiers">
                    <IdentifiersSection iden={manifest.iden} testId="album-identifiers-section" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <ol className="space-y-1.5 max-h-80 overflow-y-auto mp5-album-tracklist" data-testid="album-track-list">
        {tracks.map((t, index) => {
          const badges = badgesForAlbumTrack(t, isEmbedded);
          const isCurrent =
            currentTrackId != null &&
            (t.playlistTrack?.id === currentTrackId || t.ref.trackId === currentTrackId);
          return (
            <li
              key={t.ref.trackId}
              className={`rounded-lg border px-2 py-2 text-sm ${
                t.missing
                  ? "border-amber-900/40 bg-amber-950/20"
                  : isCurrent
                    ? "border-accent/40 bg-accent/10"
                    : "border-white/5 bg-surface/40"
              }`}
              data-testid="album-track-row"
              data-missing={t.missing ? "true" : "false"}
              data-current={isCurrent ? "true" : "false"}
            >
              <div className="flex flex-wrap items-start gap-2">
                <span
                  className="text-xs text-gray-500 font-mono w-7 shrink-0 pt-0.5"
                  data-testid="album-track-number"
                >
                  {t.trackNumber}
                </span>
                <div className="flex-1 min-w-[8rem]">
                  <button
                    type="button"
                    className="text-left w-full disabled:opacity-50"
                    disabled={t.missing}
                    onClick={() => onSelectTrack(index)}
                    data-testid="album-track-select"
                  >
                    <span className="block text-gray-100 truncate font-medium">{t.displayTitle}</span>
                    <span className="block text-xs text-gray-500 truncate">{t.displayArtist}</span>
                  </button>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {badges.codec && (
                      <span className="mp5-album-badge" data-testid="album-track-codec-badge">
                        {badges.codec}
                      </span>
                    )}
                    {badges.hasStems && (
                      <span className="mp5-album-badge" data-testid="album-track-stems-badge">
                        Stems
                      </span>
                    )}
                    {badges.hasLyrics && (
                      <span className="mp5-album-badge" data-testid="album-track-lyrics-badge">
                        Lyrics
                      </span>
                    )}
                    {badges.hasVisu && (
                      <span className="mp5-album-badge" data-testid="album-track-visu-badge">
                        VISU
                      </span>
                    )}
                    {badges.hasContentGuidance && (
                      <span className="mp5-album-badge" data-testid="album-track-guidance-badge">
                        Guidance
                      </span>
                    )}
                    <span
                      className={`mp5-album-badge ${
                        badges.availability === "missing-sidecar" ||
                        badges.availability === "integrity-warning"
                          ? "mp5-album-badge-warn"
                          : ""
                      }`}
                      data-testid="album-track-availability"
                    >
                      {badges.availabilityLabel}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-gray-500 font-mono shrink-0">
                  {formatDuration(msToSec(t.durationMs))}
                </span>
                {t.embeddedByteLength != null && (
                  <span className="text-[10px] text-gray-600 shrink-0" data-testid="album-track-embedded-size">
                    {formatPackageBytes(t.embeddedByteLength)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 ml-9">
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5 min-h-8"
                  disabled={t.missing || embeddedLoading}
                  onClick={() => (onPlayTrack ?? onSelectTrack)(index)}
                  data-testid="album-track-play"
                >
                  Play
                </button>
                {onAddTrackToQueue && (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5 min-h-8"
                    disabled={t.missing || embeddedLoading}
                    onClick={() => onAddTrackToQueue(index)}
                    data-testid="album-track-queue"
                  >
                    Queue
                  </button>
                )}
                {isEmbedded && onExtractTrack && (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border border-violet-800/40 text-violet-300 hover:bg-violet-950/30 min-h-8"
                    onClick={() => onExtractTrack(index)}
                    data-testid="album-track-extract"
                  >
                    Extract
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
