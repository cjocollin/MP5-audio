// Birdie/transient hunter: fine-grained error analysis of the C6 intro.
// Finds short error events and classifies them: tonal (birdie) vs noise (hiss).
import { readFileSync } from "node:fs";
import { loadCodec } from "../tools/audio-lab/wasm.mjs";
import { decodeMp5FileToPcm } from "../tools/audio-lab/mp5file.mjs";

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

// --- per-256-block error RMS for 0-30s; find spikes vs 1s moving baseline
function events(dec, label) {
  const B = 256;
  const blocks = Math.floor((30 * SR) / B);
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
  // baseline: median over a 1s window
  const W = Math.floor(SR / B);
  const spikes = [];
  for (let k = W; k < blocks - W; k++) {
    const win = Array.from(rms.subarray(k - W, k + W)).sort((a, b) => a - b);
    const med = win[Math.floor(win.length / 2)];
    const ratio = rms[k] / Math.max(med, 1e-9);
    if (rms[k] > 20 && ratio > 3) spikes.push({ k, t: (k * B) / SR, db: 20 * Math.log10(ratio) });
  }
  // merge adjacent
  const merged = [];
  for (const s of spikes) {
    if (merged.length && s.k - merged[merged.length - 1].k < 8) {
      if (s.db > merged[merged.length - 1].db) merged[merged.length - 1] = s;
    } else merged.push(s);
  }
  console.log(`\n${label}: ${merged.length} error spikes >3x local baseline (0-30s)`);
  for (const s of merged.slice(0, 25)) {
    // spectral peakiness of error in a 1024 window around spike (ch0)
    const c = Math.floor(s.t * SR);
    let best = 0, bestF = 0, tot = 0, n = 0;
    for (let f = 100; f < 22000; f += 100) {
      const w = 2 * Math.PI * f / SR;
      let re = 0, im = 0;
      for (let i = -512; i < 512; i += 2) {
        const v = (src[(c + i) * 2] - dec[(c + i) * 2]) / 32768;
        re += v * Math.cos(w * i); im -= v * Math.sin(w * i);
      }
      const m = Math.sqrt(re * re + im * im);
      tot += m; n++;
      if (m > best) { best = m; bestF = f; }
    }
    const peakiness = best / Math.max(tot / n, 1e-12);
    console.log(
      `  t=${s.t.toFixed(2)}s  +${s.db.toFixed(1)} dB over baseline  peak ${bestF} Hz  peakiness ${peakiness.toFixed(1)} ${peakiness > 8 ? "<== TONAL BIRDIE" : ""}`
    );
  }
}
events(c6, "C6  ");
events(lame, "LAME");
