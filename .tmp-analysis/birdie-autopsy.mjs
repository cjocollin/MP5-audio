// Autopsy of one birdie: fine spectrogram of the error signal 11.9-12.5s.
// Top-5 error frequencies per 10ms frame + total error level, C6 vs LAME.
import { readFileSync } from "node:fs";

const SR = 48000;
const [, , srcPath, decPath] = process.argv;
function loadRaw(p) {
  const b = readFileSync(p);
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
}
const src = loadRaw(srcPath);
const dec = loadRaw(decPath);

const W = 2048; // analysis window
for (let t = 11.90; t < 12.50; t += 0.020) {
  const c = Math.floor(t * SR);
  // Goertzel over a dense 25 Hz grid up to 1 kHz (bass focus)
  const mags = [];
  for (let f = 25; f <= 1000; f += 25) {
    const w = (2 * Math.PI * f) / SR;
    let re = 0, im = 0;
    for (let i = 0; i < W; i += 2) {
      const idx = (c + i) * 2;
      const v = (src[idx] - dec[idx] + src[idx + 1] - dec[idx + 1]) / 65536;
      re += v * Math.cos(w * i); im -= v * Math.sin(w * i);
    }
    mags.push({ f, m: Math.sqrt(re * re + im * im) / (W / 2) });
  }
  mags.sort((a, b) => b.m - a.m);
  const tot = Math.sqrt(mags.reduce((a, x) => a + x.m * x.m, 0));
  const top = mags.slice(0, 4).map((x) => `${x.f}Hz:${(20 * Math.log10(Math.max(x.m, 1e-12))).toFixed(0)}`).join(" ");
  const share = mags[0].m / Math.max(tot, 1e-12);
  console.log(`${t.toFixed(2)}s | err ${(20 * Math.log10(Math.max(tot, 1e-12))).toFixed(1)} dB | top ${top} | topShare ${(share * 100).toFixed(0)}%`);
}
