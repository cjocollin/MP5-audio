// Shared ffmpeg PCM helpers for the audio lab / LAME harness.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Probe first audio stream + format duration. */
export function probeAudio(source) {
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries",
        "stream=sample_rate,channels,bits_per_raw_sample,bits_per_sample,duration,codec_name",
        "-show_entries", "format=duration",
        "-of", "json",
        source,
      ],
      { encoding: "utf8" },
    ),
  );
  const stream = probe.streams?.[0];
  if (!stream) throw new Error(`no audio stream in ${source}`);
  const sampleRate = Number(stream.sample_rate);
  const channels = Number(stream.channels);
  const bitDepth =
    Number(stream.bits_per_raw_sample || stream.bits_per_sample || 16) || 16;
  const durationSec = Number(stream.duration || probe.format?.duration || 0);
  return {
    sampleRate,
    channels,
    bitDepth,
    durationSec,
    codec: stream.codec_name ?? null,
  };
}

/**
 * Decode any ffmpeg-readable file to interleaved s16le Int16Array.
 * Optional startSec / durationSec extract a window (ffmpeg -ss / -t).
 */
export function decodeToPcm(source, opts = {}) {
  const meta = probeAudio(source);
  const sampleRate = opts.sampleRate ?? meta.sampleRate;
  const channels = opts.channels ?? meta.channels;
  const dir = mkdtempSync(join(tmpdir(), "mp5-pcm-"));
  const raw = join(dir, "audio.raw");
  try {
    const args = ["-v", "error", "-y"];
    if (opts.startSec != null && Number(opts.startSec) > 0) {
      args.push("-ss", String(opts.startSec));
    }
    args.push("-i", source);
    if (opts.durationSec != null && Number(opts.durationSec) > 0) {
      args.push("-t", String(opts.durationSec));
    }
    args.push(
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-ac", String(channels),
      "-ar", String(sampleRate),
      raw,
    );
    execFileSync("ffmpeg", args);
    const buf = readFileSync(raw);
    const samples = new Int16Array(
      buf.buffer,
      buf.byteOffset,
      Math.floor(buf.byteLength / 2),
    ).slice();
    return { samples, channels, sampleRate, bitDepth: 16 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Write interleaved s16le PCM to a temp raw file and encode with libmp3lame. */
export function encodeMp3Lame(samples, channels, sampleRate, bitrateKbps, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mp5-lame-"));
  const raw = join(dir, "in.raw");
  const mp3 = opts.outPath ?? join(dir, "out.mp3");
  try {
    writeFileSync(raw, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
    const args = [
      "-v", "error", "-y",
      "-f", "s16le",
      "-ar", String(sampleRate),
      "-ac", String(channels),
      "-i", raw,
      "-c:a", "libmp3lame",
    ];
    if (opts.vbrQuality != null) {
      args.push("-q:a", String(opts.vbrQuality));
    } else {
      args.push("-b:a", `${bitrateKbps}k`);
    }
    // Strip tags so comparisons are payload-only.
    args.push("-map_metadata", "-1", "-write_xing", "0", mp3);
    execFileSync("ffmpeg", args);
    const bytes = readFileSync(mp3);
    return { bytes, path: mp3, keepTemp: Boolean(opts.outPath), dir };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  } finally {
    if (!opts.outPath) {
      // keep dir until caller decodes; returned for cleanup
    }
  }
}

/** Decode an MP3 (or any file) to PCM; caller should clean up temp dirs from encode. */
export function decodeAudioFileToPcm(source, opts = {}) {
  return decodeToPcm(source, opts);
}

export function cleanupTempDir(dir) {
  if (dir) rmSync(dir, { recursive: true, force: true });
}

/** ffmpeg / libmp3lame version strings for reproducibility headers. */
export function getFfmpegVersions() {
  const text = execFileSync("ffmpeg", ["-version"], { encoding: "utf8" });
  const first = text.split(/\r?\n/)[0] ?? "";
  const lameLine =
    text
      .split(/\r?\n/)
      .find((l) => /libmp3lame|lame/i.test(l)) ?? null;
  // configuration line lists --enable-libmp3lame; extract if present
  const config = text.split(/\r?\n/).find((l) => l.startsWith("configuration:")) ?? "";
  const hasLibmp3lame = /libmp3lame/.test(config) || /libmp3lame/.test(text);
  return {
    ffmpegVersionLine: first.trim(),
    libmp3lameEnabled: hasLibmp3lame,
    libmp3lameNote: hasLibmp3lame
      ? "libmp3lame via ffmpeg (standalone LAME binary not required); version bundled with ffmpeg build — see ffmpegVersionLine / configuration"
      : "libmp3lame NOT detected in ffmpeg -version",
    configurationSnippet: config.includes("libmp3lame")
      ? "--enable-libmp3lame"
      : null,
    rawFirstLines: text.split(/\r?\n/).slice(0, 12),
  };
}
