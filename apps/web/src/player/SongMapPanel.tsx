import { useEffect, useMemo, useRef, useState } from "react";
import type { HighlightMoment, Mp5File, SongSection } from "@mp5/container";
import { sectTypeLabel } from "@mp5/container";
import { parseLyrcFromFile } from "../lib/lyrics/parseLyrics";
import { formatTimecodeMs } from "../lib/sections/timecode";
import type { ActivePlaybackRange } from "../lib/sections/playbackRange";
import {
  currentSectionIndex,
  findFirstSectionByType,
  nextSectionIndex,
  prevSectionIndex,
  replayHookTarget,
  seekTimeSecForSection,
  skipIntroTarget,
} from "../lib/sections/sectionPlayback";
import { loopHookRange, loopSectionRange } from "../lib/sections/playbackRange";
import { hasSongSections, parseStructureFromFile } from "../lib/sections/parseSections";
import { HighlightsPanel } from "./HighlightsPanel";

interface Props {
  parsed?: Mp5File;
  currentTime: number;
  duration: number;
  activeRange: ActivePlaybackRange | null;
  onSeek: (sec: number) => void;
  onPlay: () => void;
  onPlayHighlight: (h: HighlightMoment, index: number) => void;
  onPreviewHighlight: (h: HighlightMoment, index: number) => void;
  onLoopSection: (section: SongSection) => void;
  onLoopHook: () => void;
  onStopLoop: () => void;
}

export function SongMapPanel({
  parsed,
  currentTime,
  duration,
  activeRange,
  onSeek,
  onPlay,
  onPlayHighlight,
  onPreviewHighlight,
  onLoopSection,
  onLoopHook,
  onStopLoop,
}: Props) {
  const structure = useMemo(() => parseStructureFromFile(parsed), [parsed]);
  const sections = structure.sect?.sections ?? [];
  const lyrc = useMemo(() => parseLyrcFromFile(parsed), [parsed]);
  const hasSections = hasSongSections(structure);
  const activeIdx = useMemo(
    () => currentSectionIndex(sections, currentTime),
    [sections, currentTime],
  );
  const activeRef = useRef<HTMLLIElement | null>(null);
  const [showMap, setShowMap] = useState(true);

  useEffect(() => {
    if (!showMap || activeIdx < 0) return;
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx, showMap]);

  const chorus = findFirstSectionByType(sections, "chorus");
  const introSkip = skipIntroTarget(sections);
  const hookReplay = replayHookTarget(structure.hook ?? undefined, sections);
  const hookSection = findFirstSectionByType(sections, "hook");
  const hookLoopAvailable = !!loopHookRange(structure.hook ?? undefined, hookSection);

  const loopSectionTarget =
    activeIdx >= 0 && sections[activeIdx]?.endMs !== undefined
      ? sections[activeIdx]
      : undefined;

  if (!parsed) return null;

  return (
    <section
      className="rounded-xl bg-surface-elevated p-4 space-y-3"
      data-testid="song-map-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-300">
          Song map{" "}
          {hasSections && (
            <span className="text-xs text-gray-500 font-normal">({sections.length})</span>
          )}
        </p>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={showMap}
            onChange={(e) => setShowMap(e.target.checked)}
            data-testid="song-map-show-toggle"
          />
          Show map
        </label>
      </div>

      <div
        className="text-xs text-gray-500 space-y-1 leading-relaxed border border-white/5 rounded-lg p-3 bg-surface/50"
        data-testid="song-map-help"
      >
        <p>
          Song sections and highlights are optional and manually provided — no AI analysis. Playback
          never depends on SECT/HOOK/HILT.
        </p>
      </div>

      {activeRange && (
        <p
          className="text-xs text-amber-200/90 bg-amber-950/25 rounded-lg px-3 py-2"
          data-testid="active-playback-range"
        >
          {activeRange.mode === "loop" ? "Looping" : "Preview"}: {activeRange.label}
          {activeRange.endSec !== undefined && (
            <span className="font-mono text-[10px] text-gray-500 ml-1">
              {formatTimecodeMs(activeRange.startSec * 1000)}–
              {formatTimecodeMs(activeRange.endSec * 1000)}
            </span>
          )}
          <button
            type="button"
            className="ml-2 text-[10px] underline text-gray-400 hover:text-gray-200"
            onClick={onStopLoop}
            data-testid="stop-loop"
          >
            Stop loop
          </button>
        </p>
      )}

      <HighlightsPanel
        hilt={structure.hilt}
        duration={duration}
        activeRange={activeRange}
        onPlayHighlight={onPlayHighlight}
        onPreviewHighlight={onPreviewHighlight}
      />

      {!hasSections ? (
        <p className="text-sm text-gray-500 italic" data-testid="song-map-empty">
          No song sections embedded
        </p>
      ) : (
        <>
          {activeIdx >= 0 && (
            <p className="text-xs text-accent/90" data-testid="song-map-current">
              Now: {sectTypeLabel(sections[activeIdx]!.type)}
              {sections[activeIdx]!.title ? ` — ${sections[activeIdx]!.title}` : ""}
            </p>
          )}

          <div className="flex flex-wrap gap-2" data-testid="song-map-smart-nav">
            <NavButton
              label="Skip intro"
              testId="nav-skip-intro"
              disabled={!introSkip}
              onClick={() => {
                if (!introSkip) return;
                onSeek(seekTimeSecForSection(introSkip));
                onPlay();
              }}
            />
            <NavButton
              label="Jump to chorus"
              testId="nav-jump-chorus"
              disabled={!chorus}
              onClick={() => {
                if (!chorus) return;
                onSeek(seekTimeSecForSection(chorus));
                onPlay();
              }}
            />
            <NavButton
              label={activeRange?.id === "hook" ? "Loop hook (on)" : "Loop hook"}
              testId="nav-loop-hook"
              disabled={!hookLoopAvailable}
              onClick={onLoopHook}
            />
            <NavButton
              label="Replay hook"
              testId="nav-replay-hook"
              disabled={!hookReplay}
              onClick={() => {
                if (!hookReplay) return;
                onSeek(hookReplay.startSec);
                onPlay();
              }}
            />
            <NavButton
              label="Loop section"
              testId="nav-loop-section"
              disabled={!loopSectionTarget}
              onClick={() => loopSectionTarget && onLoopSection(loopSectionTarget)}
            />
            <NavButton
              label="Prev section"
              testId="nav-prev-section"
              disabled={activeIdx <= 0}
              onClick={() => {
                const idx = prevSectionIndex(sections, activeIdx);
                if (sections[idx]) {
                  onSeek(seekTimeSecForSection(sections[idx]!));
                  onPlay();
                }
              }}
            />
            <NavButton
              label="Next section"
              testId="nav-next-section"
              disabled={activeIdx >= sections.length - 1}
              onClick={() => {
                const idx = nextSectionIndex(sections, activeIdx);
                if (sections[idx]) {
                  onSeek(seekTimeSecForSection(sections[idx]!));
                  onPlay();
                }
              }}
            />
          </div>

          {showMap && (
            <ul
              className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-white/5 bg-surface/30 p-2"
              data-testid="song-map-list"
            >
              {sections.map((s, i) => {
                const canLoop = s.endMs !== undefined && s.endMs > s.startMs;
                const isLooping = activeRange?.id === `sect-${s.sectionId}`;
                return (
                  <li key={s.sectionId} ref={i === activeIdx ? activeRef : undefined}>
                    <div
                      className={`rounded px-2 py-1.5 ${
                        i === activeIdx ? "bg-accent/20" : "hover:bg-white/5"
                      }`}
                    >
                      <button
                        type="button"
                        className={`w-full text-left text-xs flex flex-wrap justify-between gap-1 ${
                          i === activeIdx ? "text-accent" : "text-gray-400"
                        }`}
                        onClick={() => onSeek(seekTimeSecForSection(s))}
                        disabled={duration <= 0}
                        data-testid="song-map-section"
                        data-active={i === activeIdx ? "true" : "false"}
                      >
                        <span>
                          {sectTypeLabel(s.type)}
                          {s.title ? ` · ${s.title}` : ""}
                        </span>
                        <span className="text-[10px] text-gray-600 font-mono">
                          {formatTimecodeMs(s.startMs)}
                          {s.endMs !== undefined ? `–${formatTimecodeMs(s.endMs)}` : ""}
                        </span>
                      </button>
                      {canLoop && (
                        <button
                          type="button"
                          className={`mt-1 text-[10px] px-1.5 py-0.5 rounded border ${
                            isLooping
                              ? "border-accent/50 text-accent"
                              : "border-white/10 text-gray-500"
                          }`}
                          onClick={() => onLoopSection(s)}
                          data-testid="section-loop-btn"
                        >
                          {isLooping ? "Looping" : "Loop section"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function NavButton({
  label,
  testId,
  disabled,
  onClick,
}: {
  label: string;
  testId: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-[10px] px-2 py-1 rounded border ${
        disabled
          ? "border-white/5 text-gray-600 cursor-not-allowed"
          : "border-white/10 text-gray-400 hover:text-gray-200"
      }`}
      data-testid={testId}
    >
      {label}
    </button>
  );
}
