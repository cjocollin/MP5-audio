import type { HighlightMoment, HiltPayload } from "@mp5/container";
import {
  formatTimecodeMs,
} from "../lib/sections/timecode";
import {
  formatUseCaseLabel,
  highlightDurationMs,
  isPreviewUseCase,
} from "../lib/sections/playbackRange";
import type { ActivePlaybackRange } from "../lib/sections/playbackRange";

interface Props {
  hilt: HiltPayload | null | undefined;
  duration: number;
  activeRange: ActivePlaybackRange | null;
  onPlayHighlight: (h: HighlightMoment, index: number) => void;
  onPreviewHighlight: (h: HighlightMoment, index: number) => void;
}

export function HighlightsPanel({
  hilt,
  duration,
  activeRange,
  onPlayHighlight,
  onPreviewHighlight,
}: Props) {
  const highlights = hilt?.highlights ?? [];
  if (!highlights.length) {
    return (
      <div
        className="rounded-lg border border-white/5 bg-surface/30 p-3"
        data-testid="highlights-empty"
      >
        <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-1">
          Highlights
        </p>
        <p className="text-xs text-gray-500 italic">No highlight moments embedded</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="highlights-panel">
      <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">
        Highlights ({highlights.length})
      </p>
      <p className="text-[10px] text-gray-600 leading-relaxed">
        Manually provided HILT clips — preview stops at end; play uses loop or open range. No AI
        detection or social export.
      </p>
      <ul className="space-y-2 max-h-44 overflow-y-auto">
        {highlights.map((h, i) => {
          const dur = highlightDurationMs(h);
          const isActive =
            activeRange?.id === `hilt-play-${i}` ||
            activeRange?.id === `hilt-preview-${i}`;
          return (
            <li
              key={`${h.startMs}-${i}`}
              className={`rounded-lg border p-2 space-y-2 ${
                isActive ? "border-accent/40 bg-accent/10" : "border-white/5 bg-surface/40"
              }`}
              data-testid="highlight-item"
            >
              <div className="flex flex-wrap justify-between gap-1 text-xs">
                <span className="text-gray-200">{h.label ?? "Highlight"}</span>
                <span className="text-[10px] text-gray-500 uppercase">
                  {formatUseCaseLabel(h.useCase)}
                </span>
              </div>
              <p className="text-[10px] text-gray-600 font-mono">
                {formatTimecodeMs(h.startMs)}
                {h.endMs !== undefined ? ` – ${formatTimecodeMs(h.endMs)}` : ""}
                {dur !== null ? ` (${(dur / 1000).toFixed(2)}s)` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-[10px] px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-gray-200"
                  onClick={() => onPlayHighlight(h, i)}
                  disabled={duration <= 0}
                  data-testid="highlight-play"
                >
                  Play
                </button>
                {isPreviewUseCase(h.useCase) && (
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded border border-amber-500/30 text-amber-200/90 hover:bg-amber-950/30"
                    onClick={() => onPreviewHighlight(h, i)}
                    disabled={duration <= 0 || h.endMs === undefined}
                    data-testid="highlight-preview"
                  >
                    Preview
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
