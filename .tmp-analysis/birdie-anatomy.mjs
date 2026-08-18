// Anatomy of one C6 birdie: what does the source/error do around t=12.10s,
// how big is the energy rise, and does the encoder switch windows there?
import { readFileSync } from "node:fs";
import { loadCodec } from "../tools/audio-lab/wasm.mjs";
import { decodeMp5FileToPcm, parseMp5File } from "../tools/audio-lab/mp5file.mjs";

const SR = 48000;
const codec = await loadCodec();
const [, , srcPath, c6Path] = process.argv;

const b = readFileSync(srcPath);
const src = new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
const c6 = decodeMp5FileToPcm(codec, c6Path).samples;

// --- energy envelope (5.3ms hops, ch0) around 11.5-13.0s
console.log("t(s) | src dB | err dB (C6)");
const hop = 256;
for (let t = 11.5; t < 13.0; t += hop / SR * 4) {
  const c = Math.floor(t * SR);
  let s = 0, e = 0;
  for (let i = 0; i < hop * 4; i++) {
    const v = src[(c + i) * 2] / 32768;
    const d = (src[(c + i) * 2] - c6[(c + i) * 2]) / 32768;
    s += v * v; e += d * d;
  }
  console.log(
    `${t.toFixed(3)} | ${(10 * Math.log10(s / (hop * 4) + 1e-12)).toFixed(1)} | ${(10 * Math.log10(e / (hop * 4) + 1e-12)).toFixed(1)}`
  );
}

// --- per-frame (2048) energy rise across the intro: how big are beat rises?
console.log("\nframe-to-frame energy rise at birdie timestamps:");
for (const t of [12.02, 12.10, 12.26, 12.45, 13.38, 14.99, 15.14, 15.34, 16.37, 18.02, 21.10, 22.37, 24.01]) {
  const f = Math.floor((t * SR) / 2048);
  function fe(k) {
    let s = 0;
    for (let i = 0; i < 2048; i++) { const v = src[(k * 2048 + i) * 2] / 32768; s += v * v; }
    return s / 2048;
  }
  const rise = 10 * Math.log10(fe(f) / Math.max(fe(f - 1), 1e-12));
  const rise2 = 10 * Math.log10(fe(f + 1) / Math.max(fe(f), 1e-12));
  console.log(`t=${t}: rise into frame ${rise.toFixed(1)} dB, next ${rise2.toFixed(1)} dB (threshold for tighten = 6x = 7.8dB)`);
}

// --- short-window usage: scan AUDI payload for inner magics in intro units
const audi = parseMp5File(c6Path).audioFrames?.[0]?.data;
let pos = 28, frame = 0;
const counts = {};
while (pos + 9 <= audi.length) {
  const tag = audi[pos];
  const nf = audi[pos + 1] | (audi[pos + 2] << 8) | (audi[pos + 3] << 16) | (audi[pos + 4] << 24);
  const len = (audi[pos + 5] | (audi[pos + 6] << 8) | (audi[pos + 7] << 16) | (audi[pos + 8] << 24)) >>> 0;
  const t0 = frame / (SR / 1024);
  if (t0 < 30 && tag === 0x4d) {
    // inner magic of the MDCT payload
    const m0 = audi[pos + 9], m1 = audi[pos + 10];
    const key = `0x${m0.toString(16)} 0x${m1.toString(16)}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  frame += nf;
  pos += 9 + len + 4;
}
console.log("\nMDCT payload inner magics in 0-30s:", counts);
