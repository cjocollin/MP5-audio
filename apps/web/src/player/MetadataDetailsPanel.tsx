import type { ReactNode } from "react";
import type { Mp5File } from "@mp5/container";
import { CodecId } from "@mp5/container";
import {
  decodeLyrc,
  decodeMood,
  decodeStemManifest,
  decodeVibe,
  getMetaValue,
  parseOptionalMetadata,
  recordFromMetaFields,
  sectTypeLabel,
  stemTypeLabel,
} from "@mp5/container";
import { codecLabel } from "../lib/codecDisplay";
import { ContentWarningsPanel } from "./ContentWarningsPanel";
import {
  CreditsSection,
  RightsSection,
  IdentifiersSection,
} from "../lib/creditsRights/CreditsRightsDisplay";
import { IntegrityDetailsPanel } from "../lib/fingerprint/IntegrityDetailsPanel";
import type { IntegrityCheckResult } from "@mp5/container";
import { assessMp5Compatibility } from "@mp5/container";
import type { ResolvedPlayerTheme } from "../lib/visualTheme/applyVisualTheme";
import type { ThemeApplicationStatus } from "../lib/visualTheme/themeApplication";

interface Props {
  parsed?: Mp5File;
  integrity?: IntegrityCheckResult | null;
  useFileThemes?: boolean;
  themeStatus?: ThemeApplicationStatus;
  playerTheme?: ResolvedPlayerTheme | null;
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-gray-500 italic">{children}</p>;
}

export function MetadataDetailsPanel({
  parsed,
  integrity,
  useFileThemes = true,
  themeStatus,
  playerTheme,
}: Props) {
  if (!parsed) {
    return (
      <div className="rounded-xl bg-surface-elevated p-4 text-sm" data-testid="metadata-details-panel">
        <EmptyNote>Load an .mp5 file to view metadata.</EmptyNote>
      </div>
    );
  }

  const meta = recordFromMetaFields(parsed.meta);
  const optional = parsed.optional ?? new Map();
  let chunks;
  try {
    chunks = parseOptionalMetadata(optional);
  } catch {
    chunks = {
      lyrc: null,
      expl: null,
      safe: null,
      recv: null,
      sens: null,
      mood: null,
      vibe: null,
      stems: null,
      sect: null,
      hook: null,
      hilt: null,
      visu: null,
      crdt: null,
      licn: null,
      iden: null,
    };
  }
  const lyrc = chunks.lyrc ?? decodeLyrc(optional.get("LYRC"));
  const mood = chunks.mood ?? decodeMood(optional.get("MOOD"));
  const vibe = chunks.vibe ?? decodeVibe(optional.get("VIBE"));
  const stemManifest = chunks.stems ?? decodeStemManifest(optional.get("STEM"));

  const cover = parsed.coverArt;
  const coverMime = cover?.mime ?? getMetaValue(parsed.meta, "cover_mime");
  const coverSize = cover?.data.length ?? Number(getMetaValue(parsed.meta, "cover_size") ?? 0);

  const wavePeak = getMetaValue(parsed.meta, "waveform_peak");
  const waveRms = getMetaValue(parsed.meta, "waveform_rms");
  const hasWave = parsed.waveform.length > 0;

  return (
    <div className="space-y-3" data-testid="metadata-details-panel">
      <div className="rounded-xl bg-surface-elevated p-4 space-y-2 text-sm">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Track info</p>
        <p className="text-lg font-semibold text-white">{meta.title ?? "Unknown title"}</p>
        <p className="text-gray-400">{meta.artist ?? "Unknown artist"}</p>
        {meta.album && <p className="text-gray-500 text-xs">{meta.album}</p>}
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs pt-2">
          {meta.genre && (
            <>
              <dt className="text-gray-500">Genre</dt>
              <dd>{meta.genre}</dd>
            </>
          )}
          {(meta.year || meta.date) && (
            <>
              <dt className="text-gray-500">Year</dt>
              <dd>{meta.year ?? meta.date}</dd>
            </>
          )}
          {meta.tracknumber && (
            <>
              <dt className="text-gray-500">Track</dt>
              <dd>{meta.tracknumber}</dd>
            </>
          )}
          {meta.composer && (
            <>
              <dt className="text-gray-500">Composer</dt>
              <dd>{meta.composer}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="rounded-xl bg-surface-elevated p-4 text-sm space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Cover art</p>
        {cover?.data.length ? (
          <p className="text-xs text-gray-400">
            {coverMime} · {Math.round(coverSize / 1024)} KB
          </p>
        ) : (
          <EmptyNote>No cover art embedded</EmptyNote>
        )}
      </div>

      <div className="rounded-xl bg-surface-elevated p-4 text-sm space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Lyrics</p>
        {lyrc?.unsynced ? (
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">
            {lyrc.unsynced}
          </pre>
        ) : lyrc?.synced?.length ? (
          <>
            <p className="text-xs text-gray-300">
              Synced lyrics ({lyrc.synced.length} lines)
              {lyrc.source ? ` · ${lyrc.source}` : ""}
            </p>
            {lyrc.synced.some((l) => l.section) && (
              <p className="text-[10px] text-gray-500">
                Sections:{" "}
                {[...new Set(lyrc.synced.map((l) => l.section).filter(Boolean))].join(", ")}
              </p>
            )}
          </>
        ) : (
          <EmptyNote>No lyrics available</EmptyNote>
        )}
      </div>

      <ContentWarningsPanel optional={optional} />

      <div
        className="rounded-xl bg-surface-elevated p-4 text-sm space-y-2"
        data-testid="metadata-visual-theme-panel"
      >
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Visual theme (VISU)
        </p>
        {chunks.visu ? (
          <>
            {chunks.visu.themeName && (
              <p className="text-gray-200 font-medium">{chunks.visu.themeName}</p>
            )}
            {themeStatus && (
              <p className="text-[10px] text-gray-400 font-mono" data-testid="visu-theme-status">
                {themeStatus.label}
              </p>
            )}
            {!chunks.visu.primaryColor &&
              !chunks.visu.accentColor &&
              !chunks.visu.backgroundColor && (
                <p className="text-[10px] text-gray-500" data-testid="visu-no-custom-colors">
                  No custom hex colors in file — player uses{" "}
                  {useFileThemes ? "style preset" : "default app theme"} when themes are on.
                </p>
              )}
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              {chunks.visu.moodLabel && (
                <>
                  <dt className="text-gray-500">Mood</dt>
                  <dd>{chunks.visu.moodLabel}</dd>
                </>
              )}
              {chunks.visu.playerStyle && (
                <>
                  <dt className="text-gray-500">Style</dt>
                  <dd className="capitalize">{chunks.visu.playerStyle.replace(/_/g, " ")}</dd>
                </>
              )}
              {chunks.visu.visualIntensity && (
                <>
                  <dt className="text-gray-500">Intensity</dt>
                  <dd className="capitalize">{chunks.visu.visualIntensity}</dd>
                </>
              )}
              {chunks.visu.source && (
                <>
                  <dt className="text-gray-500">Source</dt>
                  <dd>{chunks.visu.source}</dd>
                </>
              )}
            </dl>
            <div className="flex flex-wrap gap-2 pt-1" data-testid="visu-color-swatches">
              {(
                playerTheme && useFileThemes
                  ? ([
                      ["Primary", playerTheme.primary],
                      ["Accent", playerTheme.accent],
                      ["Background", playerTheme.background],
                      ["Secondary", playerTheme.secondary],
                    ] as const)
                  : ([
                      ["Primary", chunks.visu.primaryColor],
                      ["Accent", chunks.visu.accentColor],
                      ["Background", chunks.visu.backgroundColor],
                      ["Secondary", chunks.visu.secondaryColor],
                    ] as const)
              )
                .filter(([, c]) => c)
                .map(([label, color]) => (
                  <span key={label} className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                    <span
                      className="w-4 h-4 rounded border border-white/20"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    {label}
                    {playerTheme && useFileThemes && themeStatus?.colorsDerived ? " (resolved)" : ""}
                  </span>
                ))}
            </div>
            <p className="text-[10px] text-gray-600">Display-only — does not affect audio.</p>
          </>
        ) : (
          <EmptyNote>No visual theme — optional VISU chunk</EmptyNote>
        )}
      </div>

      <IntegrityDetailsPanel integrity={integrity ?? null} />

      <div
        className="rounded-xl bg-surface-elevated p-4 text-sm space-y-2"
        data-testid="metadata-credits-panel"
      >
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Credits</p>
        {chunks.crdt ? (
          <CreditsSection crdt={chunks.crdt} />
        ) : (
          <EmptyNote>No detailed credits — optional CRDT chunk</EmptyNote>
        )}
      </div>

      <div
        className="rounded-xl bg-surface-elevated p-4 text-sm space-y-2"
        data-testid="metadata-rights-panel"
      >
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Rights & license
        </p>
        {chunks.licn ? (
          <RightsSection licn={chunks.licn} />
        ) : (
          <EmptyNote>No rights metadata — optional LICN chunk</EmptyNote>
        )}
      </div>

      <div
        className="rounded-xl bg-surface-elevated p-4 text-sm space-y-2"
        data-testid="metadata-identifiers-panel"
      >
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Release identifiers
        </p>
        {chunks.iden ? (
          <IdentifiersSection iden={chunks.iden} />
        ) : (
          <EmptyNote>No release identifiers — optional IDEN chunk</EmptyNote>
        )}
      </div>

      <div className="rounded-xl bg-surface-elevated p-4 text-sm space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Mood & vibe
        </p>
        {mood?.tags?.length || vibe?.tags?.length ? (
          <div className="flex flex-wrap gap-1">
            {mood?.tags?.map((t) => (
              <span
                key={`m-${t}`}
                className="px-2 py-0.5 rounded-full bg-violet-900/40 text-violet-200 text-xs"
              >
                {t}
              </span>
            ))}
            {vibe?.tags?.map((t) => (
              <span
                key={`v-${t}`}
                className="px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-200 text-xs"
              >
                {t}
              </span>
            ))}
          </div>
        ) : (
          <EmptyNote>No mood or vibe tags</EmptyNote>
        )}
        {(mood?.source || vibe?.source) && (
          <p className="text-[10px] text-gray-600">
            Source: {mood?.source ?? vibe?.source} — display only, not verified
          </p>
        )}
      </div>

      <div
        className="rounded-xl bg-surface-elevated p-4 text-sm space-y-1"
        data-testid="metadata-sections-panel"
      >
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Song sections</p>
        {chunks.sect?.sections.length ? (
          <>
            <p className="text-xs text-gray-300">
              {chunks.sect.sections.length} section(s)
              {chunks.hook ? " · HOOK embedded" : ""}
              {chunks.hilt?.highlights.length
                ? ` · ${chunks.hilt.highlights.length} highlight(s)`
                : ""}
            </p>
            <p className="text-xs text-gray-500">
              {chunks.sect.sections.map((s) => sectTypeLabel(s.type)).join(", ")}
            </p>
          </>
        ) : (
          <EmptyNote>No song sections — optional manual map</EmptyNote>
        )}
      </div>

      <div className="rounded-xl bg-surface-elevated p-4 text-sm space-y-1" data-testid="metadata-stems-section">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Stems</p>
        {stemManifest?.stems.length ? (
          <>
            <p className="text-xs text-gray-300">
              {stemManifest.stems.length} optional stem(s) · full mix in AUDI
            </p>
            <p className="text-xs text-gray-500">
              Types:{" "}
              {stemManifest.stems.map((s) => stemTypeLabel(s.stemType)).join(", ")}
            </p>
            <p className="text-[10px] text-gray-600">
              All stems optional for playback — normal players use AUDI only.
            </p>
          </>
        ) : (
          <EmptyNote>No optional stems — full mix only</EmptyNote>
        )}
      </div>

      {parsed.head && (
        <div
          className="rounded-xl bg-surface-elevated p-4 text-sm space-y-1"
          data-testid="format-compatibility-panel"
        >
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Format</p>
          <p className="text-xs text-gray-300">{codecLabel(parsed.head.codecId)}</p>
          <p className="text-xs text-gray-500">
            {parsed.head.sampleRate} Hz · {parsed.head.channels} ch · {parsed.head.bitsPerSample}-bit
            {parsed.head.codecId === CodecId.MP5L ? " · bit-exact" : ""}
          </p>
          {(() => {
            const compat = assessMp5Compatibility(parsed);
            const optionalCount = compat.optionalKnown.length + compat.optionalUnknown.length;
            return (
              <div className="mt-2 pt-2 border-t border-white/5 space-y-0.5" data-testid="compatibility-summary">
                <p className="text-xs text-gray-400">
                  Compatibility:{" "}
                  <span
                    className={
                      compat.compatibilityLevel === "error"
                        ? "text-red-300/90"
                        : compat.compatibilityLevel === "warning"
                          ? "text-amber-200/90"
                          : "text-emerald-300/80"
                    }
                  >
                    {compat.compatibilityLevel}
                  </span>
                  {" · "}
                  {compat.requiredPresent.length}/{compat.requiredPresent.length + compat.requiredMissing.length} required
                  {optionalCount > 0 ? ` · ${optionalCount} optional` : ""}
                  {compat.optionalUnknown.length > 0
                    ? ` · ${compat.optionalUnknown.length} unknown`
                    : ""}
                </p>
                {compat.integrityStatus !== "missing" && (
                  <p className="text-[10px] text-gray-600">Integrity: {compat.integrityStatus}</p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <div className="rounded-xl bg-surface-elevated p-4 text-sm space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Waveform</p>
        {hasWave ? (
          <p className="text-xs text-gray-400">
            {parsed.waveform.length} preview points
            {wavePeak ? ` · peak ${wavePeak}` : ""}
            {waveRms ? ` · RMS ${waveRms}` : ""}
          </p>
        ) : (
          <EmptyNote>No waveform preview — playback still works</EmptyNote>
        )}
      </div>
    </div>
  );
}
