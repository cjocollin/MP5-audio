// Envelope tracking: is the C6 error "content removed" (dec envelope = src x (1-a))
// or "noise added" (dec envelope has bumps where src is quiet)?
// Prints 60Hz and 400Hz Goertzel envelopes for src vs dec every 10ms.
import { readFileSync } from "node:fs";

const SR = 48000;
const [, , srcPath, decPath] = process.argv;
function loadRaw(p) {
  const b = readFileSync(p);
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
}
const src = loadRaw(srcPath);
const dec = loadRaw(decPath);

function env(arr, f, c, w) {
  const wq = (2 * Math.PI * f) / SR;
  let re = 0, im = 0;
  for (let i = 0; i < w; i++) {
    const idx = (c + i) * 2;
    const v = (arr[idx] + arr[idx + 1]) / 65536;
    re += v * Math.cos(wq * i); im -= v * Math.sin(wq * i);
  }
  return Math.sqrt(re * re + im * im) / (w / 2);
}

for (const f of [60, 400, 3000, 10000]) {
  console.log(`\n--- ${f} Hz envelope (10ms hops, 43ms window) ---`);
  let line = "";
  for (let t = 11.90; t < 12.60; t += 0.01) {
    const c = Math.floor(t * SR);
    const s = env(src, f, c, 2048);
    const d = env(dec, f, c, 2048);
    const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));
    line += `${t.toFixed(2)} s=${db(s).toFixed(0)} d=${db(d).toFixed(0)} | `;
  }
  console.log(line);
}
