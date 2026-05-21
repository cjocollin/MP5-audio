import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Mp5File } from "@mp5/container";
import { stemTypeLabel, type StemDescriptor } from "@mp5/container";
import { codecLabel } from "../lib/codecDisplay";
import {
  stemDownloadHelp,
  stemFrameDownloadFilename,
} from "../lib/stems/stemDownload";
import {
  assessSelectedStemsPrepare,
  assessStemFileTier,
  estimateStemDecodedBytes,
  estimateStemsDecodedBytes,
} from "../lib/stems/stemLimits";
import { StemDecodeCache } from "../lib/stems/stemDecodeCache";
import { parseStemsFromFile } from "../lib/stems/parseStems";
import { prepareStemsSequential, type StemPrepareProgress } from "../lib/stems/stemPreparation";
import { loadStemFrameData } from "../lib/stems/stemFrameLoader";
import { downloadBlob } from "../lib/performance/downloadBlob";
import { formatDuration } from "./playlistUtils";
import type { StemPcmTrack } from "./useStemMixerEngine";

export interface StemUiState {
  id: string;
  gain: number;
  muted: boolean;
  solo: boolean;
  selected: boolean;
}

export type StemMixMode = "full_mix" | "selected" | "solo" | "karaoke";

interface KaraokePrepareRequest {
  stemIds: string[];
  preset: Map<string, { muted: boolean; solo: boolean }>;
}

interface Props {
  parsed?: Mp5File;
  stemMixActive: boolean;
  onStemMixActiveChange: (active: boolean) => void;
  onStemTracksReady: (tracks: StemPcmTrack[] | null) => void;
  onMixModeChange?: (mode: StemMixMode) => void;
  isPlaying: boolean;
  loading?: boolean;
  karaokePrepareRequest?: KaraokePrepareRequest | null;
  onKaraokePrepareDone?: () => void;
}

function stemDurationSec(desc: { durationSamples: number; sampleRate: number; channels: number }): number {
  if (desc.sampleRate <= 0 || desc.channels <= 0) return 0;
  return desc.durationSamples / desc.sampleRate / desc.channels;
}

function uiToPcmTracks(
  file: NonNullable<ReturnType<typeof parseStemsFromFile>>,
  uiState: StemUiState[],
  cache: StemDecodeCache,
): StemPcmTrack[] {
  const tracks: StemPcmTrack[] = [];
  for (const stem of file.stems) {
    const decoded = cache.get(stem.stemId);
    if (!decoded) continue;
    const ui = uiState.find((u) => u.id === stem.stemId);
    tracks.push({
      id: stem.stemId,
      samples: decoded.samples,
      rate: decoded.sampleRate,
      ch: decoded.channels,
      gain: ui?.gain ?? stem.defaultVolume,
      muted: ui?.muted ?? false,
      solo: ui?.solo ?? false,
    });
  }
  return tracks;
}

export function StemsPanel({
  parsed,
  stemMixActive,
  onStemMixActiveChange,
  onStemTracksReady,
  onMixModeChange,
  isPlaying,
  loading,
  karaokePrepareRequest,
  onKaraokePrepareDone,
}: Props) {
  const parsedStems = useMemo(() => (parsed ? parseStemsFromFile(parsed) : null), [parsed]);
  const fileTier = useMemo(
    () =>
      parsedStems
        ? assessStemFileTier(parsedStems.stems, parsedStems.totalEmbeddedBytes)
        : null,
    [parsedStems],
  );

  const cacheRef = useRef(new StemDecodeCache());
  const abortRef = useRef<AbortController | null>(null);

  const [uiState, setUiState] = useState<StemUiState[]>([]);
  const [mixMode, setMixMode] = useState<StemMixMode>("full_mix");
  const [prepareProgress, setPrepareProgress] = useState<StemPrepareProgress>({
    phase: "idle",
    currentIndex: 0,
    total: 0,
    decodedRamBytes: 0,
  });
  const [statusError, setStatusError] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [soloStemId, setSoloStemId] = useState<string | null>(null);

  useEffect(() => {
    if (!parsedStems) {
      setUiState([]);
      onStemTracksReady(null);
      onStemMixActiveChange(false);
      cacheRef.current.unloadAll();
      return;
    }
    setUiState(
      parsedStems.stems.map((s) => ({
        id: s.stemId,
        gain: s.defaultVolume,
        muted: false,
        solo: false,
        selected: false,
      })),
    );
    setStatusError("");
    setSoloStemId(null);
    setMixMode("full_mix");
    onMixModeChange?.("full_mix");
  }, [parsedStems, onStemTracksReady, onStemMixActiveChange, onMixModeChange]);

  const cancelPrepare = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPrepareProgress((p) => ({ ...p, phase: "cancelled" }));
    setStatusNote("Stem preparation cancelled.");
  }, []);

  const syncTracksToMixer = useCallback(
    (mode: StemMixMode) => {
      if (!parsedStems || !stemMixActive) {
        onStemTracksReady(null);
        return;
      }
      const tracks = uiToPcmTracks(parsedStems, uiState, cacheRef.current);
      onStemTracksReady(tracks.length ? tracks : null);
      onMixModeChange?.(mode);
    },
    [parsedStems, stemMixActive, uiState, onStemTracksReady, onMixModeChange],
  );

  const runPrepare = useCallback(
    async (stemsToLoad: StemDescriptor[], mode: StemMixMode, uiOverride?: StemUiState[]) => {
      if (!parsedStems) return;
      const safety = assessSelectedStemsPrepare(stemsToLoad);
      if (!safety.ok) {
        setStatusError(safety.block ?? "Cannot prepare stems.");
        onStemMixActiveChange(false);
        return;
      }
      setStatusError("");
      setStatusNote(safety.warning ?? "");
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        await prepareStemsSequential({
          file: parsedStems,
          stems: stemsToLoad,
          cache: cacheRef.current,
          signal: ac.signal,
          onProgress: setPrepareProgress,
        });
        if (uiOverride) setUiState(uiOverride);
        setMixMode(mode);
        onStemMixActiveChange(true);
        syncTracksToMixer(mode);
        setStatusNote(
          `Prepared ${stemsToLoad.length} stem(s) · ~${Math.round(cacheRef.current.stats().decodedRamBytes / (1024 * 1024))} MB in RAM`,
        );
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setStatusError(
          e instanceof Error
            ? e.message
            : "Stem preparation failed. Full mix playback is still available.",
        );
        onStemMixActiveChange(false);
        onStemTracksReady(null);
      } finally {
        abortRef.current = null;
      }
    },
    [parsedStems, onStemMixActiveChange, onStemTracksReady, syncTracksToMixer],
  );

  useEffect(() => {
    if (!karaokePrepareRequest || !parsedStems) return;
    const { stemIds, preset } = karaokePrepareRequest;
    const nextUi = parsedStems.stems.map((s) => {
      const p = preset.get(s.stemId);
      return {
        id: s.stemId,
        gain: s.defaultVolume,
        muted: p?.muted ?? false,
        solo: p?.solo ?? false,
        selected: stemIds.includes(s.stemId),
      };
    });
    const toLoad = parsedStems.stems.filter((s) => stemIds.includes(s.stemId));
    if (!toLoad.length) {
      setMixMode("karaoke");
      onMixModeChange?.("karaoke");
      onKaraokePrepareDone?.();
      return;
    }
    void runPrepare(toLoad, "karaoke", nextUi).finally(() => onKaraokePrepareDone?.());
  }, [karaokePrepareRequest, parsedStems, runPrepare, onKaraokePrepareDone, onMixModeChange]);

  useEffect(() => {
    if (stemMixActive) syncTracksToMixer(mixMode);
    else onStemTracksReady(null);
  }, [uiState, stemMixActive, mixMode, syncTracksToMixer, onStemTracksReady]);

  const handlePrepareSelected = () => {
    if (!parsedStems) return;
    const selected = parsedStems.stems.filter((s) => uiState.find((u) => u.id === s.stemId)?.selected);
    void runPrepare(selected, "selected");
  };

  const handleSoloStem = async (stemId: string) => {
    if (!parsedStems) return;
    const stem = parsedStems.stems.find((s) => s.stemId === stemId);
    if (!stem) return;
    const idx = parsedStems.stems.indexOf(stem);
    setSoloStemId(stemId);
    const nextUi = parsedStems.stems.map((s) => ({
      id: s.stemId,
      gain: s.defaultVolume,
      muted: s.stemId !== stemId,
      solo: s.stemId === stemId,
      selected: s.stemId === stemId,
    }));
    await runPrepare([stem], "solo", nextUi);
  };

  const handleStopMix = () => {
    cancelPrepare();
    onStemMixActiveChange(false);
    setMixMode("full_mix");
    onMixModeChange?.("full_mix");
    setSoloStemId(null);
    setStatusNote("Using full mix in AUDI.");
  };

  const handleUnloadAll = () => {
    cacheRef.current.unloadAll();
    onStemMixActiveChange(false);
    setMixMode("full_mix");
    onMixModeChange?.("full_mix");
    setStatusNote("Unloaded all decoded stems from memory.");
    onStemTracksReady(null);
  };

  const unloadStem = (stemId: string) => {
    cacheRef.current.unload(stemId);
    syncTracksToMixer(mixMode);
  };

  const updateUi = (id: string, patch: Partial<StemUiState>) => {
    setUiState((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  const downloadStem = async (
    stem: NonNullable<typeof parsedStems>["stems"][number],
    index: number,
  ) => {
    if (!parsedStems) return;
    setDownloadBusy(stem.stemId);
    try {
      const { frameData, errors } = await loadStemFrameData(parsedStems, stem, index);
      if (errors.length || !frameData.length) {
        setStatusError(errors[0] ?? "Could not load stem for download.");
        return;
      }
      downloadBlob(
        new Blob([new Uint8Array(frameData)], { type: "application/octet-stream" }),
        stemFrameDownloadFilename(stem.stemName, stem.stemType, stem.codecId),
      );
    } finally {
      setDownloadBusy(null);
    }
  };

  if (!parsedStems?.stems.length) return null;

  const cacheStats = cacheRef.current.stats();
  const selectedCount = uiState.filter((u) => u.selected).length;
  const selectedEstimate = estimateStemsDecodedBytes(
    parsedStems.stems.filter((s) => uiState.find((u) => u.id === s.stemId)?.selected),
  );
  const preparing = prepareProgress.phase === "preparing";

  return (
    <section className="rounded-xl bg-surface-elevated p-4 space-y-3" data-testid="stems-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-300">
          Stems <span className="text-xs text-gray-500 font-normal">({parsedStems.stems.length})</span>
        </p>
        <span className="text-[10px] text-gray-500 font-mono" data-testid="stems-mix-mode">
          {mixMode === "full_mix" ? "Full mix" : mixMode}
        </span>
      </div>

      <div
        className="text-xs text-gray-500 space-y-1.5 leading-relaxed border border-white/5 rounded-lg p-3 bg-surface/50"
        data-testid="stems-panel-help"
      >
        <p>
          <strong className="text-gray-400 font-normal">Full mix</strong> in AUDI is always ready — play
          normally below. Stems are optional; load only what you need.
        </p>
        {fileTier?.large && (
          <p data-testid="stems-large-adaptive-notice">
            This file has large embedded stems. Full mix playback is ready. Choose which stems to load,
            solo, or prepare a stem mix. Large mixes may take time and memory.
          </p>
        )}
        <p>
          No AI stem separation — stems were provided manually at export. Third-party players can ignore
          STEM/STDA/STDF.
        </p>
      </div>

      <div
        className="text-[10px] text-gray-600 font-mono space-y-0.5 border border-white/5 rounded-lg p-2"
        data-testid="stems-diagnostics"
      >
        <p>
          Storage: {parsedStems.storageMode}
          {parsedStems.storageMode === "stdf-v1"
            ? ` · ${parsedStems.stdfGrouped.size} stem fragment group(s)`
            : ""}
        </p>
        <p>Embedded stem data: ~{Math.round(parsedStems.totalEmbeddedBytes / (1024 * 1024))} MB</p>
        <p>
          Loaded: {cacheStats.loadedCount} · RAM ~{Math.round(cacheStats.decodedRamBytes / (1024 * 1024))}{" "}
          MB
          {selectedCount > 0
            ? ` · Selected estimate ~${Math.round(selectedEstimate / (1024 * 1024))} MB`
            : ""}
        </p>
      </div>

      {fileTier?.warning && (
        <p className="text-xs text-amber-200/80 bg-amber-950/30 rounded-lg px-3 py-2" data-testid="stems-memory-warning">
          {fileTier.warning}
        </p>
      )}

      {preparing && (
        <div className="text-xs text-gray-400 space-y-2" data-testid="stems-prepare-progress">
          <p>
            Preparing {prepareProgress.currentStemName ?? "stem"} (
            {prepareProgress.currentIndex}/{prepareProgress.total})…
          </p>
          <button
            type="button"
            className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-gray-200"
            onClick={cancelPrepare}
            data-testid="stems-prepare-cancel"
          >
            Cancel preparation
          </button>
        </div>
      )}

      {statusNote && !statusError && (
        <p className="text-xs text-gray-500" data-testid="stems-status-note">
          {statusNote}
        </p>
      )}
      {statusError && (
        <p className="text-xs text-red-300/90" data-testid="stems-decode-error">
          {statusError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40"
          onClick={handlePrepareSelected}
          disabled={loading || preparing || selectedCount === 0}
          data-testid="stems-prepare-selected"
        >
          Prepare selected ({selectedCount})
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-gray-200 disabled:opacity-40"
          onClick={handleStopMix}
          disabled={!stemMixActive && mixMode === "full_mix"}
          data-testid="stem-mix-stop"
        >
          Use full mix
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-500 hover:text-gray-300 disabled:opacity-40"
          onClick={handleUnloadAll}
          disabled={cacheStats.loadedCount === 0}
          data-testid="stems-unload-all"
        >
          Unload all stems
        </button>
      </div>

      <ul className="space-y-2" data-testid="stems-list">
        {parsedStems.stems.map((stem, index) => {
          const ui = uiState.find((u) => u.id === stem.stemId);
          const loaded = cacheRef.current.has(stem.stemId);
          return (
            <li
              key={stem.stemId}
              className="rounded-lg border border-white/5 bg-surface/40 p-3 space-y-2"
              data-testid="stems-item"
              data-stem-id={stem.stemId}
              data-stem-loaded={loaded ? "true" : "false"}
            >
              <div className="flex flex-wrap justify-between gap-1">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={ui?.selected ?? false}
                    onChange={(e) => updateUi(stem.stemId, { selected: e.target.checked })}
                    disabled={preparing}
                    data-testid="stems-item-select"
                  />
                  <span data-testid="stems-item-name">{stem.stemName}</span>
                  {loaded && (
                    <span className="text-[10px] text-accent/80" data-testid="stems-item-loaded">
                      loaded
                    </span>
                  )}
                </label>
                <span className="text-[10px] text-gray-500">
                  {stemTypeLabel(stem.stemType)} · {codecLabel(stem.codecId)} ·{" "}
                  {formatDuration(stemDurationSec(stem))} · ~
                  {Math.round(estimateStemDecodedBytes(stem) / (1024 * 1024))} MB
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="px-2 py-0.5 rounded text-xs border border-accent/30 text-accent"
                  onClick={() => void handleSoloStem(stem.stemId)}
                  disabled={loading || preparing}
                  data-testid="stems-item-solo-load"
                >
                  Solo
                </button>
                {loaded && (
                  <button
                    type="button"
                    className="px-2 py-0.5 rounded text-xs border border-white/10 text-gray-500"
                    onClick={() => unloadStem(stem.stemId)}
                    data-testid="stems-item-unload"
                  >
                    Unload
                  </button>
                )}
                <label className="flex items-center gap-1 text-xs text-gray-500 flex-1 min-w-[100px]">
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
                  className="px-2 py-0.5 rounded text-xs border border-white/10 text-gray-500 hover:text-gray-300"
                  onClick={() => void downloadStem(stem, index)}
                  disabled={downloadBusy === stem.stemId || preparing}
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
          Stem mix active ({mixMode}) — full mix output paused. Use “Use full mix” to return to AUDI.
          {soloStemId ? ` Solo: ${soloStemId}` : ""}
        </p>
      )}
    </section>
  );
}
