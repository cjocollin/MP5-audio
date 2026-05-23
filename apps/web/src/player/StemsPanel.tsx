import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Mp5File } from "@mp5/container";
import { stemTypeLabel, type StemAvailabilityStatus, type StemDescriptor } from "@mp5/container";
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
import {
  getStemWorkerClient,
  stemWorkerFallbackMessage,
} from "../lib/stems/stemWorkerClient";
import {
  badgeLabel,
  stemRowBadges,
  stemsForActiveMix,
  type StemTransportMode,
} from "../lib/stems/stemMixState";
import { downloadBlob } from "../lib/performance/downloadBlob";
import { formatDuration } from "./playlistUtils";
import type { StemMixSeamlessOp } from "../lib/playback/stemMixOps";
import type { StemPcmTrack } from "./useStemMixerEngine";

export interface StemUiState {
  id: string;
  gain: number;
  muted: boolean;
  solo: boolean;
  selected: boolean;
  preparing: boolean;
  pendingAudible?: boolean;
}

export type StemMixMode = StemTransportMode;

interface KaraokePrepareRequest {
  stemIds: string[];
  preset: Map<string, { muted: boolean; solo: boolean }>;
}

interface Props {
  parsed?: Mp5File;
  stemMixActive: boolean;
  onStemMixActiveChange: (active: boolean) => void;
  onStemMixEnable: (tracks: StemPcmTrack[], mode: StemMixMode, offsetSec: number) => void;
  onStemMixSeamlessOp: (op: StemMixSeamlessOp) => void;
  onRestartStemMix: () => void;
  onReturnToFullMix: (offsetSec: number) => void;
  onMixModeChange?: (mode: StemMixMode) => void;
  getPlaybackTime?: () => number;
  getStemGraphGeneration?: () => number;
  activeStemSourceIds?: string[];
  transportDiagnostics?: string;
  clockDiagnostics?: string;
  stemInsertDeferredId?: string | null;
  onClearStemInsertDeferred?: () => void;
  isPlaying: boolean;
  loading?: boolean;
  karaokePrepareRequest?: KaraokePrepareRequest | null;
  onKaraokePrepareDone?: () => void;
  onKaraokePrepareFailed?: () => void;
}

function availabilityLabel(
  indexed: StemAvailabilityStatus | undefined,
  decodedLoaded: boolean,
): string {
  if (decodedLoaded) return "Loaded";
  if (!indexed) return "—";
  switch (indexed) {
    case "available":
      return "Available";
    case "missing_fragments":
      return "Missing fragments";
    case "partial_fragments":
      return "Partial fragments";
    default:
      return indexed;
  }
}

function stemDurationSec(desc: { durationSamples: number; sampleRate: number; channels: number }): number {
  if (desc.sampleRate <= 0 || desc.channels <= 0) return 0;
  return desc.durationSamples / desc.sampleRate / desc.channels;
}

function uiToPcmTracksForMix(
  file: NonNullable<ReturnType<typeof parseStemsFromFile>>,
  uiState: StemUiState[],
  cache: StemDecodeCache,
  mode: StemTransportMode,
): StemPcmTrack[] {
  const activeIds = new Set(stemsForActiveMix(file.stems, uiState, cache, mode));
  const tracks: StemPcmTrack[] = [];
  for (const stem of file.stems) {
    if (!activeIds.has(stem.stemId)) continue;
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

function pcmTrackForStem(
  file: NonNullable<ReturnType<typeof parseStemsFromFile>>,
  ui: StemUiState,
  cache: StemDecodeCache,
): StemPcmTrack | null {
  const stem = file.stems.find((s) => s.stemId === ui.id);
  const decoded = cache.get(ui.id);
  if (!stem || !decoded) return null;
  return {
    id: stem.stemId,
    samples: decoded.samples,
    rate: decoded.sampleRate,
    ch: decoded.channels,
    gain: ui.gain,
    muted: ui.muted,
    solo: ui.solo,
  };
}

export function StemsPanel({
  parsed,
  stemMixActive,
  onStemMixActiveChange,
  onStemMixEnable,
  onStemMixSeamlessOp,
  onRestartStemMix,
  onReturnToFullMix,
  onMixModeChange,
  getPlaybackTime,
  getStemGraphGeneration,
  activeStemSourceIds,
  transportDiagnostics,
  clockDiagnostics,
  stemInsertDeferredId,
  onClearStemInsertDeferred,
  isPlaying,
  loading,
  karaokePrepareRequest,
  onKaraokePrepareDone,
  onKaraokePrepareFailed,
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
  const bgPrepareByStemRef = useRef<Map<string, AbortController>>(new Map());

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
  const [workerDiag, setWorkerDiag] = useState(() => getStemWorkerClient().diagnostics);
  const [cacheTick, setCacheTick] = useState(0);
  const bumpCacheUi = useCallback(() => setCacheTick((n) => n + 1), []);

  const playbackOffset = useCallback(
    () => (getPlaybackTime ? getPlaybackTime() : 0),
    [getPlaybackTime],
  );

  useEffect(() => {
    if (!parsedStems) {
      setUiState([]);
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
        preparing: false,
      })),
    );
    setStatusError("");
    setSoloStemId(null);
    setMixMode("full_mix");
    onMixModeChange?.("full_mix");
  }, [parsedStems, onStemMixActiveChange, onMixModeChange]);

  useEffect(() => {
    if (!stemInsertDeferredId) return;
    const stem = parsedStems?.stems.find((s) => s.stemId === stemInsertDeferredId);
    setStatusNote(
      stem
        ? `"${stem.stemName}" is ready — use Restart stem mix to apply at the current playhead.`
        : "Stem prepared — restart stem mix to apply.",
    );
    onClearStemInsertDeferred?.();
  }, [stemInsertDeferredId, parsedStems, onClearStemInsertDeferred]);

  const cancelPrepare = useCallback(() => {
    abortRef.current?.abort();
    for (const ac of bgPrepareByStemRef.current.values()) ac.abort();
    bgPrepareByStemRef.current.clear();
    getStemWorkerClient().cancelActive();
    abortRef.current = null;
    setPrepareProgress((p) => ({ ...p, phase: "cancelled" }));
    setUiState((prev) => prev.map((u) => ({ ...u, preparing: false })));
    setStatusNote("Stem preparation cancelled.");
    setWorkerDiag(getStemWorkerClient().diagnostics);
  }, []);

  const seamlessOpForStem = useCallback(
    (ui: StemUiState): StemMixSeamlessOp | null => {
      if (!parsedStems) return null;
      const track = pcmTrackForStem(parsedStems, ui, cacheRef.current);
      if (!track) return null;
      return { type: "audible", track };
    },
    [parsedStems],
  );

  const runPrepare = useCallback(
    async (
      stemsToLoad: StemDescriptor[],
      mode: StemMixMode,
      uiOverride?: StemUiState[],
      enableMix = true,
    ) => {
      if (!parsedStems) return;
      const safety = assessSelectedStemsPrepare(stemsToLoad);
      if (!safety.ok) {
        setStatusError(safety.block ?? "Cannot prepare stems.");
        if (enableMix) onStemMixActiveChange(false);
        return;
      }
      setStatusError("");
      setStatusNote(safety.warning ?? "");
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setPrepareProgress({
        phase: "loading_fragments",
        currentStemName: stemsToLoad[0]?.stemName,
        currentIndex: 0,
        total: stemsToLoad.length,
        decodedRamBytes: cacheRef.current.stats().decodedRamBytes,
        percent: 0,
      });

      try {
        await prepareStemsSequential({
          file: parsedStems,
          stems: stemsToLoad,
          cache: cacheRef.current,
          signal: ac.signal,
          onProgress: (p) => {
            setPrepareProgress(p);
            setWorkerDiag(getStemWorkerClient().diagnostics);
          },
        });
        const diag = getStemWorkerClient().diagnostics;
        setWorkerDiag(diag);
        if (diag.fallbackMode && !safety.warning) {
          setStatusNote(stemWorkerFallbackMessage(diag.lastError));
        }
        const nextUi = (uiOverride ?? uiState).map((u) => ({ ...u, preparing: false }));
        setUiState(nextUi);
        bumpCacheUi();

        if (!enableMix) {
          setStatusNote(
            `Prepared ${stemsToLoad.length} stem(s) · ~${Math.round(cacheRef.current.stats().decodedRamBytes / (1024 * 1024))} MB in RAM`,
          );
          return;
        }

        setMixMode(mode);
        onMixModeChange?.(mode);

        const tracks = uiToPcmTracksForMix(parsedStems, nextUi, cacheRef.current, mode);
        if (!tracks.length) {
          setStatusError("Prepared stems could not be added to the mix.");
          return;
        }
        const offset = playbackOffset();
        onStemMixEnable(tracks, mode, offset);
        setStatusNote(
          `Stem mix active (${mode}) · ~${Math.round(cacheRef.current.stats().decodedRamBytes / (1024 * 1024))} MB in RAM`,
        );
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setStatusError(
          e instanceof Error
            ? e.message
            : "Stem preparation failed. Full mix playback is still available.",
        );
        if (mode === "karaoke") {
          onKaraokePrepareFailed?.();
          onMixModeChange?.("full_mix");
          setMixMode("full_mix");
        }
        onStemMixActiveChange(false);
      } finally {
        abortRef.current = null;
      }
    },
    [
      parsedStems,
      uiState,
      onStemMixActiveChange,
      onStemMixEnable,
      onMixModeChange,
      onKaraokePrepareFailed,
      playbackOffset,
      bumpCacheUi,
    ],
  );

  const prepareStemBackground = useCallback(
    async (stemId: string) => {
      if (!parsedStems || cacheRef.current.has(stemId)) return;
      const capturedGen = getStemGraphGeneration?.() ?? 0;
      const stem = parsedStems.stems.find((s) => s.stemId === stemId);
      if (!stem) return;
      const idx = parsedStems.stems.indexOf(stem);
      setUiState((prev) =>
        prev.map((u) => (u.id === stemId ? { ...u, preparing: true } : u)),
      );
      bgPrepareByStemRef.current.get(stemId)?.abort();
      const ac = new AbortController();
      bgPrepareByStemRef.current.set(stemId, ac);
      try {
        await cacheRef.current.decodeStem(parsedStems, stem, Math.max(0, idx), ac.signal);
        setUiState((prev) => {
          const next = prev.map((u) =>
            u.id === stemId ? { ...u, preparing: false, pendingAudible: false } : u,
          );
          const genNow = getStemGraphGeneration?.() ?? 0;
          const row = next.find((u) => u.id === stemId);
          const wantsAudible =
            row && !row.muted && (row.selected || row.solo || row.pendingAudible);
          if (
            stemMixActive &&
            mixMode !== "full_mix" &&
            capturedGen === genNow &&
            wantsAudible
          ) {
            const track = pcmTrackForStem(parsedStems, row, cacheRef.current);
            if (track) onStemMixSeamlessOp({ type: "insert", track });
          }
          bumpCacheUi();
          return next;
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setUiState((prev) =>
          prev.map((u) =>
            u.id === stemId ? { ...u, preparing: false, pendingAudible: false } : u,
          ),
        );
        setStatusError(
          e instanceof Error ? e.message : "Could not prepare stem in the background.",
        );
      } finally {
        if (bgPrepareByStemRef.current.get(stemId) === ac) {
          bgPrepareByStemRef.current.delete(stemId);
        }
      }
    },
    [parsedStems, stemMixActive, mixMode, onStemMixSeamlessOp, bumpCacheUi, getStemGraphGeneration],
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
        preparing: false,
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

  const handlePrepareSelected = (enableMix = false) => {
    if (!parsedStems) return;
    const selected = parsedStems.stems.filter((s) => uiState.find((u) => u.id === s.stemId)?.selected);
    void runPrepare(selected, "stem_mix", undefined, enableMix);
  };

  const handleEnableStemMix = () => {
    if (!parsedStems) return;
    const selected = parsedStems.stems.filter((s) => uiState.find((u) => u.id === s.stemId)?.selected);
    const allLoaded = selected.every((s) => cacheRef.current.has(s.stemId));
    if (allLoaded && selected.length) {
      const tracks = uiToPcmTracksForMix(parsedStems, uiState, cacheRef.current, "stem_mix");
      if (tracks.length) {
        onStemMixEnable(tracks, "stem_mix", playbackOffset());
        setMixMode("stem_mix");
        onMixModeChange?.("stem_mix");
        setStatusNote("Stem mix active (stem_mix).");
      }
      return;
    }
    void runPrepare(selected, "stem_mix", undefined, true);
  };

  const handleSoloStem = async (stemId: string) => {
    if (!parsedStems) return;
    const stem = parsedStems.stems.find((s) => s.stemId === stemId);
    if (!stem) return;
    setSoloStemId(stemId);
    const nextUi = parsedStems.stems.map((s) => ({
      id: s.stemId,
      gain: s.defaultVolume,
      muted: s.stemId !== stemId,
      solo: s.stemId === stemId,
      selected: s.stemId === stemId,
      preparing: false,
    }));
    if (cacheRef.current.has(stemId)) {
      const tracks = uiToPcmTracksForMix(parsedStems, nextUi, cacheRef.current, "solo_stem");
      if (tracks.length) {
        setUiState(nextUi);
        setMixMode("solo_stem");
        onMixModeChange?.("solo_stem");
        onStemMixEnable(tracks, "solo_stem", playbackOffset());
      }
      return;
    }
    await runPrepare([stem], "solo_stem", nextUi, true);
  };

  const handleStopMix = () => {
    cancelPrepare();
    onReturnToFullMix(playbackOffset());
    setMixMode("full_mix");
    onMixModeChange?.("full_mix");
    setSoloStemId(null);
    setStatusNote("Using full mix in AUDI.");
  };

  const handleUnloadAll = () => {
    cacheRef.current.unloadAll();
    onReturnToFullMix(playbackOffset());
    setMixMode("full_mix");
    onMixModeChange?.("full_mix");
    setStatusNote("Unloaded all decoded stems from memory.");
  };

  const unloadStem = (stemId: string) => {
    if (stemMixActive && mixMode !== "full_mix") {
      onStemMixSeamlessOp({ type: "remove", stemId });
    }
    cacheRef.current.unload(stemId);
  };

  const handleSelectChange = (stemId: string, selected: boolean) => {
    setUiState((prev) => {
      const nextUi = prev.map((u) =>
        u.id === stemId ? { ...u, selected, preparing: selected && !cacheRef.current.has(stemId) } : u,
      );
      const row = nextUi.find((u) => u.id === stemId);
      if (!row) return nextUi;

      if (!stemMixActive || mixMode === "full_mix") {
        return nextUi;
      }

      if (selected) {
        if (cacheRef.current.has(stemId)) {
          const track = pcmTrackForStem(parsedStems!, row, cacheRef.current);
          if (track) onStemMixSeamlessOp({ type: "insert", track });
        } else {
          void prepareStemBackground(stemId);
        }
      } else {
        onStemMixSeamlessOp({ type: "remove", stemId });
      }
      return nextUi;
    });
  };

  const handleMuteToggle = (stemId: string) => {
    setUiState((prev) => {
      const ui = prev.find((u) => u.id === stemId);
      if (!ui) return prev;
      const nextMuted = !ui.muted;
      const nextUi = prev.map((u) =>
        u.id === stemId
          ? {
              ...u,
              muted: nextMuted,
              pendingAudible: nextMuted ? false : u.pendingAudible,
            }
          : u,
      );
      const row = nextUi.find((u) => u.id === stemId)!;

      if (stemMixActive && mixMode !== "full_mix") {
        if (cacheRef.current.has(stemId)) {
          const op = seamlessOpForStem(row);
          if (op) onStemMixSeamlessOp(op);
        } else if (!nextMuted) {
          void prepareStemBackground(stemId);
          return nextUi.map((u) =>
            u.id === stemId ? { ...u, preparing: true, pendingAudible: true } : u,
          );
        }
        return nextUi;
      }

      if (!nextMuted && !cacheRef.current.has(stemId)) {
        void prepareStemBackground(stemId);
        return nextUi.map((u) =>
          u.id === stemId ? { ...u, preparing: true, pendingAudible: false } : u,
        );
      }
      return nextUi;
    });
  };

  const handleGainChange = (stemId: string, gain: number) => {
    setUiState((prev) => {
      const nextUi = prev.map((u) => (u.id === stemId ? { ...u, gain } : u));
      const row = nextUi.find((u) => u.id === stemId);
      if (stemMixActive && mixMode !== "full_mix" && row && cacheRef.current.has(stemId)) {
        const op = seamlessOpForStem(row);
        if (op) onStemMixSeamlessOp(op);
      }
      return nextUi;
    });
  };

  const handleRestartStemMixClick = () => {
    if (!stemMixActive) return;
    onRestartStemMix();
    setStatusNote("Restarting stem mix at current playhead…");
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

  void cacheTick;
  const cacheStats = cacheRef.current.stats();
  const selectedCount = uiState.filter((u) => u.selected).length;
  const selectedEstimate = estimateStemsDecodedBytes(
    parsedStems.stems.filter((s) => uiState.find((u) => u.id === s.stemId)?.selected),
  );
  const preparing =
    prepareProgress.phase === "preparing" ||
    prepareProgress.phase === "loading_fragments" ||
    prepareProgress.phase === "reconstructing" ||
    prepareProgress.phase === "decoding";
  const phaseLabel =
    prepareProgress.phase === "loading_fragments"
      ? "loading fragments"
      : prepareProgress.phase === "reconstructing"
        ? "reconstructing"
        : prepareProgress.phase === "decoding"
          ? "decoding"
          : prepareProgress.phase === "ready"
            ? "ready"
            : "preparing";

  const activeStemIds = new Set(
    stemMixActive && mixMode !== "full_mix"
      ? activeStemSourceIds?.length
        ? activeStemSourceIds
        : stemsForActiveMix(parsedStems.stems, uiState, cacheRef.current, mixMode)
      : [],
  );

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
        <p data-testid="stems-selection-help">
          Selecting a stem prepares it for stem mix. It will not interrupt full mix playback.
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
            ? ` · ${parsedStems.stdfIndexGrouped?.size ?? parsedStems.stdfGrouped.size} stem fragment group(s)${
                parsedStems.lazyFile ? " · lazy index" : ""
              }`
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
        <p data-testid="stems-worker-diagnostics">
          Worker: {workerDiag.workerAvailable ? "yes" : "no"} · status {workerDiag.workerStatus} ·
          phase {workerDiag.taskPhase}
          {workerDiag.queuedStemIds.length ? ` · queued ${workerDiag.queuedStemIds.join(", ")}` : ""}
          {workerDiag.fallbackMode ? " · fallback" : ""}
          {workerDiag.lastError ? ` · err ${workerDiag.lastError}` : ""}
        </p>
        {transportDiagnostics && (
          <p data-testid="stems-transport-diagnostics">{transportDiagnostics}</p>
        )}
        {clockDiagnostics && (
          <p data-testid="stems-clock-diagnostics" className="text-[10px] text-gray-600 font-mono">
            {clockDiagnostics}
          </p>
        )}
      </div>

      {workerDiag.fallbackMode && (
        <p className="text-xs text-amber-200/70" data-testid="stems-worker-fallback-warning">
          {stemWorkerFallbackMessage(workerDiag.lastError)}
        </p>
      )}

      {fileTier?.warning && (
        <p className="text-xs text-amber-200/80 bg-amber-950/30 rounded-lg px-3 py-2" data-testid="stems-memory-warning">
          {fileTier.warning}
        </p>
      )}

      {preparing && (
        <div className="text-xs text-gray-400 space-y-2" data-testid="stems-prepare-progress">
          <p>
            {phaseLabel}: {prepareProgress.currentStemName ?? "stem"} (
            {prepareProgress.currentIndex}/{prepareProgress.total})
            {prepareProgress.percent != null ? ` · ${prepareProgress.percent}%` : ""}…
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
          onClick={() => handlePrepareSelected(false)}
          disabled={loading || preparing || selectedCount === 0}
          data-testid="stems-prepare-selected"
        >
          Prepare selected ({selectedCount})
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-40"
          onClick={handleEnableStemMix}
          disabled={loading || preparing || selectedCount === 0 || stemMixActive}
          data-testid="stems-enable-mix"
        >
          Enable stem mix
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-gray-200 disabled:opacity-40"
          onClick={handleRestartStemMixClick}
          disabled={!stemMixActive || preparing}
          data-testid="stems-restart-mix"
        >
          Restart stem mix
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
          const active = activeStemIds.has(stem.stemId);
          const avail = parsedStems.stemAvailability?.find((a) => a.stemId === stem.stemId);
          const availLabel = availabilityLabel(avail?.status, loaded);
          const badges = ui
            ? stemRowBadges(ui, {
                loaded,
                active,
                availability: avail,
                stemMixActive: stemMixActive && mixMode !== "full_mix",
              })
            : (["available"] as const);
          return (
            <li
              key={stem.stemId}
              className="rounded-lg border border-white/5 bg-surface/40 p-3 space-y-2"
              data-testid="stems-item"
              data-stem-id={stem.stemId}
              data-stem-loaded={loaded ? "true" : "false"}
            >
              <div className="flex flex-wrap justify-between gap-1">
                <label className="flex items-center gap-2 text-sm text-gray-200 flex-wrap">
                  <input
                    type="checkbox"
                    checked={ui?.selected ?? false}
                    onChange={(e) => handleSelectChange(stem.stemId, e.target.checked)}
                    disabled={preparing && ui?.preparing}
                    data-testid="stems-item-select"
                    aria-label={`Select ${stem.stemName} for stem mix`}
                  />
                  <span data-testid="stems-item-name">{stem.stemName}</span>
                  <span className="flex flex-wrap gap-1" data-testid="stems-item-badges">
                    {badges.map((b) => (
                      <span
                        key={b}
                        className={`text-[10px] px-1 rounded border ${
                          b === "active"
                            ? "border-accent/40 text-accent/90"
                            : b === "preparing"
                              ? "border-amber-500/30 text-amber-200/80"
                              : b === "muted"
                              ? "border-red-500/30 text-red-300/80"
                              : b === "pending_audible"
                                ? "border-cyan-500/30 text-cyan-200/80"
                                : "border-white/10 text-gray-500"
                        }`}
                        data-testid={b === "loaded" ? "stems-item-loaded" : `stems-badge-${b}`}
                      >
                        {badgeLabel(b)}
                      </span>
                    ))}
                  </span>
                  <span
                    className={`text-[10px] ${
                      avail?.status === "missing_fragments" || avail?.status === "partial_fragments"
                        ? "text-amber-300/90"
                        : "text-gray-500"
                    }`}
                    data-testid="stems-item-availability"
                  >
                    {availLabel}
                    {avail && avail.indexedFragmentCount > 0 && !loaded
                      ? ` · ${avail.indexedFragmentCount} frags`
                      : ""}
                  </span>
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
                    onChange={(e) => handleGainChange(stem.stemId, Number(e.target.value) / 100)}
                    disabled={!loaded}
                    data-testid="stems-item-volume"
                  />
                </label>
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded text-xs border ${
                    ui?.muted ? "border-red-500/40 text-red-300" : "border-white/10 text-gray-400"
                  }`}
                  onClick={() => handleMuteToggle(stem.stemId)}
                  data-testid="stems-item-mute"
                >
                  {ui?.muted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  className="px-2 py-0.5 rounded text-xs border border-white/10 text-gray-500 hover:text-gray-300"
                  onClick={() => void downloadStem(stem, index)}
                  disabled={downloadBusy === stem.stemId || preparing}
                  data-testid="stems-item-download"
                  title={stemDownloadHelp(stem.codecId)}
                >
                  Download
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {stemMixActive && (
        <p className="text-[10px] text-accent/80" data-testid="stems-mix-active-note">
          Stem mix active ({mixMode}) — full mix output paused. Use “Use full mix” to return to AUDI.
          {soloStemId ? ` Solo: ${soloStemId}` : ""}
        </p>
      )}
    </section>
  );
}
