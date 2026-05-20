import { useCallback, useEffect, useRef } from "react";
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
}: Options) {
  const onTrackEndedRef = useRef(onTrackEnded);
  onTrackEndedRef.current = onTrackEnded;
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const pcmRef = useRef<PcmData | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
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
    }
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
  }, [duration]);

  const startAt = useCallback(
    async (offset: number) => {
      if (!pcmRef.current) return;
      stopSource();
      const ctx = await ensureContext();
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
      src.start(0, offset);
      srcRef.current = src;
    },
    [duration, ensureContext, rebuildBuffer, setCurrentTime, setPlaying, stopSource],
  );

  const loadPcm = useCallback(
    async (pcm: PcmData) => {
      pcmRef.current = pcm;
      stopSource();
      const ctx = await ensureContext();
      bufferRef.current = pcmToAudioBuffer(ctx, pcm);
      offsetRef.current = 0;
    },
    [ensureContext, stopSource],
  );

  const seek = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(seconds, duration || 0));
      offsetRef.current = clamped;
      setCurrentTime(clamped);
      if (srcRef.current || isPlaying) {
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

  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;

  const stopSourceRef = useRef(stopSource);
  stopSourceRef.current = stopSource;

  useEffect(() => {
    if (isPlaying && pcmRef.current) {
      void startAtRef.current(offsetRef.current);
    } else {
      stopSourceRef.current();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      const ctx = ctxRef.current;
      if (ctx && srcRef.current && isContextUsable(ctx)) {
        const t = computePlaybackTime(
          offsetRef.current,
          ctx.currentTime,
          startedAtRef.current,
          duration,
        );
        setCurrentTime(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, duration, setCurrentTime]);

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

  return { loadPcm, seek, stopSource };
}
