// Mid vs side split of the birdie events: is the 100 Hz error tone in the
// mid channel (quantization) or the side channel (stereo image wobble)?
import { readFileSync } from "node:fs";
import { loadCodec } from "../tools/audio-lab/wasm.mjs";
import { decodeMp5FileToPcm } from "../tools/audio-lab/mp5file.mjs";

const SR = 48000;
const codec = await loadCodec();
const [, , srcPath, c6Path] = process.argv;

const b = readFileSync(srcPath);
const src = new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
const dec = process.env.DEC_RAW === "1"
  ? (() => { const r = readFileSync(c6Path); return new Int16Array(r.buffer, r.byteOffset, r.byteLength >> 1); })()
  : decodeMp5FileToPcm(codec, c6Path).samples;

// For each known birdie time: Goertzel at 100/200 Hz on mid-error and side-error.
for (const t of [12.02, 12.10, 12.26, 12.45, 13.38, 14.99, 15.14, 15.34, 16.37, 18.02, 21.10, 22.37, 24.01]) {
  const c = Math.floor(t * SR);
  function mag(freq, mode) {
    const w = (2 * Math.PI * freq) / SR;
    let re = 0, im = 0;
    for (let i = -512; i < 512; i++) {
      const idx = (c + i) * 2;
      const eL = src[idx] - dec[idx], eR = src[idx + 1] - dec[idx + 1];
      const v = (mode === "mid" ? (eL + eR) / 2 : (eL - eR) / 2) / 32768;
      re += v * Math.cos(w * i); im -= v * Math.sin(w * i);
    }
    return Math.sqrt(re * re + im * im) / 1024;
  }
  // also the signal's mid/side at 100 Hz for reference
  function sigMag(freq, mode) {
    const w = (2 * Math.PI * freq) / SR;
    let re = 0, im = 0;
    for (let i = -512; i < 512; i++) {
      const idx = (c + i) * 2;
      const v = (mode === "mid" ? (src[idx] + src[idx + 1]) / 2 : (src[idx] - src[idx + 1]) / 2) / 32768;
      re += v * Math.cos(w * i); im -= v * Math.sin(w * i);
    }
    return Math.sqrt(re * re + im * im) / 1024;
  }
  const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
  console.log(
    `t=${t}s | sig mid ${db(sigMag(100, "mid"))} side ${db(sigMag(100, "side"))} | ERR mid ${db(mag(100, "mid"))} side ${db(mag(100, "side"))}`
  );
}
