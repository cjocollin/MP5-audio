#!/usr/bin/env node
/**
 * Synthetic compatibility fixtures (no copyrighted audio).
 * WAV: always generated. FLAC/MP3/M4A/OGG: when `ffmpeg` is on PATH.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { synthTone, writeWavPcm } from "./lib/wav-writer.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test-fixtures", "compatibility");
mkdirSync(outDir, { recursive: true });

const { CodecId, writeMp5, crc32, metaFieldsFromRecord } = await import(
  pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href
);

const wasmDir = join(root, "apps/web/src/wasm/pkg");
const mod = await import(pathToFileURL(join(wasmDir, "mp5_codec.js")).href);
await mod.default(readFileSync(join(wasmDir, "mp5_codec_bg.wasm")));

const manifest = { generated: new Date().toISOString(), wav: [], compressed: [], mp5: [] };

function writeChunk(fourcc, payload, withCrc = true) {
  const header = new Uint8Array(16);
  const hv = new DataView(header.buffer);
  for (let i = 0; i < 4; i++) header[i] = fourcc.charCodeAt(i);
  hv.setUint32(4, payload.length, true);
  if (withCrc) {
    hv.setUint16(8, 1, true);
    hv.setUint32(12, crc32(payload), true);
  }
  const out = new Uint8Array(header.length + payload.length);
  out.set(header, 0);
  out.set(payload, header.length);
  return out;
}

function peaks(samples, ch) {
  const frames = samples.length / ch;
  const peaks = [];
  const step = Math.max(1, Math.floor(frames / 64));
  for (let i = 0; i < frames; i += step) {
    let max = 0;
    for (let c = 0; c < ch; c++) max = Math.max(max, Math.abs(samples[i * ch + c] ?? 0));
    peaks.push(max / 32768);
  }
  return peaks;
}

function writeMp5Tone(name, opts) {
  const { samples, sampleRate, channels, codecId, bitstream, meta, corr, optional } = opts;
  const totalSamples = BigInt(samples.length / channels);
  const buf = writeMp5({
    head: {
      codecId,
      channels,
      bitsPerSample: 16,
      presetId: codecId === CodecId.MP5C ? 2 : 0,
      sampleRate,
      totalSamples,
      encoderVersion: 1,
    },
    meta: metaFieldsFromRecord(meta ?? { title: name, artist: "MP5 Compatibility" }),
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: bitstream }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: peaks(samples, channels),
    corr,
    optional,
    info: [{ key: "encoder", value: "compatibility fixture" }],
  });
  const path = join(outDir, name);
  writeFileSync(path, buf);
  manifest.mp5.push({ file: name, bytes: buf.length, codecId });
  console.log(`Wrote ${path} (${buf.length} bytes)`);
}

// --- WAV sources ---
const wavDefs = [
  { file: "wav_mono_44k_short.wav", sr: 44100, ch: 1, sec: 1.5 },
  { file: "wav_stereo_44k_short.wav", sr: 44100, ch: 2, sec: 1.5 },
  { file: "wav_mono_48k_short.wav", sr: 48000, ch: 1, sec: 1.0 },
  { file: "wav_stereo_48k_short.wav", sr: 48000, ch: 2, sec: 1.0 },
  { file: "wav_stereo_44k_long.wav", sr: 44100, ch: 2, sec: 3.0 },
];

const masterWav = join(outDir, "wav_stereo_44k_short.wav");

for (const def of wavDefs) {
  const samples = synthTone({
    sampleRate: def.sr,
    channels: def.ch,
    durationSec: def.sec,
    freqHz: def.ch === 1 ? 440 : 523,
  });
  const wav = writeWavPcm({ samples, sampleRate: def.sr, channels: def.ch });
  const path = join(outDir, def.file);
  writeFileSync(path, wav);
  manifest.wav.push({ file: def.file, sampleRate: def.sr, channels: def.ch, durationSec: def.sec });
  console.log(`Wrote ${path}`);
}

function hasFfmpeg() {
  try {
    return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

if (hasFfmpeg()) {
  const compressed = [
    { out: "flac_stereo_44k_short.flac", args: ["-c:a", "flac"] },
    { out: "mp3_stereo_44k_short.mp3", args: ["-c:a", "libmp3lame", "-b:a", "128k"] },
    { out: "m4a_stereo_44k_short.m4a", args: ["-c:a", "aac", "-b:a", "128k"] },
    { out: "ogg_opus_44k_short.ogg", args: ["-c:a", "libopus", "-b:a", "96k"] },
  ];
  for (const { out, args } of compressed) {
    const dest = join(outDir, out);
    const r = spawnSync(
      "ffmpeg",
      ["-y", "-i", masterWav, ...args, dest],
      { stdio: "pipe" },
    );
    if (r.status === 0 && existsSync(dest)) {
      manifest.compressed.push({ file: out, ok: true });
      console.log(`Wrote ${dest}`);
    } else {
      manifest.compressed.push({ file: out, ok: false, note: "ffmpeg encode failed" });
    }
  }
} else {
  manifest.compressed.push({
    note: "ffmpeg not on PATH — FLAC/MP3/M4A/OGG fixtures skipped (WAV tests still run)",
  });
}

// --- MP5 player / metadata fixtures ---
const baseSamples = synthTone({ sampleRate: 44100, channels: 1, durationSec: 1.0 });
const mp5l = mod.encode_mp5l(baseSamples, 1);
const mp5c = mod.encode_mp5c(baseSamples, 1, 2);
const mp5hWrapped = mod.encode_mp5h(baseSamples, 1, 2);
let mp5hBase = mp5hWrapped;
let mp5hCorr;
if (mp5hWrapped[0] === 0x48) {
  const baseLen = new DataView(mp5hWrapped.buffer).getUint32(2, true);
  mp5hBase = mp5hWrapped.slice(6, 6 + baseLen);
  const corrOff = 6 + baseLen;
  const corrLen = new DataView(mp5hWrapped.buffer).getUint32(corrOff, true);
  mp5hCorr = mp5hWrapped.slice(corrOff + 4, corrOff + 4 + corrLen);
}

const tinyPng = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

writeMp5Tone("mp5l_metadata_full.mp5", {
  samples: baseSamples,
  sampleRate: 44100,
  channels: 1,
  codecId: CodecId.MP5L,
  bitstream: mp5l,
  meta: {
    title: "Compat 🎵 Track",
    artist: 'Artist: "Quoted" / Slash',
    album: "Compatibility Suite",
    genre: "Test",
  },
});

writeMp5Tone("mp5l_missing_artist.mp5", {
  samples: baseSamples,
  sampleRate: 44100,
  channels: 1,
  codecId: CodecId.MP5L,
  bitstream: mp5l,
  meta: { title: "No Artist Title" },
});

writeMp5Tone("mp5l_missing_title.mp5", {
  samples: baseSamples,
  sampleRate: 44100,
  channels: 1,
  codecId: CodecId.MP5L,
  bitstream: mp5l,
  meta: { artist: "Artist Only" },
});

writeMp5Tone("mp5l_long_title.mp5", {
  samples: baseSamples,
  sampleRate: 44100,
  channels: 1,
  codecId: CodecId.MP5L,
  bitstream: mp5l,
  meta: { title: "A".repeat(180), artist: "Long Title Test" },
});

const withCover = writeMp5({
  head: {
    codecId: CodecId.MP5L,
    channels: 1,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate: 44100,
    totalSamples: BigInt(baseSamples.length),
    encoderVersion: 1,
  },
  meta: metaFieldsFromRecord({ title: "With cover", artist: "Compat" }),
  cover: { mime: "image/png", data: tinyPng },
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: mp5l }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaks(baseSamples, 1),
});
writeFileSync(join(outDir, "mp5l_with_cover.mp5"), withCover);
manifest.mp5.push({ file: "mp5l_with_cover.mp5", bytes: withCover.length });

writeMp5Tone("mp5c_lab.mp5", {
  samples: baseSamples,
  sampleRate: 44100,
  channels: 1,
  codecId: CodecId.MP5C,
  bitstream: mp5c,
  meta: { title: "MP5-C lab fixture", artist: "Compat" },
});

writeMp5Tone("mp5h_with_corr.mp5", {
  samples: baseSamples,
  sampleRate: 44100,
  channels: 1,
  codecId: CodecId.MP5H,
  bitstream: mp5hBase,
  corr: mp5hCorr ? [{ frameIndex: 0, data: mp5hCorr }] : undefined,
  meta: { title: "MP5-H with CORR", artist: "Compat" },
});

writeMp5Tone("mp5h_no_corr.mp5", {
  samples: baseSamples,
  sampleRate: 44100,
  channels: 1,
  codecId: CodecId.MP5H,
  bitstream: mp5hBase,
  meta: { title: "MP5-H base only", artist: "Compat" },
});

const valid = writeMp5({
  head: {
    codecId: CodecId.MP5L,
    channels: 1,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate: 44100,
    totalSamples: BigInt(baseSamples.length),
    encoderVersion: 1,
  },
  meta: metaFieldsFromRecord({ title: "Truncated" }),
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: mp5l }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaks(baseSamples, 1),
});
writeFileSync(join(outDir, "corrupt_truncated.mp5"), valid.slice(0, Math.floor(valid.length * 0.4)));
manifest.mp5.push({ file: "corrupt_truncated.mp5", corrupt: true });

const futr = new TextEncoder().encode("compat-unknown");
const futrChunk = writeChunk("FUTR", futr);
const baseUnknown = writeMp5({
  head: {
    codecId: CodecId.MP5L,
    channels: 1,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate: 44100,
    totalSamples: BigInt(baseSamples.length),
    encoderVersion: 1,
  },
  meta: metaFieldsFromRecord({ title: "Unknown chunk", artist: "Compat" }),
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: mp5l }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaks(baseSamples, 1),
});
const unknownCombined = new Uint8Array(baseUnknown.length + futrChunk.length);
unknownCombined.set(baseUnknown, 0);
unknownCombined.set(futrChunk, baseUnknown.length);
writeFileSync(join(outDir, "mp5l_unknown_futr.mp5"), unknownCombined);
manifest.mp5.push({ file: "mp5l_unknown_futr.mp5", unknownChunk: "FUTR" });

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("\nCompatibility fixtures ready in test-fixtures/compatibility/");
