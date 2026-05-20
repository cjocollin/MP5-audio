#!/usr/bin/env node
/**
 * Generate small synthetic demo fixtures (no copyrighted audio).
 * Requires: pnpm --filter @mp5/container build && pnpm wasm:build
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test-fixtures");
mkdirSync(outDir, { recursive: true });

const { CodecId, writeMp5 } = await import(
  pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href
);

const wasmDir = join(root, "apps/web/src/wasm/pkg");
const mod = await import(pathToFileURL(join(wasmDir, "mp5_codec.js")).href);
await mod.default(readFileSync(join(wasmDir, "mp5_codec_bg.wasm")));

const sampleRate = 44100;
const channels = 1;
const durationSec = 2.0;
const n = Math.floor(sampleRate * durationSec);

function synthTone() {
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = Math.round(
      Math.sin((i * 440 * 2 * Math.PI) / sampleRate) * 8000,
    );
  }
  return samples;
}

function peaksFromSamples(samples, ch) {
  const frames = samples.length / ch;
  const peaks = [];
  const step = Math.max(1, Math.floor(frames / 128));
  for (let i = 0; i < frames; i += step) {
    let max = 0;
    for (let c = 0; c < ch; c++) {
      max = Math.max(max, Math.abs(samples[i * ch + c] ?? 0));
    }
    peaks.push(max / 32768);
  }
  return peaks;
}

const samples = synthTone();
const peaks = peaksFromSamples(samples, channels);
const totalSamples = BigInt(n);

const pcmBytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
const pcmMp5 = writeMp5({
  head: {
    codecId: CodecId.PCM,
    channels,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate,
    totalSamples,
    encoderVersion: 1,
  },
  meta: [
    { key: "title", value: "Demo tone (PCM reference)" },
    { key: "artist", value: "MP5 Alpha Demo" },
  ],
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: pcmBytes }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaks,
  info: [{ key: "encoder", value: "PCM (reference / debug · uncompressed)" }],
});

const mp5lBitstream = mod.encode_mp5l(samples, channels);
if (mp5lBitstream[0] !== 0x4c || mp5lBitstream[1] !== 3) {
  throw new Error(`Expected MP5-L v3, got ${mp5lBitstream[0]} ${mp5lBitstream[1]}`);
}
const mp5lMp5 = writeMp5({
  head: {
    codecId: CodecId.MP5L,
    channels,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate,
    totalSamples,
    encoderVersion: 1,
  },
  meta: [
    { key: "title", value: "Demo tone (MP5-L v3)" },
    { key: "artist", value: "MP5 Alpha Demo" },
  ],
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: mp5lBitstream }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaks,
  info: [{ key: "encoder", value: "MP5-L WASM v3 (lossless · bit-exact)" }],
});

const mp5cBitstream = mod.encode_mp5c(samples, channels, 2);
const mp5cMp5 = writeMp5({
  head: {
    codecId: CodecId.MP5C,
    channels,
    bitsPerSample: 16,
    presetId: 2,
    sampleRate,
    totalSamples,
    encoderVersion: 1,
  },
  meta: [
    { key: "title", value: "Demo tone (MP5-C lab)" },
    { key: "artist", value: "MP5 Alpha Demo" },
  ],
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: mp5cBitstream }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaks,
  info: [{ key: "encoder", value: "MP5-C WASM v5.1 (experimental / lab · may hiss)" }],
});

const files = [
  ["demo_pcm_reference_tone.mp5", pcmMp5],
  ["demo_mp5l_v3_tone.mp5", mp5lMp5],
  ["demo_mp5c_lab_tone.mp5", mp5cMp5],
  ["validation_pcm_slice.mp5", pcmMp5],
  ["validation_mp5l_v3.mp5", mp5lMp5],
];

for (const [name, buf] of files) {
  const path = join(outDir, name);
  writeFileSync(path, buf);
  console.log(`Wrote ${path} (${buf.length} bytes)`);
}

console.log("\nDemo fixtures ready — synthetic 440 Hz tone, no copyrighted material.");
