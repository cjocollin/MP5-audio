// Replicate the codec's exact MDCT analysis for one dip frame and print
// per-band RMS vs the lift pivot — why didn't the lift engage?
import { readFileSync } from "node:fs";

const SR = 48000, N = 2048, COEFFS = 1024, NB = 32;
const [, , srcPath, tSec] = process.argv;
const b = readFileSync(srcPath);
const pcm = new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);

// window + mdct (direct, matching mdct_direct)
const win = Array.from({ length: N }, (_, i) => Math.sin((Math.PI * (i + 0.5)) / N));
const pos = Math.floor(Number(tSec) * SR);
// channel 0
function bandRms(ch) {
  const frame = [];
  for (let i = 0; i < N; i++) frame.push((pcm[(pos + i) * 2 + ch] / 32768) * win[i]);
  const coeffs = new Float64Array(COEFFS);
  for (let k = 0; k < COEFFS; k++) {
    let acc = 0;
    const kf = k + 0.5;
    for (let ni = 0; ni < N; ni++) {
      acc += frame[ni] * Math.cos((Math.PI / COEFFS) * (ni + 0.5 + COEFFS / 2) * kf);
    }
    coeffs[k] = acc / COEFFS; // encoder's 1/M scaling
  }
  // quadratic bands
  const out = [];
  let prev = 0;
  for (let bnd = 1; bnd <= NB; bnd++) {
    const t = bnd / NB;
    const end = Math.max(prev + 1, Math.min(COEFFS, Math.round(t * t * COEFFS)));
    let sumsq = 0, peak = 0;
    for (let i = prev; i < end; i++) {
      sumsq += coeffs[i] * coeffs[i];
      peak = Math.max(peak, Math.abs(coeffs[i]));
    }
    out.push({ lo: prev, hi: end, rms: Math.sqrt(sumsq / (end - prev)), peak });
    prev = end;
    if (prev >= COEFFS) break;
  }
  return out;
}

const bands = bandRms(0);
const NF = 0.018, MS = 5e-5;
console.log(`band | bins | rms dB | legacy step | lift | step_final (ch0, t=${tSec}s)`);
for (let bi = 0; bi < bands.length; bi++) {
  const { lo, hi, rms, peak } = bands[bi];
  const rmsDb = 20 * Math.log10(Math.max(rms, 1e-12));
  const liftDb = Math.min(Math.max(-45 - rmsDb, 0) * 0.6, 12);
  const nfLift = NF / Math.pow(10, liftDb / 20);
  const step = Math.max(rms * nfLift, MS, peak * 1e-4);
  console.log(
    `${String(bi).padStart(2)} | ${String(lo).padStart(3)}-${String(hi).padStart(3)} | ${rmsDb.toFixed(1).padStart(6)} | ${(rms * NF).toExponential(1)} | +${liftDb.toFixed(1)}dB | ${step.toExponential(2)}`
  );
}
