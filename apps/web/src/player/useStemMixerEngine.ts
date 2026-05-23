import { useCallback, useEffect, useRef } from "react";
import { tracePlayback } from "../lib/playback/playbackTrace";
import { recordPatchPlayhead } from "../lib/playback/stemMixerAssert";
import { computePlaybackTime } from "./playbackTime";

export interface StemPcmTrack {
  id: string;
  samples: Int16Array;
  rate: number;
  ch: number;
  gain: number;
  muted: boolean;
  solo: boolean;
}

export interface StemMixerDiagnostics {
  stemGraphGeneration: number;
  activeSourceCount: number;
  activeStemIds: string[];
  stemMixSourcesActive: boolean;
}

interface Options {
  volume: number;
  isPlaying: boolean;
  duration: number;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  onTrackEnded?: () => void;
  onOverlapDetected?: (detail: string) => void;
  /** Called when the last stem source ends near track duration. */
  onStemMixNaturalEnd?: () => void;
}

export interface LoadInitialMixOptions {
  offset?: number;
  resume?: boolean;
  generation: number;
}

function pcmToAudioBuffer(ctx: AudioContext, track: StemPcmTrack): AudioBuffer {
  const { samples, rate, ch } = track;
  const frames = samples.length / ch;
  const buffer = ctx.createBuffer(ch, frames, rate);
  for (let c = 0; c < ch; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < frames; i++) {
      channel[i] = samples[i * ch + c]! / 32768;
    }
  }
  return buffer;
}

function effectiveGain(tracks: StemPcmTrack[], track: StemPcmTrack): number {
  if (track.muted) return 0;
  const anySolo = tracks.some((t) => t.solo);
  if (anySolo && !track.solo) return 0;
  return track.gain;
}

export function useStemMixerEngine({
  volume,
  isPlaying,
  duration,
  setCurrentTime,
  setPlaying,
  onTrackEnded,
  onOverlapDetected,
  onStemMixNaturalEnd,
}: Options) {
  const onTrackEndedRef = useRef(onTrackEnded);
  onTrackEndedRef.current = onTrackEnded;
  const onStemMixNaturalEndRef = useRef(onStemMixNaturalEnd);
  onStemMixNaturalEndRef.current = onStemMixNaturalEnd;
  const onOverlapRef = useRef(onOverlapDetected);
  onOverlapRef.current = onOverlapDetected;

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const stemGainsRef = useRef<Map<string, GainNode>>(new Map());
  const sourcesByStemIdRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const tracksRef = useRef<StemPcmTrack[]>([]);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const graphGenerationRef = useRef(0);
  const mixStartedRef = useRef(false);
  const graphBusyRef = useRef(false);
  const mixOpChainRef = useRef(Promise.resolve());
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const isCurrentGeneration = (generation: number) => generation === graphGenerationRef.current;

  const runMixOp = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = mixOpChainRef.current.then(fn);
    mixOpChainRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  const stopSourceForStem = useCallback((stemId: string) => {
    const src = sourcesByStemIdRef.current.get(stemId);
    if (!src) return;
    try {
      src.stop();
    } catch {
      /* */
    }
    sourcesByStemIdRef.current.delete(stemId);
  }, []);

  const disposeAllSources = useCallback(() => {
    for (const stemId of [...sourcesByStemIdRef.current.keys()]) {
      stopSourceForStem(stemId);
    }
  }, [stopSourceForStem]);

  const stopInaudibleSources = useCallback(() => {
    const tracks = tracksRef.current;
    for (const t of tracks) {
      if (effectiveGain(tracks, t) <= 0 && sourcesByStemIdRef.current.has(t.id)) {
        stopSourceForStem(t.id);
      }
    }
  }, [stopSourceForStem]);

  /**
   * Read the current playhead AND re-anchor the wall clock so that subsequent
   * calls don't double-count elapsed time. This is the canonical
   * snapshot-and-resync — every call updates `startedAtRef` to `ctx.currentTime`
   * when it advances `offsetRef`, making it idempotent.
   *
   * Bug fix (2026-05-22): Previously this updated `offsetRef` but not
   * `startedAtRef`, so a second call (e.g. after a large `pcmToAudioBuffer`
   * blocking decode in `patchStemAudible` / `insertStemAtCurrentOffset`) would
   * add elapsed-since-start AGAIN, shoving late-joined stems tens of seconds
   * past the rest of the mix.
   */
  const capturePlayhead = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && sourcesByStemIdRef.current.size > 0) {
      offsetRef.current = computePlaybackTime(
        offsetRef.current,
        ctx.currentTime,
        startedAtRef.current,
        duration,
      );
      startedAtRef.current = ctx.currentTime;
    }
    return offsetRef.current;
  }, [duration]);

  /** Alias kept for callers that want intent-named anchor after a source ends. */
  const resyncMasterClock = capturePlayhead;

  const stopStemMix = useCallback(() => {
    capturePlayhead();
    disposeAllSources();
    mixStartedRef.current = false;
  }, [capturePlayhead, disposeAllSources]);

  const setGraphGeneration = useCallback((generation: number) => {
    graphGenerationRef.current = generation;
  }, []);

  const ensureContext = useCallback(async () => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
      const master = ctxRef.current.createGain();
      master.gain.value = volumeRef.current;
      master.connect(ctxRef.current.destination);
      masterGainRef.current = master;
    }
    if (ctxRef.current.state === "suspended") {
      await ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const applyGains = useCallback(() => {
    const tracks = tracksRef.current;
    for (const t of tracks) {
      const node = stemGainsRef.current.get(t.id);
      if (node) node.gain.value = effectiveGain(tracks, t);
    }
  }, []);

  const ensureBufferAndGain = useCallback(
    async (track: StemPcmTrack) => {
      const ctx = await ensureContext();
      if (!masterGainRef.current) return;
      if (!buffersRef.current.has(track.id)) {
        const buf = pcmToAudioBuffer(ctx, track);
        buffersRef.current.set(track.id, buf);
        const gainNode = ctx.createGain();
        gainNode.connect(masterGainRef.current);
        stemGainsRef.current.set(track.id, gainNode);
      }
      applyGains();
    },
    [applyGains, ensureContext],
  );

  const wireSourceEnded = useCallback(
    (src: AudioBufferSourceNode, stemId: string) => {
      src.onended = () => {
        if (sourcesByStemIdRef.current.get(stemId) !== src) return;
        // Snapshot + re-anchor BEFORE removing this source so the elapsed
        // computation still has size > 0 and counts correctly.
        capturePlayhead();
        sourcesByStemIdRef.current.delete(stemId);
        tracePlayback("stem_source", "ended", { stemId, remaining: sourcesByStemIdRef.current.size });
        if (sourcesByStemIdRef.current.size === 0) {
          mixStartedRef.current = false;
          if (offsetRef.current >= duration - 0.05) {
            tracePlayback("stem_mix", "natural end", {
              endSec: offsetRef.current,
              duration,
            });
            onStemMixNaturalEndRef.current?.();
          }
        }
      };
    },
    [capturePlayhead, duration],
  );

  type StartStemOpts = {
    /** Shared AudioContext time for batch starts — keeps stems sample-aligned. */
    when?: number;
    /** Skip per-stem clock resync (caller sets offsetRef/startedAtRef once). */
    batch?: boolean;
  };

  const startStemSourceAtOffset = useCallback(
    async (
      stemId: string,
      offset: number,
      generation: number,
      opts?: StartStemOpts,
    ) => {
      if (!isCurrentGeneration(generation)) return false;
      const tracks = tracksRef.current;
      const track = tracks.find((t) => t.id === stemId);
      if (!track) return false;

      const buffer = buffersRef.current.get(stemId);
      const gainNode = stemGainsRef.current.get(stemId);
      if (!buffer || !gainNode) return false;

      if (effectiveGain(tracks, track) <= 0) return true;

      if (offset >= buffer.duration) {
        onOverlapRef.current?.(`Stem ${stemId} cannot start past its duration.`);
        return false;
      }

      if (sourcesByStemIdRef.current.has(stemId)) return true;

      const ctx = await ensureContext();
      if (!isCurrentGeneration(generation)) return false;

      const when = opts?.when ?? ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gainNode);
      wireSourceEnded(src, stemId);
      src.start(when, Math.min(offset, buffer.duration));
      sourcesByStemIdRef.current.set(stemId, src);

      if (!opts?.batch) {
        if (!mixStartedRef.current || sourcesByStemIdRef.current.size === 1) {
          offsetRef.current = offset;
          startedAtRef.current = when;
          mixStartedRef.current = true;
        } else {
          resyncMasterClock();
        }
      }
      return true;
    },
    [ensureContext, resyncMasterClock, wireSourceEnded],
  );

  const startAllAt = useCallback(
    async (offset: number, generation: number) => {
      if (!isCurrentGeneration(generation)) return;
      const tracks = tracksRef.current;
      if (!tracks.length) return;

      graphBusyRef.current = true;
      try {
        disposeAllSources();
        const ctx = await ensureContext();
        if (!masterGainRef.current || !isCurrentGeneration(generation)) return;

        applyGains();
        masterGainRef.current.gain.value = volumeRef.current;

        const when = ctx.currentTime;
        for (const t of tracks) {
          if (!isCurrentGeneration(generation)) return;
          if (effectiveGain(tracks, t) <= 0) continue;
          await startStemSourceAtOffset(t.id, offset, generation, { when, batch: true });
        }

        if (sourcesByStemIdRef.current.size > 0) {
          offsetRef.current = offset;
          startedAtRef.current = when;
          mixStartedRef.current = true;
          setCurrentTime(offset);
        }
      } finally {
        graphBusyRef.current = false;
      }
    },
    [applyGains, disposeAllSources, ensureContext, setCurrentTime, startStemSourceAtOffset],
  );

  /** Explicit mix start / restart only — never from checkbox/mute/volume. */
  const loadInitialTracksForMix = useCallback(
    async (tracks: StemPcmTrack[], opts: LoadInitialMixOptions) => {
      return runMixOp(async () => {
        tracePlayback("load_initial_mix", "loadInitialTracksForMix", {
          trackCount: tracks.length,
          generation: opts.generation,
          resume: opts.resume,
        });
        const { generation } = opts;
        if (!isCurrentGeneration(generation)) return;

        graphBusyRef.current = true;
        try {
          const offset = opts.offset ?? capturePlayhead();
          tracksRef.current = tracks;
          disposeAllSources();
          stemGainsRef.current.clear();
          buffersRef.current.clear();

          const ctx = await ensureContext();
          if (!masterGainRef.current || !isCurrentGeneration(generation)) return;

          for (const t of tracks) {
            const buf = pcmToAudioBuffer(ctx, t);
            buffersRef.current.set(t.id, buf);
            const gain = ctx.createGain();
            gain.gain.value = effectiveGain(tracks, t);
            gain.connect(masterGainRef.current);
            stemGainsRef.current.set(t.id, gain);
          }

          if (!isCurrentGeneration(generation)) {
            disposeAllSources();
            return;
          }

          offsetRef.current = offset;
          if (opts.resume !== false && isPlayingRef.current && tracks.length) {
            await startAllAt(offset, generation);
          } else {
            setCurrentTime(offset);
          }
        } finally {
          graphBusyRef.current = false;
        }
      });
    },
    [capturePlayhead, disposeAllSources, ensureContext, runMixOp, setCurrentTime, startAllAt],
  );

  const upsertTrackMeta = useCallback((track: StemPcmTrack) => {
    const i = tracksRef.current.findIndex((t) => t.id === track.id);
    if (i >= 0) tracksRef.current[i] = track;
    else tracksRef.current.push(track);
  }, []);

  const insertStemAtCurrentOffset = useCallback(
    async (track: StemPcmTrack, generation: number) => {
      return runMixOp(async () => {
        tracePlayback("insert_stem", "insertStemAtCurrentOffset", { stemId: track.id, generation });
        if (!isCurrentGeneration(generation)) return false;
        recordPatchPlayhead(capturePlayhead());
        upsertTrackMeta(track);
        await ensureBufferAndGain(track);
        if (!isCurrentGeneration(generation)) return false;
        if (!isPlayingRef.current) return true;

        applyGains();
        stopInaudibleSources();
        const shouldPlay = effectiveGain(tracksRef.current, track) > 0;
        if (!shouldPlay) return true;
        if (sourcesByStemIdRef.current.has(track.id)) return true;

        const offset = capturePlayhead();
        return startStemSourceAtOffset(track.id, offset, generation);
      });
    },
    [
      applyGains,
      capturePlayhead,
      ensureBufferAndGain,
      runMixOp,
      startStemSourceAtOffset,
      stopInaudibleSources,
      upsertTrackMeta,
    ],
  );

  const removeStemOnly = useCallback(
    async (stemId: string, generation: number) => {
      if (!isCurrentGeneration(generation)) return;
      recordPatchPlayhead(capturePlayhead());
      stopSourceForStem(stemId);
      tracksRef.current = tracksRef.current.filter((t) => t.id !== stemId);
      stemGainsRef.current.delete(stemId);
      buffersRef.current.delete(stemId);
    },
    [capturePlayhead, stopSourceForStem],
  );

  const patchStemAudible = useCallback(
    async (track: StemPcmTrack, generation: number) => {
      return runMixOp(async () => {
        tracePlayback("patch_audible", "patchStemAudible", {
          stemId: track.id,
          muted: track.muted,
          generation,
        });
        if (!isCurrentGeneration(generation)) return;
        recordPatchPlayhead(capturePlayhead());
        upsertTrackMeta(track);
        await ensureBufferAndGain(track);
        if (!isCurrentGeneration(generation)) return;

        applyGains();
        stopInaudibleSources();

        const tracks = tracksRef.current;
        const audible = effectiveGain(tracks, track) > 0;
        const hasSrc = sourcesByStemIdRef.current.has(track.id);

        if (!audible && hasSrc) {
          stopSourceForStem(track.id);
          return;
        }
        if (audible && !hasSrc && isPlayingRef.current) {
          const offset = capturePlayhead();
          recordPatchPlayhead(offset);
          await startStemSourceAtOffset(track.id, offset, generation);
        }
      });
    },
    [
      applyGains,
      capturePlayhead,
      ensureBufferAndGain,
      runMixOp,
      startStemSourceAtOffset,
      stopInaudibleSources,
      stopSourceForStem,
      upsertTrackMeta,
    ],
  );

  const patchStemGain = useCallback(
    async (
      stemId: string,
      params: { muted: boolean; gain: number; solo?: boolean },
      generation: number,
    ) => {
      const track = tracksRef.current.find((t) => t.id === stemId);
      if (!track) return;
      await patchStemAudible(
        {
          ...track,
          muted: params.muted,
          gain: params.gain,
          solo: params.solo ?? track.solo,
        },
        generation,
      );
    },
    [patchStemAudible],
  );

  const seekStemMix = useCallback(
    (seconds: number, generation: number, opts?: { start?: boolean }) => {
      if (!isCurrentGeneration(generation)) return;
      const clamped = Math.max(0, Math.min(seconds, duration || 0));
      offsetRef.current = clamped;
      setCurrentTime(clamped);
      if (isPlaying || opts?.start) {
        void startAllAt(clamped, generation);
      }
    },
    [duration, isPlaying, setCurrentTime, startAllAt],
  );

  const resumeStemMixAt = useCallback(
    (offset: number, generation: number) => {
      tracePlayback("stem_mix", "resumeStemMixAt", { offset, generation });
      void startAllAt(offset, generation);
    },
    [startAllAt],
  );

  const getActiveStemIds = useCallback(() => [...sourcesByStemIdRef.current.keys()], []);

  const getActiveSourceCount = useCallback(() => sourcesByStemIdRef.current.size, []);

  const getDiagnostics = useCallback((): StemMixerDiagnostics => {
    return {
      stemGraphGeneration: graphGenerationRef.current,
      activeSourceCount: sourcesByStemIdRef.current.size,
      activeStemIds: getActiveStemIds(),
      stemMixSourcesActive: sourcesByStemIdRef.current.size > 0,
    };
  }, [getActiveStemIds]);

  useEffect(() => {
    if (masterGainRef.current && ctxRef.current?.state !== "closed") {
      masterGainRef.current.gain.value = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (!isPlaying) {
      stopStemMix();
    }
  }, [isPlaying, stopStemMix]);

  useEffect(() => {
    return () => {
      stopStemMix();
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, [stopStemMix]);

  const getPlaybackTime = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || sourcesByStemIdRef.current.size === 0) {
      return offsetRef.current;
    }
    return computePlaybackTime(
      offsetRef.current,
      ctx.currentTime,
      startedAtRef.current,
      duration,
    );
  }, [duration]);

  const hasActiveSources = useCallback(
    () => sourcesByStemIdRef.current.size > 0,
    [],
  );

  const isGraphBusy = useCallback(() => graphBusyRef.current, []);

  return {
    loadInitialTracksForMix,
    insertStemAtCurrentOffset,
    removeStemOnly,
    patchStemAudible,
    patchStemGain,
    seekStemMix,
    stopStemMix,
    setGraphGeneration,
    getPlaybackTime,
    getDiagnostics,
    getActiveStemIds,
    getActiveSourceCount,
    hasActiveSources,
    isGraphBusy,
    resumeStemMixAt,
  };
}
