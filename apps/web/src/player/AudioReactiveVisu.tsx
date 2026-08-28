import { useEffect, useId, useRef } from "react";
import { AUDIO_ANALYSIS_BIN_COUNT } from "../lib/playback/audioAnalysis";
import type { ResolvedPlayerTheme } from "../lib/visualTheme/applyVisualTheme";

export const REACTIVE_VISU_BAR_COUNT = 24;

export function buildReactiveBarHeights(
  frame: ArrayLike<number>,
  opts: { active: boolean; reducedMotion: boolean; intensity?: string },
): number[] {
  const scale = opts.intensity === "low" ? 0.58 : opts.intensity === "high" ? 0.92 : 0.75;
  if (opts.reducedMotion) {
    return Array.from({ length: REACTIVE_VISU_BAR_COUNT }, (_, index) =>
      0.16 + 0.1 * Math.sin(((index + 1) / (REACTIVE_VISU_BAR_COUNT + 1)) * Math.PI),
    );
  }
  if (!opts.active) return Array(REACTIVE_VISU_BAR_COUNT).fill(0.12);

  return Array.from({ length: REACTIVE_VISU_BAR_COUNT }, (_, index) => {
    const start = Math.floor((index * frame.length) / REACTIVE_VISU_BAR_COUNT);
    const end = Math.max(start + 1, Math.floor(((index + 1) * frame.length) / REACTIVE_VISU_BAR_COUNT));
    let sum = 0;
    for (let i = start; i < end; i++) sum += frame[i] ?? 0;
    const normalized = sum / Math.max(1, end - start) / 255;
    return Math.min(1, 0.12 + Math.pow(normalized, 0.72) * scale);
  });
}

interface Props {
  active: boolean;
  getAnalysisFrame: (target: Uint8Array) => boolean;
  theme?: ResolvedPlayerTheme | null;
}

export function AudioReactiveVisu({ active, getAnalysisFrame, theme }: Props) {
  const rectsRef = useRef<Array<SVGRectElement | null>>([]);
  const gradientId = `mp5-reactive-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frame = new Uint8Array(AUDIO_ANALYSIS_BIN_COUNT);
    let animationFrame = 0;
    let previousPaint = 0;

    const paint = (heights: number[]) => {
      for (let index = 0; index < heights.length; index++) {
        const rect = rectsRef.current[index];
        if (!rect) continue;
        const height = Math.max(3, heights[index]! * 42);
        rect.setAttribute("y", String(46 - height));
        rect.setAttribute("height", String(height));
        rect.setAttribute("opacity", String(0.42 + heights[index]! * 0.58));
      }
    };

    const render = (now: number) => {
      if (now - previousPaint >= 32) {
        previousPaint = now;
        getAnalysisFrame(frame);
        paint(
          buildReactiveBarHeights(frame, {
            active,
            reducedMotion: media.matches,
            intensity: theme?.visualIntensity,
          }),
        );
      }
      if (active && !media.matches) animationFrame = window.requestAnimationFrame(render);
    };

    paint(
      buildReactiveBarHeights(frame, {
        active,
        reducedMotion: media.matches,
        intensity: theme?.visualIntensity,
      }),
    );
    if (active && !media.matches) animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [active, getAnalysisFrame, theme?.visualIntensity]);

  const primary = theme?.primary ?? theme?.accent ?? "#8b5cf6";
  const secondary = theme?.secondary ?? primary;
  const accent = theme?.accent ?? "#22d3ee";

  return (
    <svg
      viewBox="0 0 120 48"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-3 bottom-3 z-[2] h-[28%] w-[calc(100%-1.5rem)]"
      role="img"
      aria-label={active ? "Live audio visualization" : "Audio visualization paused"}
      data-testid="audio-reactive-visu"
      data-active={active ? "true" : "false"}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={primary} />
          <stop offset="52%" stopColor={secondary} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
      </defs>
      {Array.from({ length: REACTIVE_VISU_BAR_COUNT }, (_, index) => (
        <rect
          key={index}
          ref={(node) => {
            rectsRef.current[index] = node;
          }}
          x={index * 5 + 0.9}
          y={41}
          width={2.25}
          height={5}
          rx={1.125}
          fill={`url(#${gradientId})`}
          opacity={0.5}
        />
      ))}
    </svg>
  );
}
