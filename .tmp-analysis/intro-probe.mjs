// Intro-window (0-30s) comparison: MP5-C6 vs LAME-320 vs source, all 48k stereo s16le.
// Per 5s segment: window SNR, side SNR, and 1/6-octave error spectrum.
// Plus onset pre-echo: error energy 40ms before vs after detected onsets.
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
const N = Math.min(src.length, lame.length, c6.length);

// --- alignment check: offset of lame vs src within +/-2000 samples (first 2s, ch0)
function bestOffset(a, b, span, maxOff) {
  let best = 0, bestC = -1;
  for (let off = -maxOff; off <= maxOff; off += 1) {
    let c = 0;
    for (let i = 0; i < span; i += 16) c += a[i * 2] * b[(i + off) * 2];
    if (c > bestC) { bestC = c; best = off; }
  }
  return best;
}
const lameOff = bestOffset(src, lame, SR * 2, 2000);
console.log(`lame offset vs src: ${lameOff} samples`);

function snr(a, b, from, to, stride = 1, bOff = 0) {
  let s = 0, e = 0;
  for (let i = from; i < to; i += stride) {
    s += a[i] * a[i];
    const d = a[i] - b[i + bOff];
    e += d * d;
  }
  return 10 * Math.log10(s / Math.max(e, 1e-12));
}
function sideSnr(a, b, from, to, bOff = 0) {
  let s = 0, e = 0;
  for (let i = from; i < to; i += 2) {
    const sa = (a[i] - a[i + 1]) / 2, sb = (b[i + bOff] - b[i + bOff + 1]) / 2;
    s += sa * sa; e += (sa - sb) * (sa - sb);
  }
  return 10 * Math.log10(s / Math.max(e, 1e-12));
}

console.log("\nseg | srcRms | C6 snr | LAME snr | C6 side | LAME side");
for (let t = 0; t < 30; t += 5) {
  const from = t * SR * 2, to = (t + 5) * SR * 2;
  let rms = 0; for (let i = from; i < to; i++) rms += src[i] * src[i];
  rms = Math.sqrt(rms / (to - from));
  console.log(
    `${String(t).padStart(3)}s | ${rms.toFixed(0).padStart(6)} | ` +
    `${snr(src, c6, from, to).toFixed(1)} | ${snr(src, lame, from, to, 1, lameOff * 2).toFixed(1)} | ` +
    `${sideSnr(src, c6, from, to).toFixed(1)} | ${sideSnr(src, lame, from, to, lameOff * 2).toFixed(1)}`
  );
}

// --- 1/6-octave error spectrum on 0-10s and 10-30s
function bands(from, to, label) {
  // DFT magnitude per 1/6-octave band via Goertzel on decimated set of freqs
  const freqs = [];
  for (let f = 40; f < 20000; f *= Math.pow(2, 1 / 6)) freqs.push(f);
  const win = to - from;
  console.log(`\nband Hz | sig | C6 err | LAME err   (${label})`);
  for (const f of freqs) {
    const w = 2 * Math.PI * f / SR;
    // Goertzel on ch0
    function mag(arr, off) {
      let re = 0, im = 0;
      const step = 4; // decimate for speed
      for (let i = 0; i < win; i += step) {
        const v = arr[from + i * 2] / 32768;
        re += v * Math.cos(w * i); im -= v * Math.sin(w * i);
      }
      return Math.sqrt(re * re + im * im) / (win / step);
    }
    function errMag(dec, off) {
      let re = 0, im = 0;
      const step = 4;
      for (let i = 0; i < win; i += step) {
        const v = (src[from + i * 2] - dec[from + i * 2 + off]) / 32768;
        re += v * Math.cos(w * i); im -= v * Math.sin(w * i);
      }
      return Math.sqrt(re * re + im * im) / (win / step);
    }
    const s = mag(src, 0), eC = errMag(c6, 0), eL = errMag(lame, lameOff * 2);
    const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1).padStart(7);
    console.log(`${f.toFixed(0).padStart(6)} | ${db(s)} | ${db(eC)} | ${db(eL)}`);
  }
}
bands(0, 10 * SR, "0-10s");
bands(10 * SR * 2, 30 * SR * 2, "10-30s");

// --- onset pre-echo: find onsets in 0-30s (ch0), error energy before/after
function preecho(dec, off, label) {
  const hop = 256; // 5.3ms
  const e = [];
  for (let p = 0; p + hop <= 30 * SR; p += hop) {
    let s = 0; for (let i = 0; i < hop; i++) { const v = src[(p + i) * 2]; s += v * v; }
    e.push(s / hop);
  }
  let totPre = 0, totPost = 0, cnt = 0;
  for (let k = 4; k < e.length - 4; k++) {
    const rise = 10 * Math.log10(e[k] / Math.max(e[k - 3], 1e-9));
    if (rise < 8) continue; // onset: >=8dB rise
    // skip if another onset within previous 8 hops
    let pre = 0, post = 0;
    const center = k * hop;
    for (let i = -8; i < 0; i++) { const v = src[(center + i * hop / 8 | 0) * 2] - dec[(center + (i * hop / 8 | 0)) * 2 + off]; pre += v * v; }
    for (let i = 0; i < 8; i++) { const v = src[(center + i * hop / 8 | 0) * 2] - dec[(center + (i * hop / 8 | 0)) * 2 + off]; post += v * v; }
    totPre += pre; totPost += post; cnt++;
    k += 8; // skip ahead past this onset
  }
  console.log(`${label}: onsets ${cnt}, err pre/post ratio ${(10 * Math.log10(Math.max(totPre, 1) / Math.max(totPost, 1))).toFixed(1)} dB (negative = more error before onset = pre-echo)`);
}
console.log("\npre-echo (0-30s):");
preecho(c6, 0, "C6  ");
preecho(lame, lameOff * 2, "LAME");
