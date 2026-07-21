#!/usr/bin/env node
/**
 * Pack a full-mix FLAC + karaoke / instrumental / acapella FLACs into one .mp5
 * (AUDI = original mix as MP5-L v4; stems = MP5-L v3, matching product encodeStems).
 *
 * Usage:
 *   node scripts/pack-stem-song-mp5.mjs
 *   node scripts/pack-stem-song-mp5.mjs --source "C:\Users\colli\Music\flac-mp5 tests"
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ffmpeg =
  process.env.FFMPEG_PATH ||
  require("ffmpeg-static") ||
  "ffmpeg";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sourceDir = argValue("--source", "C:\\Users\\colli\\Music\\flac-mp5 tests");
const outDir = argValue("--out", sourceDir);

const {
  CodecId,
  writeMp5,
  buildStemOptionalChunks,
  parseMp5,
  decodeStemManifest,
  STEM_DATA_FOURCC,
  validateStemChunks,
} = await import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);

const wasmDir = join(root, "apps/web/src/wasm/pkg");
const mod = await import(pathToFileURL(join(wasmDir, "mp5_codec.js")).href);
await mod.default(readFileSync(join(wasmDir, "mp5_codec_bg.wasm")));

const SONGS = [
  {
    outName: "Takedown.mp5",
    artist: "HUNTR X",
    title: "Takedown",
    album: "KPop Demon Hunters",
    mix: "HUNTR X - Takedown.flac",
    stems: [
      { file: "HUNTR X - Takedown - Sing-Along.flac", stemId: "sing-along", stemName: "Sing-Along", stemType: "custom" },
      { file: "HUNTR X - Takedown - Instrumental.flac", stemId: "instrumental", stemName: "Instrumental", stemType: "instrumental" },
      { file: "HUNTR X - Takedown - Acapella.flac", stemId: "acapella", stemName: "Acapella", stemType: "acapella" },
    ],
  },
  {
    outName: "Your Idol.mp5",
    artist: "Saja Boys",
    title: "Your Idol",
    album: "KPop Demon Hunters",
    mix: "Saja Boys - Your Idol.flac",
    stems: [
      { file: "Saja Boys - Your Idol - Sing-Along.flac", stemId: "sing-along", stemName: "Sing-Along", stemType: "custom" },
      { file: "Saja Boys - Your Idol - Instrumental.flac", stemId: "instrumental", stemName: "Instrumental", stemType: "instrumental" },
      { file: "Saja Boys - Your Idol - Acapella.flac", stemId: "acapella", stemName: "Acapella", stemType: "acapella" },
    ],
  },
];

function peaksFromSamples(samples, ch) {
  const frames = Math.floor(samples.length / ch);
  const peaks = [];
  const step = Math.max(1, Math.floor(frames / 256));
  for (let i = 0; i < frames; i += step) {
    let max = 0;
    for (let c = 0; c < ch; c++) {
      max = Math.max(max, Math.abs(samples[i * ch + c] ?? 0));
    }
    peaks.push(max / 32768);
  }
  return peaks;
}

function decodeFlacToPcm(flacPath) {
  const id = randomBytes(6).toString("hex");
  const pcmPath = join(tmpdir(), `mp5-stem-${id}.pcm`);
  const metaPath = join(tmpdir(), `mp5-stem-${id}.txt`);
  // Probe rate/channels via ffmpeg decode to fixed stereo s16le; keep source rate via -ar from probe.
  const probe = spawnSync(
    ffmpeg,
    ["-hide_banner", "-i", flacPath, "-f", "null", "-"],
    { encoding: "utf8" },
  );
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
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      flacPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-f",
      "s16le",
      "-ac",
      String(channels),
      "-ar",
      String(sampleRate),
      pcmPath,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`ffmpeg decode failed for ${flacPath}: ${r.stderr || r.stdout}`);
  }
  const bytes = readFileSync(pcmPath);
  try {
    unlinkSync(pcmPath);
  } catch {
    /* ignore */
  }
  try {
    unlinkSync(metaPath);
  } catch {
    /* ignore */
  }
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
  try {
    unlinkSync(jpg);
  } catch {
    /* ignore */
  }
  if (data.length < 100) return undefined;
  return { mime: "image/jpeg", data };
}

function packSong(song) {
  const mixPath = join(sourceDir, song.mix);
  if (!existsSync(mixPath)) throw new Error(`Missing mix: ${mixPath}`);
  for (const s of song.stems) {
    const p = join(sourceDir, s.file);
    if (!existsSync(p)) throw new Error(`Missing stem: ${p}`);
  }

  console.log(`\n=== ${song.artist} — ${song.title} ===`);
  console.log(`Decoding mix: ${song.mix}`);
  const mix = decodeFlacToPcm(mixPath);
  const durationSec = mix.samples.length / mix.channels / mix.sampleRate;
  console.log(
    `  ${mix.sampleRate} Hz · ${mix.channels}ch · ${durationSec.toFixed(1)}s · ${(mix.samples.length * 2 / 1e6).toFixed(1)} MB PCM`,
  );

  console.log("Encoding AUDI as MP5-L v4…");
  const t0 = Date.now();
  const mixBits = mod.encode_mp5l_v4(mix.samples, mix.channels);
  if (mixBits.length < 2 || mixBits[0] !== 0x4c || mixBits[1] !== 4) {
    throw new Error(`Expected MP5-L v4 AUDI, got magic ${mixBits[0]} ${mixBits[1]}`);
  }
  console.log(`  AUDI ${(mixBits.length / 1e6).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const bundles = [];
  for (const s of song.stems) {
    console.log(`Decoding stem: ${s.file}`);
    const pcm = decodeFlacToPcm(join(sourceDir, s.file));
    if (pcm.sampleRate !== mix.sampleRate || pcm.channels !== mix.channels) {
      console.warn(
        `  WARN: stem ${pcm.sampleRate}/${pcm.channels} vs mix ${mix.sampleRate}/${mix.channels}`,
      );
    }
    console.log(`Encoding stem ${s.stemName} as MP5-L v3…`);
    const t1 = Date.now();
    const frameData = mod.encode_mp5l(pcm.samples, pcm.channels);
    console.log(`  stem ${(frameData.length / 1e6).toFixed(2)} MB in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
    bundles.push({
      stemId: s.stemId,
      stemName: s.stemName,
      stemType: s.stemType,
      codecId: CodecId.MP5L,
      sampleRate: pcm.sampleRate,
      channels: pcm.channels,
      durationSamples: Math.floor(pcm.samples.length / pcm.channels),
      frameData,
      defaultVolume: 1,
    });
  }

  const { optional, extraChunks, report } = buildStemOptionalChunks(bundles);
  console.log(`Stem storage: ${report.chosenStorage} (${report.fragmentCount ?? 0} fragments)`);

  const cover = extractCoverJpeg(mixPath);
  const peaks = peaksFromSamples(mix.samples, mix.channels);
  const totalSamples = BigInt(Math.floor(mix.samples.length / mix.channels));

  const buf = writeMp5({
    head: {
      codecId: CodecId.MP5L,
      channels: mix.channels,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: mix.sampleRate,
      totalSamples,
      encoderVersion: 1,
    },
    meta: [
      { key: "title", value: song.title },
      { key: "artist", value: song.artist },
      { key: "album", value: song.album },
      { key: "genre", value: "K-Pop" },
    ],
    cover,
    audioFrames: [{ frameIndex: 0, timeType: 0, flags: 0, data: mixBits }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: peaks,
    info: [
      {
        key: "encoder",
        value:
          "MP5-L WASM v4 (AUDI) + MP5-L v3 stems (Sing-Along / Instrumental / Acapella) · flac-mp5 tests pack",
      },
    ],
    optional,
    extraChunks,
  });

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, song.outName);
  writeFileSync(outPath, buf);

  const parsed = parseMp5(buf);
  const manifest = decodeStemManifest(parsed.optional.get("STEM"));
  const check = validateStemChunks(
    manifest,
    parsed.optional.get(STEM_DATA_FOURCC),
    parsed.stdfFragments,
  );
  if (!check.valid) {
    throw new Error(`Stem validation failed for ${song.outName}: ${check.errors.join("; ")}`);
  }
  console.log(
    `Wrote ${outPath} (${(buf.length / 1e6).toFixed(2)} MB) · ${manifest?.stems.length ?? 0} stems · cover=${cover ? "yes" : "no"}`,
  );
  return outPath;
}

if (!existsSync(join(root, "packages/mp5-container/dist/index.js"))) {
  console.error("Build container first: pnpm --filter @mp5/container build");
  process.exit(1);
}
if (!existsSync(join(wasmDir, "mp5_codec_bg.wasm"))) {
  console.error("Build WASM first: pnpm wasm:build");
  process.exit(1);
}

const written = [];
for (const song of SONGS) {
  written.push(packSong(song));
}
console.log("\nDone:");
for (const p of written) console.log(`  ${p}`);
