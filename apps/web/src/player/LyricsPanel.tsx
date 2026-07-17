import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Mp5File } from "@mp5/container";
import { decodeStemManifest } from "@mp5/container";
import { assessKaraokeAvailability, karaokeStemUiPreset } from "../lib/lyrics/karaokeMode";
import { stemsForKaraokeAudio } from "../lib/lyrics/karaokePlan";
import {
  currentSyncedLineIndex,
  hasSyncedLyrics,
  seekTimeSecForLine,
} from "../lib/lyrics/lyricPlayback";
import { parseLyrcFromFile } from "../lib/lyrics/parseLyrics";
import { traceScrollIntoView } from "../lib/playback/playbackTrace";
import { scrollChildIntoContainer } from "../lib/ui/scrollWithinContainer";
import { usePlaybackClock } from "./usePlaybackClock";
import {
  lyricLineDisplay,
  lyricsEmptyMessage,
  lyricsModeLabel,
} from "../lib/lyrics/lyricsDisplay";

interface Props {
  parsed?: Mp5File;
  currentTime: number;
  getPlaybackTime: () => number;
  duration: number;
  isPlaying: boolean;
  onSeek: (sec: number) => void;
  karaokeMode: boolean;
  onKaraokeModeChange: (active: boolean) => void;
  onKaraokePrepare: (req: {
    stemIds: string[];
    preset: Map<string, { muted: boolean; solo: boolean }>;
  }) => void;
}

export function LyricsPanel({
  parsed,
  currentTime,
  getPlaybackTime,
  duration,
  isPlaying,
  onSeek,
  karaokeMode,
  onKaraokeModeChange,
  onKaraokePrepare,
}: Props) {
  const lyrc = useMemo(() => parseLyrcFromFile(parsed), [parsed]);
  const stems = useMemo(
    () => decodeStemManifest(parsed?.optional.get("STEM"))?.stems,
    [parsed],
  );
  const karaoke = useMemo(
    () => assessKaraokeAvailability(lyrc?.synced, stems),
    [lyrc?.synced, stems],
  );
  const karaokePlan = useMemo(
    () => (stems?.length ? stemsForKaraokeAudio(stems, karaoke) : null),
    [stems, karaoke],
  );

  const lyricTime = usePlaybackClock(getPlaybackTime, isPlaying, currentTime);

  const [showLyrics, setShowLyrics] = useState(true);
  const [autoScrollLyrics, setAutoScrollLyrics] = useState(true);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledIdxRef = useRef(-1);

  const synced = lyrc?.synced;
  const useSynced = hasSyncedLyrics(synced);
  const activeIdx = useSynced ? currentSyncedLineIndex(synced!, lyricTime) : -1;

  const hasAnyLyrics = !!(lyrc?.unsynced?.trim() || useSynced);

  useEffect(() => {
    if (!showLyrics || !autoScrollLyrics || activeIdx < 0 || activeIdx === lastScrolledIdxRef.current) {
      return;
    }
    lastScrolledIdxRef.current = activeIdx;
    const container = scrollRef.current;
    const child = activeLineRef.current;
    traceScrollIntoView(child, "lyrics active line", !!container);
    scrollChildIntoContainer(container, child, { block: "nearest", behavior: "smooth" });
  }, [activeIdx, showLyrics, autoScrollLyrics]);

  const toggleKaraoke = useCallback(() => {
    if (!karaoke.hasSyncedLyrics) return;
    const next = !karaokeMode;
    onKaraokeModeChange(next);
    if (!next) return;
    if (stems?.length && karaoke.audioAvailable && karaokePlan?.stemIds.length) {
      onKaraokePrepare({
        stemIds: karaokePlan.stemIds,
        preset: karaokeStemUiPreset(stems, karaoke),
      });
    }
  }, [karaoke, karaokeMode, karaokePlan, onKaraokeModeChange, onKaraokePrepare, stems]);

  if (!parsed) return null;

  return (
    <section
      className="rounded-xl bg-surface-elevated p-4 space-y-3"
      data-testid="lyrics-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-300">Lyrics</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showLyrics}
              onChange={(e) => setShowLyrics(e.target.checked)}
              data-testid="lyrics-show-toggle"
            />
            Show lyrics
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoScrollLyrics}
              onChange={(e) => setAutoScrollLyrics(e.target.checked)}
              data-testid="lyrics-autoscroll-toggle"
            />
            Auto-scroll lyrics
          </label>
        </div>
      </div>

      <details
        className="text-xs text-gray-500 border border-white/5 rounded-lg bg-surface/50"
        data-testid="lyrics-panel-help"
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-gray-400 hover:text-gray-300">
          How lyrics & karaoke work
        </summary>
        <div className="space-y-1 leading-relaxed px-3 pb-3 border-t border-white/5 pt-2">
          <p>
            Lyrics are optional and manually provided — no AI lyric generation. Synced lines follow
            the audio playback clock.
          </p>
          <p>
            Karaoke mode uses synced lyrics plus optional stems. With an instrumental stem, only that
            stem is decoded. Otherwise non-vocal stems may be prepared — this can take time on large
            files.
          </p>
        </div>
      </details>

      {!hasAnyLyrics ? (
        <div
          className="rounded-lg border border-dashed border-white/10 bg-surface/30 px-3 py-4"
          data-testid="lyrics-empty"
        >
          <p className="text-sm text-gray-400">{lyricsEmptyMessage(!!parsed)}</p>
          <p className="text-xs text-gray-600 mt-1">Playback still works normally.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-[10px] text-gray-500">
            <span
              className="px-2 py-0.5 rounded border border-white/10"
              data-testid="lyrics-sync-indicator"
            >
              {lyricsModeLabel(useSynced, karaokeMode)}
            </span>
            {lyrc?.source && <span>Source: {lyrc.source}</span>}
            <span data-testid="lyrics-karaoke-availability">
              Karaoke audio:{" "}
              {karaoke.audioAvailable
                ? karaokePlan?.mode === "instrumental_only"
                  ? "instrumental stem (fast)"
                  : "available"
                : karaoke.hasSyncedLyrics
                  ? "unavailable (no compatible stems)"
                  : "needs synced lyrics"}
            </span>
          </div>

          {karaoke.hasSyncedLyrics && (
            <button
              type="button"
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                karaokeMode
                  ? "border-accent/50 text-accent bg-accent/10"
                  : "border-white/10 text-gray-400 hover:text-gray-200"
              }`}
              onClick={toggleKaraoke}
              data-testid="karaoke-mode-toggle"
            >
              {karaokeMode ? "Karaoke mode on" : "Karaoke mode"}
            </button>
          )}
          {karaokeMode && karaokePlan?.message && (
            <p className="text-xs text-gray-500" data-testid="karaoke-plan-note">
              {karaokePlan.message}
            </p>
          )}
          {karaoke.hasSyncedLyrics && !karaoke.audioAvailable && (
            <p className="text-xs text-gray-500" data-testid="karaoke-audio-unavailable">
              Synced lyrics will highlight during playback. No instrumental or vocal stems for
              karaoke audio.
            </p>
          )}

          {showLyrics &&
            (useSynced ? (
              <div
                ref={scrollRef}
                className="max-h-[min(42vh,14rem)] sm:max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-white/5 bg-surface/30 p-2 sm:p-3"
                data-testid="lyrics-synced-view"
              >
                <ul className="space-y-1.5">
                  {synced!.map((line, i) => {
                    const display = lyricLineDisplay(synced!, i, activeIdx);
                    return (
                      <li key={`${line.timeMs}-${i}`}>
                        {display.sectionLabel && (
                          <p
                            className="text-[10px] uppercase text-gray-600 mt-3 mb-1"
                            data-testid="lyrics-section-header"
                          >
                            {display.sectionLabel}
                          </p>
                        )}
                        <button
                          type="button"
                          ref={i === activeIdx ? activeLineRef : undefined}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            display.isCurrent
                              ? "bg-accent/20 text-accent font-semibold text-base"
                              : display.tone === "previous"
                                ? "text-gray-600 text-sm hover:bg-white/5"
                                : "text-gray-300 text-sm hover:bg-white/5"
                          }`}
                          onClick={() => onSeek(seekTimeSecForLine(line))}
                          disabled={duration <= 0}
                          data-testid="lyrics-synced-line"
                          data-active={display.isCurrent ? "true" : "false"}
                          data-tone={display.tone}
                        >
                          {line.text}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <pre
                className="text-sm text-gray-300 whitespace-pre-wrap font-sans max-h-[min(36vh,12rem)] sm:max-h-48 overflow-y-auto overscroll-contain rounded-lg border border-white/5 bg-surface/30 p-3"
                data-testid="lyrics-unsynced-view"
              >
                {lyrc?.unsynced}
              </pre>
            ))}
        </>
      )}

      {karaokeMode && isPlaying && useSynced && (
        <p className="text-[10px] text-accent/80" data-testid="karaoke-active-note">
          Karaoke mode — synced lyrics follow playback
          {karaoke.audioAvailable ? " · stem mix when preparation finishes" : ""}.
        </p>
      )}
    </section>
  );
}
