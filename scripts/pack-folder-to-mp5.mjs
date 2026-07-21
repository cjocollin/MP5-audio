#!/usr/bin/env node
/**
 * Convert standalone FLACs in a folder to MP5-L v4 .mp5 files.
 * Skips stem variants (*Acapella*, *Instrumental*, *Sing-Along*) and existing .mp5.
 *
 *   node scripts/pack-folder-to-mp5.mjs
 *   node scripts/pack-folder-to-mp5.mjs --source "C:\Users\colli\Music\flac-mp5 tests"
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ffmpeg = process.env.FFMPEG_PATH || require("ffmpeg-static") || "ffmpeg";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sourceDir = argValue("--source", "C:\\Users\\colli\\Music\\flac-mp5 tests");
const outDir = argValue("--out", sourceDir);

const STEM_SKIP = /\b(acapella|a[\s_-]?cappella|instrumental|sing[\s_-]?along)\b/i;
const ALREADY_STEM_PACKED = /^(HUNTR X - Takedown|Saja Boys - Your Idol)\.flac$/i;

const {
  CodecId,
  writeMp5,
  parseMp5,
} = await import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);

const wasmDir = join(root, "apps/web/src/wasm/pkg");
const mod = await import(pathToFileURL(join(wasmDir, "mp5_codec.js")).href);
await mod.default(readFileSync(join(wasmDir, "mp5_codec_bg.wasm")));

function peaksFromSamples(samples, ch) {
  const frames = Math.floor(samples.length / ch);
  const peaks = [];
  const step = Math.max(1, Math.floor(frames / 256));
  for (let i = 0; i < frames; i += step) {
    let max = 0;
    for (let c = 0; c < ch; c++) max = Math.max(max, Math.abs(samples[i * ch + c] ?? 0));
    peaks.push(max / 32768);
  }
  return peaks;
}

function decodeFlacToPcm(flacPath) {
  const id = randomBytes(6).toString("hex");
  const pcmPath = join(tmpdir(), `mp5-batch-${id}.pcm`);
  const probe = spawnSync(ffmpeg, ["-hide_banner", "-i", flacPath, "-f", "null", "-"], {
    encoding: "utf8",
  });
  const err = `${probe.stderr || ""}\n${probe.stdout || ""}`;
  const m = err.match(/Audio:\s*[^\n]*?(\d+)\s*Hz[^\n]*?(mono|stereo|(\d+)\s*channels)/i);
  let sampleRate = 48000;
  let channels = 2;
  if (m) {
    sampleRate = parseInt(m[1], 10) || 48000;
    if (/mono/i.test(m[2])) channels = 1;
    else if (/stereo/i.test(m[2])) channels = 2;
    else if (m[3]) channels = parseInt(m[3], 10) || 2;
  }
  const r = spawnSync(
    ffmpeg,
    [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", flacPath, "-vn", "-acodec", "pcm_s16le", "-f", "s16le",
      "-ac", String(channels), "-ar", String(sampleRate), pcmPath,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg decode failed: ${flacPath}\n${r.stderr || r.stdout}`);
  const bytes = readFileSync(pcmPath);
  try { unlinkSync(pcmPath); } catch { /* ignore */ }
  return {
    samples: new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2)),
    sampleRate,
    channels,
  };
}

function extractCoverJpeg(flacPath) {
  const id = randomBytes(6).toString("hex");
  const jpg = join(tmpdir(), `mp5-cover-${id}.jpg`);
  const r = spawnSync(
    ffmpeg,
    ["-y", "-hide_banner", "-loglevel", "error", "-i", flacPath, "-an", "-vcodec", "copy", jpg],
    { encoding: "utf8" },
  );
  if (r.status !== 0 || !existsSync(jpg)) return undefined;
  const data = new Uint8Array(readFileSync(jpg));
  try { unlinkSync(jpg); } catch { /* ignore */ }
  if (data.length < 100) return undefined;
  return { mime: "image/jpeg", data };
}

function metaFromFilename(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/^\d+-/, "").replace(/_01$/, "");
  if (base.includes(" - ")) {
    const [artist, ...rest] = base.split(" - ");
    return { artist: artist.trim(), title: rest.join(" - ").trim() };
  }
  return { artist: "Unknown Artist", title: base.trim() || "Untitled" };
}

function outNameFromFlac(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  // Sanitize Windows-illegal chars but keep readable names
  return `${base.replace(/[<>:"/\\|?*]/g, "_")}.mp5`;
}

function listFlacs(dir) {
  return readdirSync(dir)
    .filter((n) => /\.flac$/i.test(n))
    .filter((n) => !STEM_SKIP.test(n))
    .filter((n) => !ALREADY_STEM_PACKED.test(n))
    .sort((a, b) => a.localeCompare(b));
}

if (!existsSync(join(root, "packages/mp5-container/dist/index.js"))) {
  console.error("Build container first: pnpm --filter @mp5/container build");
  process.exit(1);
}
if (!existsSync(join(wasmDir, "mp5_codec_bg.wasm"))) {
  console.error("Build WASM first: pnpm wasm:build");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const files = listFlacs(sourceDir);
console.log(`Found ${files.length} FLACs to convert in ${sourceDir}`);
console.log("(Skipping stem variants and Takedown/Your Idol — already stem-packed.)\n");

const written = [];
for (let i = 0; i < files.length; i++) {
  const name = files[i];
  const flacPath = join(sourceDir, name);
  const dest = join(outDir, outNameFromFlac(name));
  if (existsSync(dest)) {
    console.log(`[${i + 1}/${files.length}] skip exists: ${basename(dest)}`);
    written.push(dest);
    continue;
  }
  console.log(`[${i + 1}/${files.length}] ${name}`);
  const pcm = decodeFlacToPcm(flacPath);
  const dur = pcm.samples.length / pcm.channels / pcm.sampleRate;
  console.log(`  decode ${pcm.sampleRate}Hz ${pcm.channels}ch ${dur.toFixed(1)}s`);
  const t0 = Date.now();
  const bits = mod.encode_mp5l_v4(pcm.samples, pcm.channels);
  if (bits.length < 2 || bits[0] !== 0x4c || bits[1] !== 4) {
    throw new Error(`Expected MP5-L v4, got ${bits[0]} ${bits[1]} for ${name}`);
  }
  console.log(`  encode v4 ${(bits.length / 1e6).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const { artist, title } = metaFromFilename(name);
  const cover = extractCoverJpeg(flacPath);
  const buf = writeMp5({
    head: {
      codecId: CodecId.MP5L,
      channels: pcm.channels,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: pcm.sampleRate,
      totalSamples: BigInt(Math.floor(pcm.samples.length / pcm.channels)),
      encoderVersion: 1,
    },
    meta: [
      { key: "title", value: title },
      { key: "artist", value: artist },
    ],
    cover,
    audioFrames: [{ frameIndex: 0, timeType: 0, flags: 0, data: bits }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: peaksFromSamples(pcm.samples, pcm.channels),
    info: [{ key: "encoder", value: "MP5-L WASM v4 (lossless · default · bit-exact) · flac-mp5 batch" }],
  });
  writeFileSync(dest, buf);
  const parsed = parseMp5(buf);
  const ver = parsed.audioFrames[0]?.data?.[1];
  console.log(`  wrote ${basename(dest)} (${(buf.length / 1e6).toFixed(2)} MB) v${ver} cover=${cover ? "yes" : "no"}`);
  written.push(dest);
}

console.log("\nDone:");
for (const p of written) console.log(`  ${p}`);