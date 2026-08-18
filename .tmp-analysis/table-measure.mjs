// Table measurements: MP3 (LAME 128/192/320) vs MP5-C6 (Low/Standard/High/Extreme)
// on the 48k GRUDGES source. Prints kbps, full SNR, and quiet-dip error level.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SR = 48000;
const FF = process.env.FFMPEG;
const C6AB = "./target/release/c6_ab";
const SRC = ".tmp-analysis/src48.raw";

const b = readFileSync(SRC);
const src = new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);

function loadRaw(p) {
  const r = readFileSync(p);
  return new Int16Array(r.buffer, r.byteOffset, r.byteLength >> 1);
}
function snrDb(dec) {
  let s = 0, e = 0;
  const n = Math.min(src.length, dec.length);
  for (let i = 0; i < n; i++) {
    s += src[i] * src[i];
    const d = src[i] - dec[i];
    e += d * d;
  }
  return 10 * Math.log10(s / Math.max(e, 1e-12));
}
function dipErrDb(dec) {
  // error RMS in the 8.0-8.75s phrase dip
  const from = 8.0 * SR * 2 | 0, to = 8.75 * SR * 2 | 0;
  let e = 0;
  for (let i = from; i < to; i++) { const d = src[i] - dec[i]; e += d * d; }
  return 10 * Math.log10(Math.max(e / (to - from), 1e-12) / (32768 * 32768));
}

console.log("codec | kbps | full SNR dB | dip err dBFS");
for (const rate of [128, 192, 320]) {
  execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", ".tmp-analysis/src48.wav", "-c:a", "libmp3lame", "-b:a", `${rate}k`, ".tmp-analysis/t.mp3"]);
  execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", ".tmp-analysis/t.mp3", "-f", "s16le", "-acodec", "pcm_s16le", ".tmp-analysis/t.raw"]);
  const dec = loadRaw(".tmp-analysis/t.raw");
  const kbps = readFileSync(".tmp-analysis/t.mp3").length * 8 / 217.5 / 1000;
  console.log(`MP3 ${rate} | ${kbps.toFixed(0)} | ${snrDb(dec).toFixed(2)} | ${dipErrDb(dec).toFixed(1)}`);
}
const NAMES = ["Low", "Standard", "High", "Extreme"];
for (let p = 0; p <= 3; p++) {
  execFileSync(C6AB, [SRC, ".tmp-analysis/t.raw", String(p), "48000", "1", "1", "0", ".tmp-analysis/t.c6"], { stdio: "pipe" });
  const dec = loadRaw(".tmp-analysis/t.raw");
  const kbps = readFileSync(".tmp-analysis/t.c6").length * 8 / 217.5 / 1000;
  console.log(`MP5-C6 ${NAMES[p]} | ${kbps.toFixed(0)} | ${snrDb(dec).toFixed(2)} | ${dipErrDb(dec).toFixed(1)}`);
}
unlinkSync(".tmp-analysis/t.mp3"); unlinkSync(".tmp-analysis/t.raw"); unlinkSync(".tmp-analysis/t.c6");
