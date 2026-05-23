import { useEffect, useRef, useState } from "react";
import type { ResolvedAlbumPackage } from "../lib/album/resolveAlbum";
import { formatDuration } from "../player/playlistUtils";
import { albumTrackBasename, type AlbmCoverEmbedded } from "@mp5/container";
import {
  CreditsSection,
  RightsSection,
  IdentifiersSection,
} from "../lib/creditsRights/CreditsRightsDisplay";

function msToSec(ms: number | null): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return ms / 1000;
}

function sidecarStatusLabel(status: ResolvedAlbumPackage["tracks"][0]["sidecarStatus"]): string | null {
  switch (status) {
    case "found-verified":
      return "Verified";
    case "found-mismatch":
      return "Hash mismatch";
    case "found-no-hash":
      return "No hash";
    default:
      return null;
  }
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
  onAddSidecarFiles?: (files: FileList) => void;
  onSaveAlbum?: () => void;
  onExtractTrack?: (index: number) => void;
  saveBusy?: boolean;
}

export function AlbumPackagePanel({
  album,
  onPlayAlbum,
  onAddToQueue,
  onDismiss,
  onSelectTrack,
  onAddSidecarFiles,
  onSaveAlbum,
  onExtractTrack,
  saveBusy,
}: Props) {
  const { manifest, tracks, missingCount, resolvedCount, manifestName, packageKind, packageFileSize } =
    album;
  const isEmbedded = packageKind === "embedded";
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  useEffect(() => {
    const url = albumCoverUrl(manifest);
    setCoverUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [manifest]);
  const sidecarInputRef = useRef<HTMLInputElement>(null);
  const artist = manifest.album.albumArtist ?? manifest.album.artist;
  const metaLine = [
    manifest.album.year,
    manifest.album.releaseDate,
    manifest.album.genre,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mp5-card p-4 space-y-4" data-testid="album-package-panel">
      <div
        className="rounded-lg border border-violet-900/30 bg-violet-950/20 px-3 py-2 text-xs text-gray-300 leading-relaxed"
        data-testid="album-import-explainer"
      >
        <p>
          {isEmbedded ? (
            <>
              <strong className="text-violet-200 font-medium">Embedded album package</strong> — a
              self-contained <span className="font-mono">.mp5p</span> with complete{" "}
              <span className="font-mono">.mp5</span> tracks inside. Tracks load on demand when you
              play or select them.
            </>
          ) : (
            <>
              <strong className="text-violet-200 font-medium">Manifest album package</strong> — a JSON
              package that lists sidecar <span className="font-mono">.mp5</span> tracks. Keep the
              manifest and .mp5 files together in the same folder.
            </>
          )}
        </p>
        {manifestName && (
          <p className="mt-1 text-gray-500 font-mono truncate" data-testid="album-manifest-name">
            {manifestName}
          </p>
        )}
      </div>

      <div className="flex gap-4 flex-col sm:flex-row sm:items-start">
        <div className="w-28 h-28 shrink-0 rounded-xl bg-surface-elevated overflow-hidden flex items-center justify-center mx-auto sm:mx-0">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="w-full h-full object-cover"
              data-testid="album-package-cover"
            />
          ) : (
            <span className="text-4xl opacity-30">♪</span>
          )}
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            {isEmbedded ? "Embedded album package" : "Album package"}
          </p>
          <h2 className="text-xl font-bold text-white truncate" data-testid="album-package-title">
            {manifest.album.title}
          </h2>
          {artist && (
            <p className="text-gray-400 truncate" data-testid="album-package-artist">
              {artist}
            </p>
          )}
          {metaLine && (
            <p className="text-xs text-gray-600 mt-1" data-testid="album-package-meta">
              {metaLine}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-2 max-w-sm">
            <dt className="text-gray-600">Package type</dt>
            <dd data-testid="album-package-type">{isEmbedded ? "Embedded" : "Manifest"}</dd>
            {packageFileSize != null && (
              <>
                <dt className="text-gray-600">Package size</dt>
                <dd data-testid="album-package-size">
                  {(packageFileSize / (1024 * 1024)).toFixed(2)} MiB
                </dd>
              </>
            )}
            <dt className="text-gray-600">Tracks</dt>
            <dd data-testid="album-track-count">{tracks.length}</dd>
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
        </div>
      </div>

      {(manifest.credits || manifest.crdt || manifest.licn || manifest.iden) && (
        <div className="space-y-3 text-sm" data-testid="album-package-credits-block">
          {manifest.credits && (
            <div>
              <p className="text-[10px] text-gray-500 font-medium mb-1">Album credits (text)</p>
              <p className="text-xs text-gray-400 whitespace-pre-wrap">{manifest.credits}</p>
            </div>
          )}
          {manifest.crdt && (
            <div data-testid="album-package-credits">
              <p className="text-[10px] text-gray-500 font-medium mb-1">Album credits</p>
              <CreditsSection crdt={manifest.crdt} testId="album-credits-section" />
            </div>
          )}
          {manifest.licn && (
            <div data-testid="album-package-rights">
              <p className="text-[10px] text-gray-500 font-medium mb-1">Album rights</p>
              <RightsSection licn={manifest.licn} testId="album-rights-section" />
            </div>
          )}
          {manifest.iden && (
            <div data-testid="album-package-identifiers">
              <p className="text-[10px] text-gray-500 font-medium mb-1">Album identifiers</p>
              <IdentifiersSection iden={manifest.iden} testId="album-identifiers-section" />
            </div>
          )}
          <p className="text-[10px] text-gray-600 italic">
            Track-level credits in each .mp5 file remain independent.
          </p>
        </div>
      )}

      {!isEmbedded && album.foundFiles.length > 0 && (
        <div className="text-xs" data-testid="album-found-files">
          <p className="text-gray-500 font-medium mb-1">Found sidecar tracks</p>
          <ul className="font-mono text-gray-400 space-y-0.5 max-h-20 overflow-y-auto">
            {album.foundFiles.map((f) => (
              <li key={f} className="truncate">
                ✓ {albumTrackBasename(f)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isEmbedded && missingCount > 0 && (
        <div className="space-y-2" data-testid="album-missing-section">
          <p className="text-xs text-amber-200/90" data-testid="album-missing-tracks-note">
            Missing {missingCount} sidecar .mp5 file{missingCount === 1 ? "" : "s"} — drop them below
            or add to the playlist (filenames must match the manifest).
          </p>
          <ul className="font-mono text-xs text-amber-200/70 space-y-0.5 max-h-20 overflow-y-auto" data-testid="album-missing-files">
            {album.missingFiles.map((f) => (
              <li key={f} className="truncate">
                ✗ {albumTrackBasename(f)}
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
                className="mp5-btn-secondary text-xs"
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
        <ul className="text-[10px] text-gray-500 space-y-0.5" data-testid="album-warnings">
          {album.warnings.map((w) => (
            <li key={`${w.path}-${w.message}`}>
              {w.path}: {w.message}
            </li>
          ))}
        </ul>
      )}

      {manifest.credits && (
        <p className="text-xs text-gray-500 whitespace-pre-wrap border-t border-white/5 pt-3">
          {manifest.credits}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="mp5-btn-primary text-sm"
          onClick={onPlayAlbum}
          disabled={isEmbedded ? tracks.length === 0 : resolvedCount === 0}
          data-testid="album-play-all"
        >
          Play album
        </button>
        <button
          type="button"
          className="mp5-btn-secondary text-sm"
          onClick={onAddToQueue}
          disabled={isEmbedded ? tracks.length === 0 : resolvedCount === 0}
          data-testid="album-add-to-queue"
        >
          Add album to queue
        </button>
        {onSaveAlbum && (
          <button
            type="button"
            className="mp5-btn-secondary text-sm"
            onClick={onSaveAlbum}
            disabled={saveBusy}
            data-testid="album-save-to-library"
          >
            {saveBusy ? "Saving…" : "Save album"}
          </button>
        )}
        <button
          type="button"
          className="mp5-btn-secondary text-sm"
          onClick={onDismiss}
          data-testid="album-dismiss"
        >
          Dismiss
        </button>
      </div>

      <ol className="space-y-1 max-h-64 overflow-y-auto" data-testid="album-track-list">
        {tracks.map((t, index) => (
          <li
            key={t.ref.trackId}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
              t.missing
                ? "border-amber-900/40 bg-amber-950/20"
                : "border-white/5 bg-surface/40 hover:bg-white/5"
            }`}
            data-testid="album-track-row"
            data-missing={t.missing ? "true" : "false"}
          >
            <span className="text-[10px] text-gray-600 font-mono w-8 shrink-0">
              {t.discNumber > 1 ? `${t.discNumber}-` : ""}
              {t.trackNumber}
            </span>
            <button
              type="button"
              className="flex-1 min-w-0 text-left disabled:opacity-50"
              disabled={t.missing}
              onClick={() => onSelectTrack(index)}
              data-testid="album-track-select"
            >
              <span className="block text-gray-100 truncate">{t.displayTitle}</span>
              <span className="block text-xs text-gray-500 truncate">
                {t.displayArtist}
                <span className="font-mono text-gray-600"> · {albumTrackBasename(t.ref.file)}</span>
                {t.embeddedByteLength != null && (
                  <span className="text-gray-600" data-testid="album-track-embedded-size">
                    {" "}
                    · {(t.embeddedByteLength / (1024 * 1024)).toFixed(2)} MiB
                    {t.embeddedFragmentCount != null && t.embeddedFragmentCount > 1
                      ? ` · ${t.embeddedFragmentCount} frags`
                      : ""}
                  </span>
                )}
              </span>
            </button>
            <span className="text-[10px] text-gray-600 font-mono shrink-0">
              {formatDuration(msToSec(t.durationMs))}
            </span>
            {isEmbedded && onExtractTrack && (
              <button
                type="button"
                className="text-[10px] text-violet-300 shrink-0 hover:underline"
                onClick={() => onExtractTrack(index)}
                data-testid="album-track-extract"
              >
                Extract .mp5
              </button>
            )}
            {t.missing && (
              <span className="text-[10px] text-amber-300 shrink-0" data-testid="album-track-missing">
                Missing
              </span>
            )}
            {!t.missing && t.sidecarStatus && t.sidecarStatus !== "missing" && (
              <span
                className={`text-[10px] shrink-0 ${
                  t.sidecarStatus === "found-verified"
                    ? "text-green-400/80"
                    : t.sidecarStatus === "found-mismatch"
                      ? "text-amber-300/90"
                      : "text-gray-500"
                }`}
                data-testid="album-track-sidecar-status"
              >
                {sidecarStatusLabel(t.sidecarStatus)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
