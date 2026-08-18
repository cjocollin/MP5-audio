import { useState } from "react";
import { formatPlaybackTime } from "./playlistUtils";
import {
  resampleWaveformEnvelope,
  smoothWaveformEnvelope,
  waveformScaleReference,
} from "./waveformEnvelope";

export interface WaveformSectionMarker {
  startMs: number;
  endMs?: number;
  label?: string;
}

export interface WaveformHighlightMarker {
  startMs: number;
  endMs?: number;
}

export interface WaveformLoopRange {
  startSec: number;
  endSec: number;
}

interface Props {
  peaks: number[];
  progress: number;
  onSeek?: (ratio: number) => void;
  durationSec?: number;
  sectionMarkers?: WaveformSectionMarker[];
  highlightMarkers?: WaveformHighlightMarker[];
  activeLoopRange?: WaveformLoopRange | null;
  /** VISU accent for played bars when file theme is active. */
  playedFill?: string;
  unplayedFill?: string;
  disabled?: boolean;
}

const DISPLAY_BAR_COUNT = 112;
const BAR_WIDTH = 0.56;

/** Deterministic ghost peaks for the empty-state placeholder (not real audio). */
function placeholderPeaks(count = DISPLAY_BAR_COUNT): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const envelope = 0.35 + 0.55 * Math.sin(Math.PI * t);
    const detail =
      0.55 +
      0.25 * Math.sin(i * 0.37) +
      0.2 * Math.sin(i * 0.91 + 1.2);
    const hash = Math.sin((i + 3) * 12.9898) * 43758.5453;
    const jitter = 0.7 + (hash - Math.floor(hash)) * 0.3;
    return Math.max(0.08, envelope * detail * jitter);
  });
}

function WaveformPlaceholder() {
  const peaks = placeholderPeaks();
  const w = peaks.length;
  const peakMax = peaks.reduce((max, peak) => Math.max(max, peak), 0.001);

  return (
    <div
      className="mp5-waveform-shell mp5-waveform-placeholder"
      data-testid="waveform-empty"
      aria-label="Waveform preview unavailable"
    >
      <svg
        className="h-12 w-full sm:h-14"
        viewBox={`0 0 ${w} 32`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <line
          x1={0}
          x2={w}
          y1={16}
          y2={16}
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={0.6}
        />
        {peaks.map((p, i) => {
          const h = Math.max(2, (p / peakMax) * 20);
          return (
            <rect
              key={i}
              x={i + (1 - BAR_WIDTH) / 2}
              y={16 - h / 2}
              width={BAR_WIDTH}
              height={h}
              rx={BAR_WIDTH / 2}
              ry={1}
              fill="currentColor"
              fillOpacity={0.22}
            />
          );
        })}
      </svg>
      <span className="mp5-waveform-placeholder-label">Waveform preview</span>
    </div>
  );
}

export function WaveformView({
  peaks,
  progress,
  onSeek,
  durationSec = 0,
  sectionMarkers = [],
  highlightMarkers = [],
  activeLoopRange = null,
  playedFill,
  unplayedFill,
  disabled = false,
}: Props) {
  const [previewRatio, setPreviewRatio] = useState<number | null>(null);

  if (!peaks.length) {
    return <WaveformPlaceholder />;
  }

  const displayPeaks = smoothWaveformEnvelope(
    resampleWaveformEnvelope(peaks, DISPLAY_BAR_COUNT),
  );
  const w = displayPeaks.length;
  const scaleReference = waveformScaleReference(displayPeaks);
  const playheadX = Math.max(0.5, Math.min(w - 0.5, progress * w));
  const peakHeights = displayPeaks.map((peak) =>
    Math.max(2, Math.min(1, peak / scaleReference) * 24),
  );

  return (
    <div className="mp5-waveform-shell">
      <svg
        className={`h-12 w-full sm:h-14 ${disabled || !onSeek ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        data-testid="waveform"
        viewBox={`0 0 ${w} 32`}
        preserveAspectRatio="none"
        onPointerMove={(e) => {
          if (disabled || !onSeek) return;
          const rect = e.currentTarget.getBoundingClientRect();
          setPreviewRatio(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
        }}
        onPointerLeave={() => setPreviewRatio(null)}
        onClick={(e) => {
          if (!onSeek || disabled) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek((e.clientX - rect.left) / rect.width);
        }}
      >
      {activeLoopRange && durationSec > 0 && (
        <rect
          x={(activeLoopRange.startSec / durationSec) * w}
          y={0}
          width={Math.max(
            1,
            ((activeLoopRange.endSec - activeLoopRange.startSec) / durationSec) * w,
          )}
          height={32}
          fill="#f59e0b"
          fillOpacity={0.12}
          data-testid="waveform-loop-range"
        />
      )}
      {displayPeaks.map((_peak, i) => {
        const h = peakHeights[i]!;
        const played = (i + 0.5) / w <= progress;
        return (
          <rect
            key={i}
            x={i + (1 - BAR_WIDTH) / 2}
            y={16 - h / 2}
            width={BAR_WIDTH}
            height={h}
            rx={BAR_WIDTH / 2}
            ry={1}
            fill={played ? (playedFill ?? "var(--mp5-accent-bright)") : (unplayedFill ?? "var(--mp5-accent)")}
          />
        );
      })}
      <line
        x1={playheadX}
        x2={playheadX}
        y1={1}
        y2={31}
        stroke="#f8fafc"
        strokeWidth={1.2}
        strokeOpacity={0.96}
        vectorEffect="non-scaling-stroke"
        aria-hidden
      />
      <line
        x1={playheadX}
        x2={playheadX}
        y1={1.8}
        y2={1.8}
        stroke="#f8fafc"
        strokeWidth={3.6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        aria-hidden
      />
      {durationSec > 0 &&
        sectionMarkers.map((m, i) => {
          const x = (m.startMs / 1000 / durationSec) * w;
          if (x < 0 || x > w) return null;
          return (
            <line
              key={`sect-${i}-${m.startMs}`}
              x1={x}
              x2={x}
              y1={0}
              y2={32}
              stroke="#a78bfa"
              strokeWidth={0.5}
              strokeOpacity={0.6}
              vectorEffect="non-scaling-stroke"
              data-testid="waveform-section-marker"
            />
          );
        })}
      {durationSec > 0 &&
        highlightMarkers.map((m, i) => {
          const x0 = (m.startMs / 1000 / durationSec) * w;
          const x1 =
            m.endMs !== undefined
              ? (m.endMs / 1000 / durationSec) * w
              : x0 + 2;
          if (x0 < 0 || x0 > w) return null;
          return (
            <rect
              key={`hilt-${i}-${m.startMs}`}
              x={x0}
              y={28}
              width={Math.max(1, x1 - x0)}
              height={4}
              fill="#f59e0b"
              fillOpacity={0.7}
              data-testid="waveform-highlight-marker"
            />
          );
        })}
      </svg>
      {previewRatio != null && durationSec > 0 && !disabled && (
        <span
          className="pointer-events-none absolute top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-gray-200"
          style={{
            left: `${previewRatio * 100}%`,
            transform: "translateX(-50%)",
          }}
          data-testid="waveform-seek-preview"
        >
          {formatPlaybackTime(previewRatio * durationSec)}
        </span>
      )}
    </div>
  );
}
