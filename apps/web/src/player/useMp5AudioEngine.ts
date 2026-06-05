import { useCallback, useEffect, useRef } from "react";
import { tracePlayback } from "../lib/playback/playbackTrace";
import { computePlaybackTime } from "./playbackTime";

interface PcmData {
  samples: Int16Array;
  rate: number;
  ch: number;
}

interface Options {
  volume: number;
  isPlaying: boolean;
  duration: number;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  onTrackEnded?: () => void;
  onPcmReady?: () => void;
}

function pcmToAudioBuffer(ctx: AudioContext, pcm: PcmData): AudioBuffer {
  const { samples, rate, ch } = pcm;
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
  onPcmReady,
}: Options) {
  const onTrackEndedRef = useRef(onTrackEnded);
  onTrackEndedRef.current = onTrackEnded;
  const onPcmReadyRef = useRef(onPcmReady);
  onPcmReadyRef.current = onPcmReady;
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const pcmRef = useRef<PcmData | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startGenRef = useRef(0);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const rebuildBuffer = useCallback((ctx: AudioContext) => {
    if (!pcmRef.current) return;
    bufferRef.current = pcmToAudioBuffer(ctx, pcmRef.current);
  }, []);

  const ensureContext = useCallback(async () => {
    if (!isContextUsable(ctxRef.current)) {
      ctxRef.current = new AudioContext();
      const gain = ctxRef.current.createGain();
      gain.gain.value = volumeRef.current;
      gain.connect(ctxRef.current.destination);
      gainRef.current = gain;
      rebuildBuffer(ctxRef.current);
    }
    if (ctxRef.current.state === "suspended") {
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
        duration,
      );
    }
    try {
      srcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    srcRef.current = null;
    tracePlayback("main_source", "stop");
  }, [duration]);

  const startAt = useCallback(
    async (offset: number) => {
      if (!pcmRef.current) {
        tracePlayback("main_source", "start skipped — no PCM");
        return;
      }
      const gen = ++startGenRef.current;
      stopSource();
      const ctx = await ensureContext();
      if (gen !== startGenRef.current) return;
      if (!bufferRef.current) {
        rebuildBuffer(ctx);
      }
      if (!bufferRef.current || !gainRef.current) return;

      const gain = gainRef.current;
      gain.gain.value = volumeRef.current;

      const src = ctx.createBufferSource();
      src.buffer = bufferRef.current;
      src.connect(gain);
      offsetRef.current = offset;
      startedAtRef.current = ctx.currentTime;
      src.onended = () => {
        if (srcRef.current !== src) return;
        srcRef.current = null;
        const naturalEnd = duration > 0;
        offsetRef.current = duration;
        setCurrentTime(duration);
        setPlaying(false);
        if (naturalEnd) {
          onTrackEndedRef.current?.();
        }
      };
      if (gen !== startGenRef.current) {
        try {
          src.stop();
        } catch {
          /* not started */
        }
        return;
      }
      src.start(0, offset);
      srcRef.current = src;
      tracePlayback("main_source", "start", { offset, bufferSec: bufferRef.current.duration });
    },
    [duration, ensureContext, rebuildBuffer, setCurrentTime, setPlaying, stopSource],
  );

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;

  const loadPcm = useCallback(
    async (pcm: PcmData) => {
      pcmRef.current = pcm;
      stopSource();
      const ctx = await ensureContext();
      bufferRef.current = pcmToAudioBuffer(ctx, pcm);
      offsetRef.current = 0;
      tracePlayback("main_source", "pcm loaded", {
        frames: pcm.samples.length / pcm.ch,
        rate: pcm.rate,
        bufferSec: bufferRef.current.duration,
      });
      onPcmReadyRef.current?.();
      if (isPlayingRef.current) {
        void startAtRef.current(offsetRef.current);
      }
    },
    [ensureContext, stopSource],
  );

  const seek = useCallback(
    (seconds: number, _opts?: { start?: boolean }) => {
      const clamped = Math.max(0, Math.min(seconds, duration || 0));
      offsetRef.current = clamped;
      setCurrentTime(clamped);
      // Only restart when already playing; play-from-pause is handled by the isPlaying effect.
      if (isPlaying) {
        void startAt(clamped);
      }
    },
    [duration, isPlaying, setCurrentTime, startAt],
  );

  useEffect(() => {
    if (gainRef.current && isContextUsable(ctxRef.current)) {
      gainRef.current.gain.value = volume;
    }
  }, [volume]);

  const stopSourceRef = useRef(stopSource);
  stopSourceRef.current = stopSource;

  useEffect(() => {
    if (isPlaying && pcmRef.current) {
      void startAtRef.current(offsetRef.current);
    } else if (!isPlaying) {
      stopSourceRef.current();
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
      bufferRef.current = null;
    };
  }, []);

  const getPlaybackTime = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && srcRef.current && isContextUsable(ctx)) {
      return computePlaybackTime(
        offsetRef.current,
        ctx.currentTime,
        startedAtRef.current,
        duration,
      );
    }
    return offsetRef.current;
  }, [duration]);

  const isSourceActive = useCallback(() => srcRef.current !== null, []);

  const hasPcm = useCallback(() => pcmRef.current !== null, []);

  return { loadPcm, seek, stopSource, getPlaybackTime, isSourceActive, hasPcm };
}
