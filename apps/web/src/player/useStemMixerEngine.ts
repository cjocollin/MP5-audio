import { useCallback, useEffect, useRef } from "react";
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

interface Options {
  volume: number;
  isPlaying: boolean;
  duration: number;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  onTrackEnded?: () => void;
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
}: Options) {
  const onTrackEndedRef = useRef(onTrackEnded);
  onTrackEndedRef.current = onTrackEnded;
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const stemGainsRef = useRef<Map<string, GainNode>>(new Map());
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const tracksRef = useRef<StemPcmTrack[]>([]);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const stopAll = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && sourcesRef.current.length) {
      offsetRef.current = computePlaybackTime(
        offsetRef.current,
        ctx.currentTime,
        startedAtRef.current,
        duration,
      );
    }
    for (const src of sourcesRef.current) {
      try {
        src.stop();
      } catch {
        /* */
      }
    }
    sourcesRef.current = [];
  }, [duration]);

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

  const loadTracks = useCallback(
    async (tracks: StemPcmTrack[]) => {
      tracksRef.current = tracks;
      stopAll();
      const ctx = await ensureContext();
      if (!masterGainRef.current) return;

      stemGainsRef.current.clear();
      buffersRef.current.clear();

      for (const t of tracks) {
        const buf = pcmToAudioBuffer(ctx, t);
        buffersRef.current.set(t.id, buf);
        const gain = ctx.createGain();
        gain.gain.value = effectiveGain(tracks, t);
        gain.connect(masterGainRef.current);
        stemGainsRef.current.set(t.id, gain);
      }
      offsetRef.current = 0;
    },
    [ensureContext, stopAll],
  );

  const startAt = useCallback(
    async (offset: number) => {
      const tracks = tracksRef.current;
      if (!tracks.length) return;
      stopAll();
      const ctx = await ensureContext();
      if (!masterGainRef.current) return;

      applyGains();
      masterGainRef.current.gain.value = volumeRef.current;

      const sources: AudioBufferSourceNode[] = [];
      let ended = 0;
      const total = tracks.length;

      for (const t of tracks) {
        const buffer = buffersRef.current.get(t.id);
        const gainNode = stemGainsRef.current.get(t.id);
        if (!buffer || !gainNode) continue;
        if (effectiveGain(tracks, t) <= 0) continue;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gainNode);
        src.onended = () => {
          ended += 1;
          if (ended >= total) {
            sourcesRef.current = [];
            offsetRef.current = duration;
            setCurrentTime(duration);
            setPlaying(false);
            onTrackEndedRef.current?.();
          }
        };
        src.start(0, Math.min(offset, buffer.duration));
        sources.push(src);
      }

      if (!sources.length) return;

      sourcesRef.current = sources;
      offsetRef.current = offset;
      startedAtRef.current = ctx.currentTime;
    },
    [applyGains, duration, ensureContext, setCurrentTime, setPlaying, stopAll],
  );

  const seek = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(seconds, duration || 0));
      offsetRef.current = clamped;
      setCurrentTime(clamped);
      if (sourcesRef.current.length || isPlaying) {
        void startAt(clamped);
      }
    },
    [duration, isPlaying, setCurrentTime, startAt],
  );

  useEffect(() => {
    applyGains();
  }, [applyGains]);

  useEffect(() => {
    if (masterGainRef.current && ctxRef.current?.state !== "closed") {
      masterGainRef.current.gain.value = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (isPlaying && tracksRef.current.length) {
      void startAt(offsetRef.current);
    } else {
      stopAll();
    }
  }, [isPlaying, startAt, stopAll]);

  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      const ctx = ctxRef.current;
      if (ctx && sourcesRef.current.length) {
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
      stopAll();
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, [stopAll]);

  const getPlaybackTime = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && sourcesRef.current.length) {
      return computePlaybackTime(
        offsetRef.current,
        ctx.currentTime,
        startedAtRef.current,
        duration,
      );
    }
    return offsetRef.current;
  }, [duration]);

  return { loadTracks, seek, stopAll, applyGains, getPlaybackTime };
}
