// Wrap a raw CodecId 6 stream into an .mp5 container for app playback,
// with waveform peaks (same algorithm as the app's generateWaveform) so the
// player doesn't have to decode to draw it.
// usage: node wrap-c6.mjs <stream> <decoded.raw> <out.mp5>
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { writeMp5, CodecId } = require("../packages/mp5-container/dist/index.js");

const [, , streamPath, decPath, outPath] = process.argv;
const stream = readFileSync(streamPath);
const raw = readFileSync(decPath);
const samples = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength >> 1);
const SR = 48000;
const PRESET = Number(process.env.PRESET ?? 3);
const FRAMES = Math.floor(samples.length / 2);

// generateWaveform equivalent (1024 points, 0.72 rms + 0.28 peak)
const POINTS = 1024;
const peaks = [];
for (let p = 0; p < POINTS; p++) {
  const start = Math.floor((p / POINTS) * FRAMES);
  const end = Math.floor(((p + 1) / POINTS) * FRAMES);
  let peak = 0, sumSq = 0, n = 0;
  for (let f = start; f < end; f++) {
    for (let ch = 0; ch < 2; ch++) {
      const v = Math.abs(samples[f * 2 + ch] / 32768);
      if (v > peak) peak = v;
      sumSq += v * v; n++;
    }
  }
  peaks.push(Math.sqrt(sumSq / Math.max(n, 1)) * 0.72 + peak * 0.28);
}

const bytes = writeMp5({
  head: {
    codecId: CodecId.MP5C6,
    channels: 2,
    bitsPerSample: 16,
    presetId: PRESET,
    sampleRate: SR,
    totalSamples: BigInt(FRAMES),
    encoderVersion: 4,
  },
  meta: [
    { key: "title", value: "Melanie Martinez - GRUDGES" },
    { key: "artist", value: "Melanie Martinez" },
    { key: "comment", value: "MP5-C6 encoder rev 4 (quiet-passage quality build)" },
  ],
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(stream) }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaks,
  info: [{ key: "encoder", value: "MP5-C6 native c6_ab rev4 (quiet-passage build)" }],
});
writeFileSync(outPath, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
console.log("wrote", outPath, bytes.length, "bytes,", peaks.length, "waveform points");
