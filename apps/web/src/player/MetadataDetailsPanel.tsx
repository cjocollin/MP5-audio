import type { ReactNode } from "react";
import type { Mp5File } from "@mp5/container";
import { CodecId } from "@mp5/container";
import {
  decodeLyrc,
  decodeMood,
  decodeVibe,
  getMetaValue,
  parseOptionalMetadata,
  recordFromMetaFields,
} from "@mp5/container";
import { codecLabel } from "../lib/codecDisplay";
import { ContentWarningsPanel } from "./ContentWarningsPanel";

interface Props {
  parsed?: Mp5File;
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-gray-500 italic">{children}</p>;
}

export function MetadataDetailsPanel({ parsed }: Props) {
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
    chunks = { lyrc: null, expl: null, safe: null, recv: null, sens: null, mood: null, vibe: null };
  }
  const lyrc = chunks.lyrc ?? decodeLyrc(optional.get("LYRC"));
  const mood = chunks.mood ?? decodeMood(optional.get("MOOD"));
  const vibe = chunks.vibe ?? decodeVibe(optional.get("VIBE"));

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
          <p className="text-xs text-gray-300">
            Synced lyrics ({lyrc.synced.length} lines)
            {lyrc.source ? ` · ${lyrc.source}` : ""}
          </p>
        ) : (
          <EmptyNote>No lyrics available</EmptyNote>
        )}
      </div>

      <ContentWarningsPanel optional={optional} />

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

      {parsed.head && (
        <div className="rounded-xl bg-surface-elevated p-4 text-sm space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Format</p>
          <p className="text-xs text-gray-300">{codecLabel(parsed.head.codecId)}</p>
          <p className="text-xs text-gray-500">
            {parsed.head.sampleRate} Hz · {parsed.head.channels} ch · {parsed.head.bitsPerSample}-bit
            {parsed.head.codecId === CodecId.MP5L ? " · bit-exact" : ""}
          </p>
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
