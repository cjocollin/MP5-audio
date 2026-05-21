import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Mp5File } from "@mp5/container";
import { decodeStemManifest } from "@mp5/container";
import { assessKaraokeAvailability, karaokeStemUiPreset } from "../lib/lyrics/karaokeMode";
import {
  currentSyncedLineIndex,
  hasSyncedLyrics,
  seekTimeSecForLine,
} from "../lib/lyrics/lyricPlayback";
import { parseLyrcFromFile } from "../lib/lyrics/parseLyrics";

interface Props {
  parsed?: Mp5File;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (sec: number) => void;
  karaokeMode: boolean;
  onKaraokeModeChange: (active: boolean) => void;
  onKaraokePreset: (preset: Map<string, { muted: boolean; solo: boolean }> | null) => void;
}

export function LyricsPanel({
  parsed,
  currentTime,
  duration,
  isPlaying,
  onSeek,
  karaokeMode,
  onKaraokeModeChange,
  onKaraokePreset,
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

  const [showLyrics, setShowLyrics] = useState(true);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const synced = lyrc?.synced;
  const useSynced = hasSyncedLyrics(synced);
  const activeIdx = useSynced ? currentSyncedLineIndex(synced!, currentTime) : -1;

  const hasAnyLyrics = !!(lyrc?.unsynced?.trim() || useSynced);

  useEffect(() => {
    if (!showLyrics || activeIdx < 0 || !scrollRef.current) return;
    activeLineRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx, showLyrics]);

  const toggleKaraoke = useCallback(() => {
    if (!karaoke.hasSyncedLyrics) return;
    const next = !karaokeMode;
    onKaraokeModeChange(next);
    if (next && stems?.length && karaoke.audioAvailable) {
      onKaraokePreset(karaokeStemUiPreset(stems, karaoke));
    } else {
      onKaraokePreset(null);
    }
  }, [
    karaoke,
    karaokeMode,
    onKaraokeModeChange,
    onKaraokePreset,
    stems,
  ]);

  useEffect(() => {
    if (!karaokeMode) onKaraokePreset(null);
  }, [karaokeMode, onKaraokePreset]);

  if (!parsed) return null;

  return (
    <section
      className="rounded-xl bg-surface-elevated p-4 space-y-3"
      data-testid="lyrics-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-300">Lyrics</p>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={showLyrics}
            onChange={(e) => setShowLyrics(e.target.checked)}
            data-testid="lyrics-show-toggle"
          />
          Show lyrics
        </label>
      </div>

      <div
        className="text-xs text-gray-500 space-y-1 leading-relaxed border border-white/5 rounded-lg p-3 bg-surface/50"
        data-testid="lyrics-panel-help"
      >
        <p>
          Lyrics are optional and manually provided — no AI lyric generation. Normal playback
          does not require lyrics.
        </p>
        <p>
          Karaoke mode uses synced lyrics plus optional stems (instrumental or muted vocals). It
          does not remove vocals from the full mix without stem mixing enabled.
        </p>
      </div>

      {!hasAnyLyrics ? (
        <p className="text-sm text-gray-500 italic" data-testid="lyrics-empty">
          No lyrics embedded
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-[10px] text-gray-500">
            <span
              className="px-2 py-0.5 rounded border border-white/10"
              data-testid="lyrics-sync-indicator"
            >
              {useSynced ? "Synced" : "Unsynced"}
            </span>
            {lyrc?.source && <span>Source: {lyrc.source}</span>}
            <span data-testid="lyrics-karaoke-availability">
              Karaoke audio:{" "}
              {karaoke.audioAvailable
                ? "available"
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
              disabled={!karaoke.hasSyncedLyrics}
              data-testid="karaoke-mode-toggle"
            >
              {karaokeMode ? "Karaoke mode on" : "Karaoke mode"}
            </button>
          )}
          {karaoke.hasSyncedLyrics && !karaoke.audioAvailable && (
            <p className="text-xs text-gray-500" data-testid="karaoke-audio-unavailable">
              Synced lyrics will highlight during playback. Enable stem mix and mute vocal stems
              manually if this file includes them.
            </p>
          )}

          {showLyrics &&
            (useSynced ? (
              <div
                ref={scrollRef}
                className="max-h-48 overflow-y-auto rounded-lg border border-white/5 bg-surface/30 p-2"
                data-testid="lyrics-synced-view"
              >
                <ul className="space-y-1">
                  {synced!.map((line, i) => {
                    const showSection =
                      line.section &&
                      (i === 0 || synced![i - 1]?.section !== line.section);
                    return (
                      <li key={`${line.timeMs}-${i}`}>
                        {showSection && (
                          <p
                            className="text-[10px] uppercase tracking-wider text-gray-600 mt-2 mb-0.5"
                            data-testid="lyrics-section-header"
                          >
                            {line.section}
                          </p>
                        )}
                        <button
                          type="button"
                          ref={i === activeIdx ? activeLineRef : undefined}
                          className={`w-full text-left text-sm px-2 py-1 rounded transition-colors ${
                            i === activeIdx
                              ? "bg-accent/20 text-accent font-medium"
                              : "text-gray-400 hover:bg-white/5"
                          }`}
                          onClick={() => onSeek(seekTimeSecForLine(line))}
                          disabled={duration <= 0}
                          data-testid="lyrics-synced-line"
                          data-active={i === activeIdx ? "true" : "false"}
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
                className="text-sm text-gray-300 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto rounded-lg border border-white/5 bg-surface/30 p-3"
                data-testid="lyrics-unsynced-view"
              >
                {lyrc?.unsynced}
              </pre>
            ))}
        </>
      )}

      {karaokeMode && isPlaying && useSynced && (
        <p className="text-[10px] text-accent/80" data-testid="karaoke-active-note">
          Karaoke mode — synced lyrics highlighted
          {karaoke.audioAvailable ? "; stem mix should be active with vocals reduced" : ""}.
        </p>
      )}
    </section>
  );
}
