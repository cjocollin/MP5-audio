// Error-stationarity probe: per-frame error RMS over the intro for C6 vs LAME,
// plus amplified error-signal WAVs for direct listening, plus unit timeline.
import { readFileSync, writeFileSync } from "node:fs";
import { loadCodec } from "../tools/audio-lab/wasm.mjs";
import { decodeMp5FileToPcm, parseMp5File } from "../tools/audio-lab/mp5file.mjs";

const SR = 48000;
const codec = await loadCodec();
const [, , srcPath, c6Path, lamePath] = process.argv;

function loadRaw(p) {
  const b = readFileSync(p);
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
}
const src = loadRaw(srcPath);
const lame = loadRaw(lamePath);
const c6 = decodeMp5FileToPcm(codec, c6Path).samples;
const N = Math.min(src.length, lame.length, c6.length);

// ---- per-2048-frame error RMS (stereo), 0-10s; report dB spread + dump series
function frameErr(dec, off) {
  const out = [];
  const frames = Math.floor((10 * SR) / 2048);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < 2048; i++) {
      const idx = (f * 2048 + i) * 2;
      const d0 = src[idx] - dec[idx + off], d1 = src[idx + 1] - dec[idx + 1 + off];
      e += d0 * d0 + d1 * d1;
    }
    out.push(10 * Math.log10(Math.max(e / 4096, 1e-9) / (32768 * 32768)) ); // dBFS RMS
  }
  return out;
}
const ec = frameErr(c6, 0), el = frameErr(lame, 0);
function stats(x, label) {
  const mn = Math.min(...x), mx = Math.max(...x);
  const mean = x.reduce((a, b) => a + b, 0) / x.length;
  // frame-to-frame delta
  const deltas = x.slice(1).map((v, i) => Math.abs(v - x[i]));
  const d95 = deltas.sort((a, b) => a - b)[Math.floor(deltas.length * 0.95)];
  console.log(`${label}: err RMS mean ${mean.toFixed(1)} dBFS, range [${mn.toFixed(1)}, ${mx.toFixed(1)}], p95 frame-to-frame jump ${d95.toFixed(1)} dB`);
}
console.log("per-frame (2048 = 42.7ms) error RMS, 0-10s:");
stats(ec, "C6  ");
stats(el, "LAME");
// dump first 100 frames for shape inspection
console.log("\nframe err dBFS (first 64 frames, 0-2.7s):");
console.log("C6  : " + ec.slice(0, 64).map((v) => v.toFixed(0)).join(" "));
console.log("LAME: " + el.slice(0, 64).map((v) => v.toFixed(0)).join(" "));

// ---- amplified error WAVs (0-30s), +36 dB, for direct listening
function errWav(dec, off, path) {
  const n = 30 * SR * 2;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  const GAIN = 64; // +36 dB
  for (let i = 0; i < n; i++) {
    let v = (src[i] - dec[i + off]) * GAIN;
    v = Math.max(-32768, Math.min(32767, v));
    buf.writeInt16LE(v, 44 + i * 2);
  }
  writeFileSync(path, buf);
}
errWav(c6, 0, ".tmp-analysis/error-c6-intro.wav");
errWav(lame, 0, ".tmp-analysis/error-lame-intro.wav");
console.log("\nwrote .tmp-analysis/error-c6-intro.wav and error-lame-intro.wav (error signal x64, 0-30s)");

// ---- unit timeline for the C6 file (intro region)
const audi = parseMp5File(c6Path).audioFrames?.[0]?.data;
const TAGS = { 0x4c: "L", 0x42: "B", 0x4d: "M" };
let pos = 28, frame = 0;
const FR_PER_SEC = SR / 1024;
let line = "";
while (pos + 9 <= audi.length && frame < 30 * FR_PER_SEC) {
  const tag = audi[pos];
  const nf = audi[pos + 1] | (audi[pos + 2] << 8) | (audi[pos + 3] << 16) | (audi[pos + 4] << 24);
  const len = (audi[pos + 5] | (audi[pos + 6] << 8) | (audi[pos + 7] << 16) | (audi[pos + 8] << 24)) >>> 0;
  line += TAGS[tag] ?? "?";
  frame += nf;
  pos += 9 + len + 4;
}
console.log(`\nunit tags, intro (~${(30 * FR_PER_SEC) | 0} frames):`);
console.log(line);
