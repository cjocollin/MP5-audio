import { fetchFile } from "@ffmpeg/util";
import { decodeFailureHint } from "./supportedSources";
import { getFfmpeg } from "./ffmpegLoader";

export interface PcmResult {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  metadata: Record<string, string>;
}

export type DecodeProgress = (message: string) => void;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Conversion cancelled", "AbortError");
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : ".bin";
}

function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

function interleaveChannels(channels: Float32Array[], length: number): Int16Array {
  const ch = channels.length;
  const out = new Int16Array(length * ch);
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!));
      out[i * ch + c] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    }
  }
  return out;
}

/** Fast path for WAV via Web Audio API (no FFmpeg download). */
async function tryDecodeWav(file: File, onProgress?: DecodeProgress): Promise<PcmResult | null> {
  if (extOf(file.name) !== ".wav") return null;
  onProgress?.("Decoding WAV…");
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const channelData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) {
      channelData.push(buffer.getChannelData(c));
    }
    const samples =
      channels === 1
        ? floatToInt16(channelData[0]!)
        : interleaveChannels(channelData, length);
    return {
      samples,
      sampleRate: buffer.sampleRate,
      channels,
      metadata: { title: file.name.replace(/\.[^.]+$/, "") },
    };
  } catch {
    return null;
  } finally {
    await ctx.close();
  }
}

export async function decodeSourceToPcm(
  file: File,
  onProgress?: DecodeProgress,
  signal?: AbortSignal,
): Promise<PcmResult> {
  if (isTauri()) {
    throw new Error("Native FFmpeg in Tauri is not configured in this build. Use WAV upload or web build.");
  }

  throwIfAborted(signal);
  const wav = await tryDecodeWav(file, onProgress);
  if (wav) return wav;

  return decodeWithFfmpegWasm(file, onProgress, signal);
}

async function decodeWithFfmpegWasm(
  file: File,
  onProgress?: DecodeProgress,
  signal?: AbortSignal,
): Promise<PcmResult> {
  throwIfAborted(signal);
  let ffmpeg;
  try {
    ffmpeg = await getFfmpeg(onProgress);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `FFmpeg could not load (${msg}). Refresh the page, check your network, or use WAV. Hosted demos need FFmpeg WASM assets in the build.`,
    );
  }
  throwIfAborted(signal);

  const input = `input${extOf(file.name)}`;
  const output = "out.pcm";

  onProgress?.("Reading file…");
  await ffmpeg.writeFile(input, await fetchFile(file));
  throwIfAborted(signal);

  onProgress?.("Transcoding to PCM (FFmpeg)…");
  const exit = await ffmpeg.exec(
    ["-i", input, "-vn", "-f", "s16le", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2", output],
    300_000,
  );
  if (exit !== 0) {
    throw new Error(
      `${decodeFailureHint(file.name)} (FFmpeg exit ${exit}).`,
    );
  }

  const data = await ffmpeg.readFile(output);
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
  if (bytes.byteLength < 2) {
    throw new Error("FFmpeg produced no audio output.");
  }

  try {
    await ffmpeg.deleteFile(input);
    await ffmpeg.deleteFile(output);
  } catch {
    /* ignore cleanup errors */
  }

  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  return {
    samples,
    sampleRate: 44100,
    channels: 2,
    metadata: { title: file.name.replace(/\.[^.]+$/, "") },
  };
}
