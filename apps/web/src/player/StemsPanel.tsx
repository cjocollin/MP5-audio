import { useCallback, useEffect, useMemo, useState } from "react";
import type { Mp5File } from "@mp5/container";
import { stemTypeLabel, type StemDescriptor } from "@mp5/container";
import { codecLabel } from "../lib/codecDisplay";
import {
  stemDownloadHelp,
  stemFrameDownloadFilename,
} from "../lib/stems/stemDownload";
import { assessStemMixSafety } from "../lib/stems/stemLimits";
import { downloadBlob } from "../lib/performance/downloadBlob";
import { parseStemsFromFile } from "../lib/stems/parseStems";
import { formatDuration } from "./playlistUtils";
import { decodeStemFrame } from "./decodeStemFrame";
import type { StemPcmTrack } from "./useStemMixerEngine";

export interface StemUiState {
  id: string;
  gain: number;
  muted: boolean;
  solo: boolean;
}

interface Props {
  parsed?: Mp5File;
  stemMixActive: boolean;
  onStemMixActiveChange: (active: boolean) => void;
  onStemTracksReady: (tracks: StemPcmTrack[] | null) => void;
  isPlaying: boolean;
  loading?: boolean;
  karaokeMode?: boolean;
  karaokeStemPreset?: Map<string, { muted: boolean; solo: boolean }> | null;
}

function stemDurationSec(desc: StemDescriptor): number {
  if (desc.sampleRate <= 0 || desc.channels <= 0) return 0;
  return desc.durationSamples / desc.sampleRate / desc.channels;
}

export function StemsPanel({
  parsed,
  stemMixActive,
  onStemMixActiveChange,
  onStemTracksReady,
  isPlaying,
  loading,
  karaokeMode = false,
  karaokeStemPreset = null,
}: Props) {
  const parsedStems = useMemo(() => (parsed ? parseStemsFromFile(parsed) : null), [parsed]);
  const safety = useMemo(
    () => (parsedStems ? assessStemMixSafety(parsedStems.stems) : { ok: false }),
    [parsedStems],
  );
  const [uiState, setUiState] = useState<StemUiState[]>([]);
  const [decodeBusy, setDecodeBusy] = useState(false);
  const [decodeError, setDecodeError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!parsedStems) {
      setUiState([]);
      onStemTracksReady(null);
      onStemMixActiveChange(false);
      return;
    }
    setUiState(
      parsedStems.stems.map((s) => ({
        id: s.stemId,
        gain: s.defaultVolume,
        muted: false,
        solo: false,
      })),
    );
  }, [parsedStems, onStemTracksReady, onStemMixActiveChange]);

  useEffect(() => {
    if (!karaokeMode || !karaokeStemPreset || !parsedStems) return;
    setUiState(
      parsedStems.stems.map((s) => {
        const p = karaokeStemPreset.get(s.stemId);
        return {
          id: s.stemId,
          gain: s.defaultVolume,
          muted: p?.muted ?? false,
          solo: p?.solo ?? false,
        };
      }),
    );
    if (!stemMixActive && safety.ok) {
      onStemMixActiveChange(true);
    }
  }, [
    karaokeMode,
    karaokeStemPreset,
    parsedStems,
    safety.ok,
    stemMixActive,
    onStemMixActiveChange,
  ]);

  const rebuildPcmTracks = useCallback(async () => {
    if (!parsedStems || !stemMixActive) {
      onStemTracksReady(null);
      return;
    }
    if (!safety.ok) {
      setDecodeError(safety.block ?? "Stem mix is not available for this file.");
      onStemTracksReady(null);
      return;
    }
    setDecodeBusy(true);
    setDecodeError("");
    try {
      const pcmTracks: StemPcmTrack[] = [];
      for (const stem of parsedStems.stems) {
        if (!stem.frameData.length) continue;
        const ui = uiState.find((u) => u.id === stem.stemId);
        const { samples, sampleRate, channels } = await decodeStemFrame(
          stem.frameData,
          stem.codecId,
          stem.channels,
          stem.sampleRate,
        );
        pcmTracks.push({
          id: stem.stemId,
          samples,
          rate: sampleRate,
          ch: channels,
          gain: ui?.gain ?? stem.defaultVolume,
          muted: ui?.muted ?? false,
          solo: ui?.solo ?? false,
        });
      }
      onStemTracksReady(pcmTracks.length ? pcmTracks : null);
    } catch (e) {
      setDecodeError(
        e instanceof Error
          ? e.message
          : "Could not decode stems. Full mix playback is still available.",
      );
      onStemTracksReady(null);
    } finally {
      setDecodeBusy(false);
    }
  }, [parsedStems, stemMixActive, uiState, onStemTracksReady, safety]);

  useEffect(() => {
    if (stemMixActive) void rebuildPcmTracks();
    else onStemTracksReady(null);
  }, [stemMixActive, rebuildPcmTracks, onStemTracksReady]);

  useEffect(() => {
    if (!stemMixActive || !parsedStems) return;
    void rebuildPcmTracks();
  }, [uiState, stemMixActive, parsedStems, rebuildPcmTracks]);

  const handleMixToggle = (active: boolean) => {
    if (active && !safety.ok) {
      setDecodeError(safety.block ?? "Stem mix blocked for this file.");
      return;
    }
    setDecodeError("");
    onStemMixActiveChange(active);
  };

  if (!parsedStems?.stems.length) return null;

  const stemDataBroken = parsedStems.errors.length > 0 && !parsedStems.stems.some((s) => s.frameData.length);

  const updateUi = (id: string, patch: Partial<StemUiState>) => {
    setUiState((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  const downloadStem = async (stem: (typeof parsedStems.stems)[0]) => {
    setDownloadBusy(stem.stemId);
    try {
      downloadBlob(
        new Blob([new Uint8Array(stem.frameData)], { type: "application/octet-stream" }),
        stemFrameDownloadFilename(stem.stemName, stem.stemType, stem.codecId),
      );
    } finally {
      setDownloadBusy(null);
    }
  };

  return (
    <section className="rounded-xl bg-surface-elevated p-4 space-y-3" data-testid="stems-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-300">
          Stems <span className="text-xs text-gray-500 font-normal">({parsedStems.stems.length})</span>
        </p>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={stemMixActive}
            onChange={(e) => handleMixToggle(e.target.checked)}
            disabled={loading || decodeBusy || !safety.ok || stemDataBroken}
            data-testid="stem-mix-toggle"
          />
          Mix stems in player
        </label>
      </div>

      <div
        className="text-xs text-gray-500 space-y-1.5 leading-relaxed border border-white/5 rounded-lg p-3 bg-surface/50"
        data-testid="stems-panel-help"
      >
        <p>
          <strong className="text-gray-400 font-normal">Optional.</strong> This file includes separate
          stems in addition to the full mix. Normal playback uses the <strong className="text-gray-400 font-normal">full mix in AUDI</strong> — always available below.
        </p>
        <p>
          Third-party players can ignore STEM/STDA/STDF and play the full mix only. No AI stem separation —
          stems were provided manually at export.
        </p>
        <p>
          <strong className="text-gray-400 font-normal">Mix stems in player</strong> is opt-in and
          experimental. It decodes every stem into memory for mute/solo/volume. Disable it to return to
          standard full-mix playback.
        </p>
      </div>

      {safety.warning && (
        <p className="text-xs text-amber-200/80 bg-amber-950/30 rounded-lg px-3 py-2" data-testid="stems-memory-warning">
          {safety.warning}
        </p>
      )}
      {safety.block && (
        <p className="text-xs text-red-300/90 bg-red-950/30 rounded-lg px-3 py-2" data-testid="stems-mix-blocked">
          {safety.block}
        </p>
      )}
      {stemDataBroken && (
        <p
          className="text-xs text-amber-200/90 bg-amber-950/30 rounded-lg px-3 py-2"
          data-testid="stems-reconstruct-warning"
        >
          Stem data could not be reconstructed ({parsedStems.storageMode}). Full mix playback is
          unchanged. {parsedStems.errors[0]}
        </p>
      )}
      {parsedStems.storageMode === "stdf-v1" && !stemDataBroken && (
        <p className="text-xs text-gray-500" data-testid="stems-stdf-notice">
          Segmented STDF stem storage — large embedded stem set.
        </p>
      )}

      {decodeError && (
        <p className="text-xs text-red-300/90" data-testid="stems-decode-error">
          {decodeError}
        </p>
      )}
      {decodeBusy && <p className="text-xs text-gray-500" data-testid="stems-decode-busy">Decoding stems…</p>}

      <ul className="space-y-2" data-testid="stems-list">
        {parsedStems.stems.map((stem) => {
          const ui = uiState.find((u) => u.id === stem.stemId);
          return (
            <li
              key={stem.stemId}
              className="rounded-lg border border-white/5 bg-surface/40 p-3 space-y-2"
              data-testid="stems-item"
              data-stem-id={stem.stemId}
            >
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-sm text-gray-200" data-testid="stems-item-name">
                  {stem.stemName}
                </span>
                <span className="text-[10px] text-gray-500">
                  {stemTypeLabel(stem.stemType)} · {codecLabel(stem.codecId)} ·{" "}
                  {formatDuration(stemDurationSec(stem))}
                </span>
              </div>
              {stem.requiredForPlayback && (
                <span className="text-[10px] text-amber-300/80">Required for playback (metadata)</span>
              )}
              {stem.explicitContent && (
                <span className="text-[10px] px-1 rounded bg-gray-800 text-gray-400">Content</span>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-500 flex-1 min-w-[120px]">
                  Vol
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((ui?.gain ?? 1) * 100)}
                    onChange={(e) => updateUi(stem.stemId, { gain: Number(e.target.value) / 100 })}
                    disabled={!stemMixActive}
                    data-testid="stems-item-volume"
                  />
                </label>
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded text-xs border ${
                    ui?.muted ? "border-red-500/40 text-red-300" : "border-white/10 text-gray-400"
                  }`}
                  onClick={() => updateUi(stem.stemId, { muted: !ui?.muted })}
                  disabled={!stemMixActive}
                  data-testid="stems-item-mute"
                >
                  Mute
                </button>
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded text-xs border ${
                    ui?.solo ? "border-accent/50 text-accent" : "border-white/10 text-gray-400"
                  }`}
                  onClick={() => updateUi(stem.stemId, { solo: !ui?.solo })}
                  disabled={!stemMixActive}
                  data-testid="stems-item-solo"
                >
                  Solo
                </button>
                <button
                  type="button"
                  className="px-2 py-0.5 rounded text-xs border border-white/10 text-gray-500 hover:text-gray-300"
                  onClick={() => void downloadStem(stem)}
                  disabled={downloadBusy === stem.stemId}
                  title={stemDownloadHelp(stem.codecId)}
                  data-testid="stems-item-download"
                >
                  Download
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {stemMixActive && isPlaying && (
        <p className="text-[10px] text-accent/80" data-testid="stems-mix-active-note">
          Stem mix active — full mix output paused. Uncheck “Mix stems in player” to hear the normal full mix.
        </p>
      )}
    </section>
  );
}
