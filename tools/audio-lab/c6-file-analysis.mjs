// Deep-dive analysis of a real MP5-C export vs its lossless source.
// Usage: node tools/audio-lab/c6-file-analysis.mjs <source.mp5> <c6a.mp5> [c6b.mp5]
//
// source = MP5-L (lossless reference, decode == truth)
// c6a/c6b = MP5-C exports to compare against it.
//
// Reports per-configuration: stream/audi bytes, operating-point kbps,
// full/quiet/worst-1s SNR, side SNR, NMR, plus a per-band error spectrum
// (which frequencies are damaged) and a time profile (where in the song).
import { readFileSync } from "node:fs";
import { loadCodec } from "./wasm.mjs";
import { decodeMp5FileToPcm, parseMp5File } from "./mp5file.mjs";
import { computeMetrics } from "./metrics.mjs";
import { inspectMix } from "./bench-lame.mjs";

const [, , srcPath, ...c6Paths] = process.argv;
if (!srcPath || !c6Paths.length) {
  console.error("usage: node c6-file-analysis.mjs <source.mp5> <c6a.mp5> [c6b.mp5]");
  process.exit(1);
}

const codec = await loadCodec();
const BANDS = 32;
const N = 2048;

function snrDb(a, b) {
  let s = 0, e = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { s += a[i] * a[i]; const d = a[i] - b[i]; e += d * d; }
  return 10 * Math.log10(s / Math.max(e, 1e-18));
}

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

// DFT bank: mean |error| magnitude per of 24 log-spaced bands, in dBFS.
function errorSpectrum(src, dec, sampleRate, channels) {
  const ch = channels;
  const n = Math.min(src.length, dec.length);
  const frames = Math.floor(n / ch);
  const win = N;
  const fmin = 40, fmax = sampleRate / 2;
  const nb = 24;
  const freqs = [];
  for (let i = 0; i < nb; i++) freqs.push(fmin * Math.pow(fmax / fmin, i / (nb - 1)));
  const acc = new Float64Array(nb);
  const accS = new Float64Array(nb);
  let hops = 0;
  for (let pos = 0; pos + win <= frames; pos += win / 2) {
    for (let b = 0; b < nb; b++) {
      const f = freqs[b];
      const w = Math.min(64, Math.max(8, Math.round(f / 60)));
      let re = 0, im = 0, reS = 0, imS = 0;
      for (let i = 0; i < win; i += 1) {
        let e0 = 0, s0 = 0;
        for (let c = 0; c < ch; c++) {
          const idx = (pos + i) * ch + c;
          e0 += src[idx] - dec[idx];
          s0 += src[idx];
        }
        const ang = -2 * Math.PI * f * i / sampleRate;
        const wnd = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win);
        re += e0 * Math.cos(ang) * wnd;
        im += e0 * Math.sin(ang) * wnd;
        reS += s0 * Math.cos(ang) * wnd;
        imS += s0 * Math.sin(ang) * wnd;
      }
      acc[b] += Math.hypot(re, im) / (win / 2);
      accS[b] += Math.hypot(reS, imS) / (win / 2);
    }
    hops++;
  }
  return freqs.map((f, b) => ({
    hz: Math.round(f),
    errDb: 20 * Math.log10(acc[b] / hops / 32768 + 1e-12),
    sigDb: 20 * Math.log10(accS[b] / hops / 32768 + 1e-12),
  }));
}

// Worst 1-second windows with locations.
function worstWindows(src, dec, sampleRate, channels, count = 5) {
  const sec = sampleRate * channels;
  const out = [];
  for (let pos = 0; pos + sec <= Math.min(src.length, dec.length); pos += sec / 2) {
    const a = src.subarray(pos, pos + sec);
    const b = dec.subarray(pos, pos + sec);
    const snr = snrDb(a, b);
    out.push({ at: (pos / channels / sampleRate).toFixed(1) + "s", snr });
  }
  out.sort((x, y) => x.snr - y.snr);
  return out.slice(0, count);
}

const src = decodeMp5FileToPcm(codec, srcPath);
console.log(`source: ${src.codecName} ${src.channels}ch ${src.sampleRate}Hz ${src.totalFrames} frames (${(src.totalFrames / src.sampleRate).toFixed(1)}s)`);

for (const path of c6Paths) {
  const c6 = decodeMp5FileToPcm(codec, path);
  const streamBytes = readFileSync(path).length;
  const dur = c6.totalFrames / c6.sampleRate;
  // Trim both to the common length (container may carry frame padding).
  const n = Math.min(src.samples.length, c6.samples.length);
  const srcS = src.samples.subarray(0, n);
  const decS = c6.samples.subarray(0, n);
  const m = computeMetrics(srcS, decS, src.channels, src.sampleRate);
  const nmr = JSON.parse(codec.nmr_screen_wasm(srcS, decS, src.channels, src.sampleRate));
  const audi = parseMp5File(path).audioFrames?.[0]?.data;
  const mixInfo = audi ? inspectMix(codec, audi) : null;
  console.log(`\n=== ${path.split(/[\\/]/).pop()} ===`);
  console.log(`codec: ${c6.codecName} | container ${streamBytes} B | ${(streamBytes * 8 / dur / 1000).toFixed(1)} kbps total`);
  if (mixInfo?.rust) {
    const x = mixInfo.rust;
    console.log(
      `units: ${x.units} | coded-path ${x.coded_path_kbps?.toFixed(1) ?? "?"} kbps | protected ${x.protected_sample_pct?.toFixed(1)}%/${x.protected_byte_pct?.toFixed(1)}% (samples/bytes) | profile ${x.profile_id} rev ${x.encoder_revision} target ${x.target_bitrate_kbps}`
    );
  }
  console.log(
    `fullSnr ${m.fullSnrDb?.toFixed(2)} | quietSnr ${typeof m.quietWindowSnrDb === "number" ? m.quietWindowSnrDb.toFixed(2) : "n/a"} | worst1s ${m.worst1sSnrDb?.toFixed(2)} | sideSnr ${sideSnrDb(srcS, decS).toFixed(2)} | nmr max ${nmr.maxNmrDb.toFixed(1)} trimmed ${nmr.trimmed_max_nmr_db?.toFixed(1) ?? "?"}`
  );
  console.log(`durationMatch ${m.durationMatch} peakError ${m.peakError?.toFixed(3)}`);
  console.log("worst windows:", worstWindows(srcS, decS, src.sampleRate, src.channels).map((w) => `${w.at}:${w.snr.toFixed(1)}dB`).join("  "));
  const spec = errorSpectrum(srcS, decS, src.sampleRate, src.channels);
  console.log("band  |   Hz |  sig dBFS |  err dBFS | err-sig dB");
  for (const row of spec) {
    const rel = row.errDb - row.sigDb;
    const mark = rel > -20 ? " <<<" : rel > -30 ? " <<" : "";
    console.log(
      `${String(row.hz).padStart(5)} | ${row.sigDb.toFixed(1).padStart(8)} | ${row.errDb.toFixed(1).padStart(8)} | ${rel.toFixed(1).padStart(6)}${mark}`
    );
  }

}
