import { useCallback, useEffect, useRef } from "react";
import { tracePlayback } from "../lib/playback/playbackTrace";
import { requestPlaybackAudioFocus } from "../lib/playback/audioFocus";
import {
  connectPlaybackAnalyser,
  readPlaybackAnalysis,
} from "../lib/playback/audioAnalysis";
import { computePlaybackTime } from "./playbackTime";
import { gaplessScheduleTime } from "./gaplessPlayback";
import {
  int16ToPlanarFloat,
  int16ToPlanarFloatAsync,
  planarFloatToAudioBuffer,
} from "./pcmConvert";

interface PcmData {
  samples: Int16Array;
  rate: number;
  ch: number;
  /** Prefer worker-built planar floats — avoids multi-second UI freezes. */
  floatChannels?: Float32Array[];
}

interface Options {
  volume: number;
  isPlaying: boolean;
  duration: number;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  onTrackEnded?: () => void;
  onGaplessTransition?: (trackId: string) => boolean;
  onPcmReady?: () => void;
}

/** Sync path for rare AudioContext rebuilds. */
function pcmToAudioBuffer(ctx: AudioContext, pcm: PcmData): AudioBuffer {
  const planar =
    pcm.floatChannels ?? int16ToPlanarFloat(pcm.samples, pcm.ch);
  return planarFloatToAudioBuffer(ctx, planar, pcm.rate);
}

/** Async path for load — yields during Int16 convert when floats are missing. */
async function pcmToAudioBufferAsync(
  ctx: AudioContext,
  pcm: PcmData,
): Promise<AudioBuffer> {
  const planar =
    pcm.floatChannels ??
    (await int16ToPlanarFloatAsync(pcm.samples, pcm.ch));
  return planarFloatToAudioBuffer(ctx, planar, pcm.rate);
}

function isContextUsable(ctx: AudioContext | null): ctx is AudioContext {
  return ctx !== null && ctx.state !== "closed";
}

export function useMp5AudioEngine({
  volume,
  isPlaying,
  duration,
  setCurrentTime,
  setPlaying,
  onTrackEnded,
  onGaplessTransition,
  onPcmReady,
}: Options) {
  const onTrackEndedRef = useRef(onTrackEnded);
  onTrackEndedRef.current = onTrackEnded;
  const onGaplessTransitionRef = useRef(onGaplessTransition);
  onGaplessTransitionRef.current = onGaplessTransition;
  const onPcmReadyRef = useRef(onPcmReady);
  onPcmReadyRef.current = onPcmReady;
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const pcmRef = useRef<PcmData | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startGenRef = useRef(0);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const trackDurationRef = useRef(duration);
  trackDurationRef.current = duration;
  /** True while AudioBuffer is only a progressive first window. */
  const partialBufferRef = useRef(false);
  const gaplessPrepareGenRef = useRef(0);
  const gaplessNextRef = useRef<{
    trackId: string;
    buffer: AudioBuffer;
    source?: AudioBufferSourceNode;
    scheduledAt?: number;
  } | null>(null);

  const clampDuration = useCallback(() => {
    const track = trackDurationRef.current;
    const buf = bufferRef.current?.duration ?? track;
    if (partialBufferRef.current) return Math.min(track || buf, buf);
    return track || buf;
  }, []);

  const rebuildBuffer = useCallback((ctx: AudioContext) => {
    if (!pcmRef.current) return;
    bufferRef.current = pcmToAudioBuffer(ctx, pcmRef.current);
  }, []);

  const stopGaplessSource = useCallback((preserveBuffer: boolean) => {
    const pending = gaplessNextRef.current;
    if (!pending) return;
    try {
      pending.source?.stop();
    } catch {
      /* not started or already stopped */
    }
    if (preserveBuffer) {
      pending.source = undefined;
      pending.scheduledAt = undefined;
    } else {
      gaplessNextRef.current = null;
    }
  }, []);

  const clearGaplessNext = useCallback(() => {
    gaplessPrepareGenRef.current += 1;
    stopGaplessSource(false);
  }, [stopGaplessSource]);

  const schedulePreparedGapless = useCallback(
    (ctx: AudioContext, currentOffset: number) => {
      const pending = gaplessNextRef.current;
      const currentBuffer = bufferRef.current;
      const gain = gainRef.current;
      if (!pending || !currentBuffer || !gain || partialBufferRef.current) return;
      stopGaplessSource(true);
      const source = ctx.createBufferSource();
      source.buffer = pending.buffer;
      source.connect(gain);
      const scheduledAt = gaplessScheduleTime(
        ctx.currentTime,
        currentOffset,
        currentBuffer.duration,
      );
      source.onended = () => {
        if (gaplessNextRef.current?.source === source) {
          gaplessNextRef.current = null;
        }
      };
      source.start(scheduledAt);
      pending.source = source;
      pending.scheduledAt = scheduledAt;
      tracePlayback("main_source", "gapless next scheduled", {
        trackId: pending.trackId,
        scheduledAt,
      });
    },
    [stopGaplessSource],
  );

  const ensureContext = useCallback(async (resume = true) => {
    if (!isContextUsable(ctxRef.current)) {
      ctxRef.current = new AudioContext();
      const gain = ctxRef.current.createGain();
      gain.gain.value = volumeRef.current;
      analyserRef.current = connectPlaybackAnalyser(ctxRef.current, gain);
      gainRef.current = gain;
      rebuildBuffer(ctxRef.current);
    }
    if (resume && ctxRef.current.state === "suspended") {
      await ctxRef.current.resume();
      tracePlayback("audio_context", "resumed", { state: ctxRef.current.state });
    }
    tracePlayback("audio_context", "ensure", { state: ctxRef.current.state });
    return ctxRef.current;
  }, [rebuildBuffer]);

  const stopSource = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && srcRef.current && isContextUsable(ctx)) {
      offsetRef.current = computePlaybackTime(
        offsetRef.current,
        ctx.currentTime,
        startedAtRef.current,
        clampDuration(),
      );
    }
    try {
      srcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    srcRef.current = null;
    stopGaplessSource(true);
    tracePlayback("main_source", "stop");
  }, [clampDuration, stopGaplessSource]);

  const wireCurrentSourceEnded = useCallback(
    (source: AudioBufferSourceNode) => {
      source.onended = () => {
        if (srcRef.current !== source) return;
        srcRef.current = null;
        const bufDur = bufferRef.current?.duration ?? 0;
        const trackDur = trackDurationRef.current;
        if (partialBufferRef.current && bufDur + 0.05 < trackDur) {
          offsetRef.current = bufDur;
          setCurrentTime(bufDur);
          tracePlayback("main_source", "partial buffer ended — waiting for full decode");
          return;
        }
        const pending = gaplessNextRef.current;
        if (pending?.source && pending.scheduledAt != null) {
          const accepted = onGaplessTransitionRef.current?.(pending.trackId) === true;
          if (accepted) {
            offsetRef.current = 0;
            setCurrentTime(0);
            tracePlayback("main_source", "gapless handoff", { trackId: pending.trackId });
            return;
          }
          stopGaplessSource(false);
        }
        offsetRef.current = trackDur;
        setCurrentTime(trackDur);
        setPlaying(false);
        if (trackDur > 0) onTrackEndedRef.current?.();
      };
    },
    [setCurrentTime, setPlaying, stopGaplessSource],
  );

  const startAt = useCallback(
    async (offset: number) => {
      if (!pcmRef.current) {
        tracePlayback("main_source", "start skipped — no PCM");
        return;
      }
      requestPlaybackAudioFocus();
      const gen = ++startGenRef.current;
      stopSource();
      const ctx = await ensureContext();
      if (gen !== startGenRef.current) return;
      if (!bufferRef.current) {
        rebuildBuffer(ctx);
      }
      if (!bufferRef.current || !gainRef.current) return;

      // Refuse to start within ~50ms of a progressive partial buffer's end:
      // it would play a ~1ms blip and immediately re-fire onended (the wedge's
      // "Play does nothing" symptom). Park and wait for the full-decode upgrade,
      // which rebuilds the buffer and restarts playback from here.
      const partialEnd = bufferRef.current.duration;
      if (
        partialBufferRef.current &&
        offset >= partialEnd - 0.05 &&
        partialEnd + 0.05 < trackDurationRef.current
      ) {
        offsetRef.current = Math.min(offset, partialEnd);
        tracePlayback("main_source", "start deferred — at partial end, awaiting full decode");
        return;
      }

      const gain = gainRef.current;
      gain.gain.value = volumeRef.current;

      const src = ctx.createBufferSource();
      src.buffer = bufferRef.current;
      src.connect(gain);
      const maxOff = bufferRef.current.duration;
      const safeOffset = Math.max(0, Math.min(offset, Math.max(0, maxOff - 0.001)));
      offsetRef.current = safeOffset;
      startedAtRef.current = ctx.currentTime;
      wireCurrentSourceEnded(src);
      if (gen !== startGenRef.current) {
        try {
          src.stop();
        } catch {
          /* not started */
        }
        return;
      }
      src.start(0, safeOffset);
      srcRef.current = src;
      schedulePreparedGapless(ctx, safeOffset);
      tracePlayback("main_source", "start", {
        offset: safeOffset,
        bufferSec: bufferRef.current.duration,
        partial: partialBufferRef.current,
      });
    },
    [ensureContext, rebuildBuffer, schedulePreparedGapless, stopSource, wireCurrentSourceEnded],
  );

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;

  const loadPcm = useCallback(
    async (
      pcm: PcmData,
      opts?: { partial?: boolean; gaplessTrackId?: string },
    ): Promise<boolean> => {
      pcmRef.current = pcm;
      partialBufferRef.current = !!opts?.partial;
      const pending = gaplessNextRef.current;
      const handoffContext = ctxRef.current;
      if (
        opts?.gaplessTrackId &&
        pending?.trackId === opts.gaplessTrackId &&
        pending.source &&
        pending.scheduledAt != null &&
        isContextUsable(handoffContext)
      ) {
        bufferRef.current = pending.buffer;
        srcRef.current = pending.source;
        startedAtRef.current = pending.scheduledAt;
        offsetRef.current = Math.max(0, handoffContext.currentTime - pending.scheduledAt);
        gaplessNextRef.current = null;
        pcm.floatChannels = undefined;
        wireCurrentSourceEnded(srcRef.current);
        setCurrentTime(offsetRef.current);
        onPcmReadyRef.current?.();
        return true;
      }
      stopSource();
      clearGaplessNext();
      // Browsers are allowed to keep a new AudioContext suspended until a user
      // gesture. Building the buffer must not wait for that gesture, otherwise
      // a first-load track remains stuck in the "Decoding audio" state.
      const ctx = await ensureContext(false);
      bufferRef.current = await pcmToAudioBufferAsync(ctx, pcm);
      // The AudioBuffer now owns its own copy of the samples; release our ~80MB
      // planar float set (a rare AudioContext rebuild regenerates it from
      // pcm.samples). This is the single biggest per-track retention drop.
      pcm.floatChannels = undefined;
      offsetRef.current = 0;
      tracePlayback("main_source", "pcm loaded", {
        frames: pcm.samples.length / pcm.ch,
        rate: pcm.rate,
        bufferSec: bufferRef.current.duration,
        partial: partialBufferRef.current,
      });
      onPcmReadyRef.current?.();
      if (isPlayingRef.current) {
        void startAtRef.current(offsetRef.current);
      }
      return false;
    },
    [clearGaplessNext, ensureContext, setCurrentTime, stopSource, wireCurrentSourceEnded],
  );

  const prepareGaplessNext = useCallback(
    async (trackId: string, pcm: PcmData): Promise<boolean> => {
      if (gaplessNextRef.current?.trackId === trackId) return true;
      const generation = ++gaplessPrepareGenRef.current;
      const ctx = await ensureContext(false);
      const buffer = await pcmToAudioBufferAsync(ctx, pcm);
      pcm.floatChannels = undefined;
      if (generation !== gaplessPrepareGenRef.current) return false;
      stopGaplessSource(false);
      gaplessNextRef.current = { trackId, buffer };
      if (srcRef.current && isPlayingRef.current) {
        const currentOffset = computePlaybackTime(
          offsetRef.current,
          ctx.currentTime,
          startedAtRef.current,
          clampDuration(),
        );
        schedulePreparedGapless(ctx, currentOffset);
      }
      return true;
    },
    [clampDuration, ensureContext, schedulePreparedGapless, stopGaplessSource],
  );

  const hasGaplessHandoff = useCallback(
    (trackId: string) =>
      gaplessNextRef.current?.trackId === trackId &&
      !!gaplessNextRef.current.source &&
      gaplessNextRef.current.scheduledAt != null,
    [],
  );

  /**
   * Replace PCM with a longer (full) buffer without resetting playhead.
   * Used when progressive first-window decode upgrades to full decode.
   */
  const upgradePcm = useCallback(
    async (pcm: PcmData) => {
      const ctxClock = ctxRef.current;
      let t = offsetRef.current;
      if (ctxClock && srcRef.current && isContextUsable(ctxClock)) {
        t = computePlaybackTime(
          offsetRef.current,
          ctxClock.currentTime,
          startedAtRef.current,
          clampDuration(),
        );
      }
      const wasPlaying = isPlayingRef.current;
      pcmRef.current = pcm;
      partialBufferRef.current = false;
      const ctx = await ensureContext(false);
      bufferRef.current = await pcmToAudioBufferAsync(ctx, pcm);
      pcm.floatChannels = undefined;
      offsetRef.current = Math.min(t, bufferRef.current.duration);
      setCurrentTime(offsetRef.current);
      tracePlayback("main_source", "pcm upgraded", {
        frames: pcm.samples.length / pcm.ch,
        at: offsetRef.current,
        bufferSec: bufferRef.current.duration,
      });
      if (wasPlaying) {
        void startAtRef.current(offsetRef.current);
      }
    },
    [clampDuration, ensureContext, setCurrentTime],
  );

  const seek = useCallback(
    (seconds: number, _opts?: { start?: boolean }) => {
      const max = clampDuration();
      const clamped = Math.max(0, Math.min(seconds, max || 0));
      offsetRef.current = clamped;
      setCurrentTime(clamped);
      // Only restart when already playing; play-from-pause is handled by the isPlaying effect.
      if (isPlaying) {
        void startAt(clamped);
      }
    },
    [clampDuration, isPlaying, setCurrentTime, startAt],
  );

  useEffect(() => {
    const gain = gainRef.current;
    const ctx = ctxRef.current;
    if (!gain || !isContextUsable(ctx)) return;
    // Short ramp avoids clicks when scrubbing volume (~20ms).
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(volume, now, 0.02 / 3);
  }, [volume]);

  const stopSourceRef = useRef(stopSource);
  stopSourceRef.current = stopSource;

  useEffect(() => {
    if (isPlaying && pcmRef.current) {
      void startAtRef.current(offsetRef.current);
    } else if (!isPlaying) {
      stopSourceRef.current();
      clearGaplessNext();
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      stopSourceRef.current();
      if (isContextUsable(ctxRef.current)) {
        void ctxRef.current.close();
      }
      ctxRef.current = null;
      gainRef.current = null;
      analyserRef.current = null;
      bufferRef.current = null;
    };
  }, [clearGaplessNext]);

  const getPlaybackTime = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && srcRef.current && isContextUsable(ctx)) {
      return computePlaybackTime(
        offsetRef.current,
        ctx.currentTime,
        startedAtRef.current,
        clampDuration(),
      );
    }
    return offsetRef.current;
  }, [clampDuration]);

  const isSourceActive = useCallback(() => srcRef.current !== null, []);

  const hasPcm = useCallback(() => pcmRef.current !== null, []);

  const getAnalysisFrame = useCallback(
    (target: Uint8Array) =>
      readPlaybackAnalysis(analyserRef.current, target, srcRef.current !== null),
    [],
  );

  return {
    loadPcm,
    upgradePcm,
    seek,
    stopSource,
    getPlaybackTime,
    isSourceActive,
    hasPcm,
    getAnalysisFrame,
    prepareGaplessNext,
    clearGaplessNext,
    hasGaplessHandoff,
  };
}
