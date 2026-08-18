import { fetchFile } from "@ffmpeg/util";
import { decodeFailureHint } from "./supportedSources";
import { nextFfmpegJobId, withFfmpegLock } from "./ffmpegLoader";

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

/** Probe input sample rate + channel count via ffmpeg's own stderr. */
async function probeAudioLayout(
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg,
  input: string,
): Promise<{ sampleRate: number; channels: number }> {
  const lines: string[] = [];
  const onLog = ({ message }: { type: string; message: string }) => {
    lines.push(message);
  };
  ffmpeg.on("log", onLog);
  try {
    // `-i` alone prints stream info then exits non-zero; that is fine.
    await ffmpeg.exec(["-hide_banner", "-i", input], 60_000).catch(() => -1);
  } finally {
    ffmpeg.off("log", onLog);
  }
  const audioLine = lines.find((l) => /Stream #.*Audio:/.test(l)) ?? "";
  const rate = Number(audioLine.match(/(\d+)\s*Hz/)?.[1] ?? 0);
  const layout = audioLine.match(/Hz,\s*([^,]+)/)?.[1] ?? "";
  const channels = /mono/.test(layout) ? 1 : 2;
  return {
    sampleRate: rate >= 8000 ? rate : 44100,
    channels,
  };
}

async function decodeWithFfmpegWasm(
  file: File,
  onProgress?: DecodeProgress,
  signal?: AbortSignal,
): Promise<PcmResult> {
  throwIfAborted(signal);
  const jobId = nextFfmpegJobId();
  const input = `in_${jobId}${extOf(file.name)}`;
  const output = `out_${jobId}.pcm`;

  try {
    return await withFfmpegLock(async (ffmpeg) => {
      throwIfAborted(signal);
      onProgress?.("Reading file…");
      await ffmpeg.writeFile(input, await fetchFile(file));
      throwIfAborted(signal);

      // Preserve the source layout: an unsolicited 44.1 kHz stereo resample
      // was silently degrading 48 kHz (and any non-44.1) sources. Only
      // downmix >2 channels or lift absurd rates (< 8 kHz unsupported by the
      // CodecId 6 header).
      const probe = await probeAudioLayout(ffmpeg, input);
      const outRate = probe.sampleRate;
      const outCh = probe.channels;

      onProgress?.("Transcoding to PCM (FFmpeg)…");
      const args = ["-i", input, "-vn", "-f", "s16le", "-acodec", "pcm_s16le"];
      if (outCh === 1) args.push("-ac", "1");
      else args.push("-ac", "2");
      args.push("-ar", String(outRate), output);
      const exit = await ffmpeg.exec(args, 300_000);
      if (exit !== 0) {
        throw new Error(`${decodeFailureHint(file.name)} (FFmpeg exit ${exit}).`);
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

      const copy = bytes.slice();
      const samples = new Int16Array(copy.buffer, copy.byteOffset, copy.byteLength / 2);
      return {
        samples,
        sampleRate: outRate,
        channels: outCh,
        metadata: { title: file.name.replace(/\.[^.]+$/, "") },
      };
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/FFmpeg exit|produced no audio|could not load/i.test(msg)) throw e instanceof Error ? e : new Error(msg);
    throw new Error(
      `FFmpeg could not load (${msg}). Refresh the page, check your network, or use WAV. Hosted demos need FFmpeg WASM assets in the build.`,
    );
  }
}
