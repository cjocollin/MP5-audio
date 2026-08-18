// Focused 0-10s analysis: per-250ms SNR + where the error lives spectrally,
// C6 planner-fix build vs LAME-320, against the source.
import { readFileSync } from "node:fs";

const SR = 48000;
const [, , srcPath, c6Path, lamePath] = process.argv;
function loadRaw(p) {
  const b = readFileSync(p);
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
}
const src = loadRaw(srcPath);
const c6 = loadRaw(c6Path);
const lame = loadRaw(lamePath);

// per-250ms window: src RMS, C6 err RMS, LAME err RMS (dBFS)
console.log("t | src | C6 err | LAME err | C6 snr | LAME snr");
for (let t = 0; t < 10; t += 0.25) {
  const from = Math.floor(t * SR) * 2, to = Math.floor((t + 0.25) * SR) * 2;
  let s = 0, eC = 0, eL = 0;
  for (let i = from; i < to; i++) {
    s += src[i] * src[i];
    const dC = src[i] - c6[i]; eC += dC * dC;
    const dL = src[i] - lame[i]; eL += dL * dL;
  }
  const db = (x) => 10 * Math.log10(Math.max(x / (to - from), 1e-12) / (32768 * 32768));
  const sdb = db(s), cdb = db(eC), ldb = db(eL);
  console.log(`${t.toFixed(2).padStart(5)} | ${sdb.toFixed(1).padStart(6)} | ${cdb.toFixed(1).padStart(6)} | ${ldb.toFixed(1).padStart(6)} | ${(sdb - cdb).toFixed(1)} | ${(sdb - ldb).toFixed(1)}`);
}

// error spectrum 0-10s in 1/3-octave bands: where is the error vs signal?
console.log("\nband Hz | sig | C6 err | LAME err  (0-10s, 1/3 oct)");
for (let f = 30; f < 16000; f *= Math.pow(2, 1 / 3)) {
  const w = (2 * Math.PI * f) / SR;
  function mag(arr, isErr, other) {
    let re = 0, im = 0;
    const to = 10 * SR;
    for (let i = 0; i < to; i += 3) {
      const idx = i * 2;
      const v = (isErr ? (src[idx] - arr[idx] + src[idx + 1] - arr[idx + 1]) / 65536 : (arr[idx] + arr[idx + 1]) / 65536);
      re += v * Math.cos(w * i); im -= v * Math.sin(w * i);
    }
    return Math.sqrt(re * re + im * im) / (to / 3);
  }
  const db = (x) => (20 * Math.log10(Math.max(x, 1e-12))).toFixed(1).padStart(7);
  console.log(`${f.toFixed(0).padStart(6)} | ${db(mag(src, false))} | ${db(mag(c6, true))} | ${db(mag(lame, true))}`);
}
