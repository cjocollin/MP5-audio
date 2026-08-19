// Where in time is the Low dip error? Per-20ms error RMS in 7.5-9.5s,
// plus the block plan (block types) over the same window.
import { readFileSync } from "node:fs";

const SR = 48000;
const [, , srcPath, decPath] = process.argv;
function loadRaw(p) {
  const b = readFileSync(p);
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
}
const src = loadRaw(srcPath);
const dec = loadRaw(decPath);

const B = 960; // 20 ms
console.log("t | src dB | err dB");
for (let t = 7.5; t < 9.5; t += B / SR) {
  const from = Math.floor(t * SR) * 2, to = from + B * 2;
  let s = 0, e = 0;
  for (let i = from; i < to; i++) {
    s += src[i] * src[i];
    const d = src[i] - dec[i];
    e += d * d;
  }
  const db = (x) => (10 * Math.log10(Math.max(x / (B * 2), 1e-14) / (32768 * 32768))).toFixed(1);
  console.log(`${t.toFixed(2)} | ${db(s)} | ${db(e)}`);
}
