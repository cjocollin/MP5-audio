// Tonal-event detector on a decoded raw vs source raw. Usage:
// node birdie-count.mjs <src.raw> <dec.raw>
import { readFileSync } from "node:fs";

const SR = 48000;
const [, , srcPath, decPath] = process.argv;
const b1 = readFileSync(srcPath);
const src = new Int16Array(b1.buffer, b1.byteOffset, b1.byteLength >> 1);
const b2 = readFileSync(decPath);
const dec = new Int16Array(b2.buffer, b2.byteOffset, b2.byteLength >> 1);

const B = 256;
const blocks = Math.floor(Math.min(src.length, dec.length) / 2 / B);
const rms = new Float64Array(blocks);
for (let k = 0; k < blocks; k++) {
  let e = 0;
  for (let i = 0; i < B; i++) {
    const idx = (k * B + i) * 2;
    const d0 = src[idx] - dec[idx], d1 = src[idx + 1] - dec[idx + 1];
    e += d0 * d0 + d1 * d1;
  }
  rms[k] = Math.sqrt(e / (B * 2));
}
const W = Math.floor(SR / B);
const out = [];
for (let k = W; k < blocks - W; k++) {
  const win = Array.from(rms.subarray(k - W, k + W)).sort((a, b) => a - b);
  const med = win[Math.floor(win.length / 2)];
  if (rms[k] > 20 && rms[k] / Math.max(med, 1e-9) > 3) {
    const c = k * B;
    let best = 0, bestF = 0, tot = 0, n = 0;
    for (let f = 100; f < 22000; f += 100) {
      const w = (2 * Math.PI * f) / SR;
      let re = 0, im = 0;
      for (let i = -512; i < 512; i += 2) {
        const v = (src[(c + i) * 2] - dec[(c + i) * 2]) / 32768;
        re += v * Math.cos(w * i); im -= v * Math.sin(w * i);
      }
      const m = Math.sqrt(re * re + im * im);
      tot += m; n++;
      if (m > best) { best = m; bestF = f; }
    }
    out.push({ t: (k * B) / SR, peak: bestF, ton: best / Math.max(tot / n, 1e-12) });
    k += 8;
  }
}
const tonal = out.filter((e) => e.ton > 8);
console.log(`events ${out.length} | TONAL ${tonal.length}`);
if (tonal.length) {
  console.log("tonal: " + tonal.map((e) => `${e.t.toFixed(2)}s@${e.peak}Hz(${e.ton.toFixed(0)})`).join(" "));
}
