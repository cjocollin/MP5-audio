import { useState } from "react";
import { formatPlaybackTime } from "./playlistUtils";

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

function densifyPeaks(peaks: number[], targetLength = 192) {
  if (peaks.length >= targetLength || peaks.length < 2) return peaks;
  return Array.from({ length: targetLength }, (_, index) => {
    const position = (index / (targetLength - 1)) * (peaks.length - 1);
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(peaks.length - 1, leftIndex + 1);
    const mix = position - leftIndex;
    return peaks[leftIndex]! * (1 - mix) + peaks[rightIndex]! * mix;
  });
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
    return (
      <div
        className="mp5-waveform-shell flex h-12 items-center justify-center text-xs text-gray-600 sm:h-14"
        data-testid="waveform-empty"
      >
        Waveform preview unavailable
      </div>
    );
  }

  const displayPeaks = densifyPeaks(peaks);
  const w = displayPeaks.length;
  const peakMax = displayPeaks.reduce((max, peak) => Math.max(max, peak), 0.001);

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
      {displayPeaks.map((p, i) => {
        const h = Math.max(1, (p / peakMax) * 28);
        const played = i / w <= progress;
        return (
          <rect
            key={i}
            x={i + 0.15}
            y={16 - h / 2}
            width={0.7}
            height={h}
            fill={played ? (playedFill ?? "#c084fc") : (unplayedFill ?? "#8b5cf6")}
          />
        );
      })}
      <line
        x1={Math.max(0.25, progress * w)}
        x2={Math.max(0.25, progress * w)}
        y1={1}
        y2={31}
        stroke="#f8fafc"
        strokeWidth={0.45}
        strokeOpacity={0.9}
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
