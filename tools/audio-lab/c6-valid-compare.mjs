// Valid comparison: C6 44.1k decode vs the 48k source resampled to 44.1k.
import { readFileSync } from "node:fs";
import { loadCodec } from "./wasm.mjs";
import { decodeMp5FileToPcm } from "./mp5file.mjs";
import { computeMetrics } from "./metrics.mjs";

const [, , raw44Path, ...c6Paths] = process.argv;
const codec = await loadCodec();

const raw = readFileSync(raw44Path);
const srcSamples = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength >> 1);

function sideSnrDb(src, dec) {
  let s = 0, e = 0;
  const n = Math.min(src.length, dec.length) >> 1;
  for (let i = 0; i < n; i++) {
    const s0 = (src[i * 2] - src[i * 2 + 1]) / 2;
    const d0 = (dec[i * 2] - dec[i * 2 + 1]) / 2;
    s += s0 * s0; e += (s0 - d0) * (s0 - d0);
  }
  return 10 * Math.log10(s / Math.max(e, 1e-18));
}

for (const path of c6Paths) {
  const c6 = decodeMp5FileToPcm(codec, path);
  const n = Math.min(srcSamples.length, c6.samples.length);
  const a = srcSamples.subarray(0, n);
  const b = c6.samples.subarray(0, n);
  const m = computeMetrics(a, b, 2, 44100);
  const nmr = JSON.parse(codec.nmr_screen_wasm(a, b, 2, 44100));
  console.log(`\n=== ${path.split(/[\\/]/).pop()} ===`);
  console.log(
    `fullSnr ${m.fullSnrDb?.toFixed(2)} | worst1s ${m.worst1sSnrDb?.toFixed(2)} | quietSnr ${m.quietWindowSnrDb == null ? "n/a" : m.quietWindowSnrDb.toFixed(2)} | sideSnr ${sideSnrDb(a, b).toFixed(2)} | peakErr ${m.peakError.toFixed(3)} | nmr max ${nmr.maxNmrDb.toFixed(1)} trimmed ${nmr.trimmed_max_nmr_db?.toFixed(1) ?? "?"}`
  );
  // worst 5 windows
  const sec = 44100 * 2;
  const rows = [];
  for (let p = 0; p + sec <= n; p += sec >> 1) {
    let s = 0, e = 0;
    for (let i = p; i < p + sec; i++) { s += a[i] * a[i]; const d = a[i] - b[i]; e += d * d; }
    rows.push({ at: (p / 2 / 44100).toFixed(1), snr: 10 * Math.log10(s / Math.max(e, 1e-9)) });
  }
  rows.sort((x, y) => x.snr - y.snr);
  console.log("worst windows:", rows.slice(0, 5).map((w) => `${w.at}s:${w.snr.toFixed(1)}`).join("  "));
}
