import { useEffect, useRef, useState } from "react";

import { requestPlaybackAudioFocus } from "../lib/playback/audioFocus";
import { decodeMp5ToPcmOffthread } from "../player/mixDecodeWorkerClient";
import { formatPlaybackTime } from "../player/playlistUtils";
import {
  int16ToPlanarFloatAsync,
  planarFloatToAudioBuffer,
} from "../player/pcmConvert";

type AuditionSide = "source" | "export";

type AuditionPcm = {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
};

interface Props {
  source: AuditionPcm;
  exportFile: File;
}

export function clampAuditionTime(value: number, duration: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), Math.max(duration, 0));
}

export function auditionGains(side: AuditionSide): readonly [number, number] {
  return side === "source" ? [1, 0] : [0, 1];
}

export function auditionDuration(sourceDuration: number, exportDuration: number): number {
  return Math.max(0, Math.min(sourceDuration, exportDuration));
}

export function auditionTimeline(offset: number, elapsed: number, duration: number): number {
  return clampAuditionTime(offset + Math.max(elapsed, 0), duration);
}

export function ConverterAuditionPanel({ source, exportFile }: Props) {
  const contextRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<readonly [AudioBuffer, AudioBuffer] | null>(null);
  const gainsRef = useRef<readonly [GainNode, GainNode] | null>(null);
  const playingRef = useRef<readonly [AudioBufferSourceNode, AudioBufferSourceNode] | null>(null);
  const offsetRef = useRef(0);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);
  const activeSideRef = useRef<AuditionSide>("source");
  const mountedRef = useRef(true);
  const [activeSide, setActiveSide] = useState<AuditionSide>("source");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function stopSources() {
    const nodes = playingRef.current;
    playingRef.current = null;
    if (!nodes) return;
    for (const node of nodes) {
      node.onended = null;
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
      node.disconnect();
    }
  }

  async function ensureAudio(): Promise<AudioContext> {
    if (contextRef.current && buffersRef.current && gainsRef.current) {
      return contextRef.current;
    }
    const context = new AudioContext();
    contextRef.current = context;
    try {
      const sourcePlanar = await int16ToPlanarFloatAsync(source.samples, source.channels);
      const sourceBuffer = planarFloatToAudioBuffer(context, sourcePlanar, source.sampleRate);
      const decoded = await decodeMp5ToPcmOffthread(await exportFile.arrayBuffer());
      if (!mountedRef.current) throw new DOMException("Audition closed", "AbortError");
      const exportPlanar = decoded.floatChannels
        ?? await int16ToPlanarFloatAsync(decoded.samples, decoded.channels);
      const exportBuffer = planarFloatToAudioBuffer(context, exportPlanar, decoded.sampleRate);
      const sharedDuration = auditionDuration(sourceBuffer.duration, exportBuffer.duration);
      if (sharedDuration <= 0) throw new Error("The source or export has no playable audio.");

      const sourceGain = context.createGain();
      const exportGain = context.createGain();
      const [sourceLevel, exportLevel] = auditionGains(activeSideRef.current);
      sourceGain.gain.value = sourceLevel;
      exportGain.gain.value = exportLevel;
      sourceGain.connect(context.destination);
      exportGain.connect(context.destination);
      buffersRef.current = [sourceBuffer, exportBuffer];
      gainsRef.current = [sourceGain, exportGain];
      durationRef.current = sharedDuration;
      setDuration(sharedDuration);
      return context;
    } catch (cause) {
      if (contextRef.current === context) contextRef.current = null;
      await context.close();
      throw cause;
    }
  }

  function startSources(context: AudioContext, offset: number) {
    const buffers = buffersRef.current;
    const gains = gainsRef.current;
    if (!buffers || !gains) return;
    stopSources();
    const startOffset = offset >= durationRef.current ? 0 : offset;
    const remaining = durationRef.current - startOffset;
    const sourceNode = context.createBufferSource();
    const exportNode = context.createBufferSource();
    sourceNode.buffer = buffers[0];
    exportNode.buffer = buffers[1];
    sourceNode.connect(gains[0]);
    exportNode.connect(gains[1]);
    playingRef.current = [sourceNode, exportNode];
    offsetRef.current = startOffset;
    startedAtRef.current = context.currentTime;
    exportNode.onended = () => {
      if (playingRef.current?.[1] !== exportNode) return;
      playingRef.current = null;
      sourceNode.disconnect();
      exportNode.disconnect();
      offsetRef.current = durationRef.current;
      if (mountedRef.current) {
        setCurrentTime(durationRef.current);
        setPlaying(false);
      }
    };
    sourceNode.start(0, startOffset, remaining);
    exportNode.start(0, startOffset, remaining);
    setCurrentTime(startOffset);
    setPlaying(true);
  }

  async function togglePlayback() {
    if (isPlaying) {
      const context = contextRef.current;
      const next = context
        ? auditionTimeline(offsetRef.current, context.currentTime - startedAtRef.current, durationRef.current)
        : offsetRef.current;
      offsetRef.current = next;
      stopSources();
      setCurrentTime(next);
      setPlaying(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      requestPlaybackAudioFocus();
      const context = await ensureAudio();
      await context.resume();
      if (mountedRef.current) startSources(context, offsetRef.current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  function selectSide(side: AuditionSide) {
    activeSideRef.current = side;
    setActiveSide(side);
    const context = contextRef.current;
    const gains = gainsRef.current;
    if (!context || !gains) return;
    const [sourceLevel, exportLevel] = auditionGains(side);
    const now = context.currentTime;
    gains[0].gain.cancelScheduledValues(now);
    gains[1].gain.cancelScheduledValues(now);
    gains[0].gain.setValueAtTime(gains[0].gain.value, now);
    gains[1].gain.setValueAtTime(gains[1].gain.value, now);
    gains[0].gain.linearRampToValueAtTime(sourceLevel, now + 0.02);
    gains[1].gain.linearRampToValueAtTime(exportLevel, now + 0.02);
  }

  function seek(value: number) {
    const next = clampAuditionTime(value, durationRef.current);
    offsetRef.current = next;
    setCurrentTime(next);
    const context = contextRef.current;
    if (!isPlaying || !context) return;
    if (next >= durationRef.current) {
      stopSources();
      setPlaying(false);
    } else {
      startSources(context, next);
    }
  }

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      const context = contextRef.current;
      if (!context) return;
      setCurrentTime(auditionTimeline(
        offsetRef.current,
        context.currentTime - startedAtRef.current,
        durationRef.current,
      ));
    }, 100);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => () => {
    mountedRef.current = false;
    stopSources();
    for (const gain of gainsRef.current ?? []) gain.disconnect();
    void contextRef.current?.close();
  }, []);

  return (
    <section
      className="rounded-xl border border-white/10 bg-black/15 p-4 space-y-3 text-sm"
      aria-labelledby="converter-audition-title"
      data-testid="converter-audition"
    >
      <div>
        <h3 id="converter-audition-title" className="font-medium text-gray-100">Compare source and MP5</h3>
        <p className="mt-1 text-xs text-gray-500">One shared timeline makes level-matched switching immediate.</p>
      </div>
      <div className="flex gap-2" role="group" aria-label="Audition version">
        {(["source", "export"] as const).map((side) => (
          <button
            key={side}
            type="button"
            className={`min-h-9 flex-1 rounded-lg border px-3 text-xs font-semibold ${activeSide === side ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-gray-400 hover:bg-white/5"}`}
            aria-pressed={activeSide === side}
            onClick={() => selectSide(side)}
          >
            {side === "source" ? "Source" : "Exported MP5"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="min-h-10 rounded-lg bg-accent px-4 text-xs font-semibold text-black disabled:opacity-40"
          onClick={() => void togglePlayback()}
          disabled={loading}
          aria-label={isPlaying ? "Pause comparison" : "Play comparison"}
        >
          {loading ? "Preparing…" : isPlaying ? "Pause" : "Play"}
        </button>
        <input
          className="min-w-0 flex-1 accent-[var(--mp5-accent-bright)]"
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(currentTime, duration || 0)}
          aria-label="Audition position"
          disabled={!duration}
          onChange={(event) => seek(Number(event.currentTarget.value))}
        />
        <span className="min-w-20 text-right font-mono text-xs text-gray-400">
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">{loading ? "Preparing source and MP5 audio." : ""}</p>
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
    </section>
  );
}
