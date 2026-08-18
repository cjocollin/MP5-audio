// Local psycho A/B on the intro slice: encode legacy vs psycho with the SAME
// profile-3 options as the user's export, decode, and count tonal birdies.
import { readFileSync } from "node:fs";
import { loadCodec } from "../tools/audio-lab/wasm.mjs";

const SR = 48000;
const SECONDS = Number(process.env.SECONDS ?? 30);
const codec = await loadCodec();
const [, , srcPath] = process.argv;

const b = readFileSync(srcPath);
const full = new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
const src = full.subarray(0, SECONDS * SR * 2);

function birdies(dec) {
  const B = 256;
  const blocks = Math.floor(dec.length / 2 / B);
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
  return out;
}

function snrDb(dec) {
  let s = 0, e = 0;
  for (let i = 0; i < src.length; i++) {
    s += src[i] * src[i];
    const d = src[i] - dec[i];
    e += d * d;
  }
  return 10 * Math.log10(s / Math.max(e, 1e-12));
}

for (const psycho of [false, true]) {
  const stream = codec.encode_mp5c6_opt(src, 2, 3, SR, 0, 0, true, true, psycho);
  const dec = codec.decode_mp5c6(stream);
  const kbps = (stream.length * 8) / SECONDS / 1000;
  const ev = birdies(dec);
  const tonal = ev.filter((e) => e.ton > 8);
  console.log(
    `psycho=${psycho ? "on " : "off"} | ${kbps.toFixed(0)} kbps | SNR ${snrDb(dec).toFixed(2)} dB | events ${ev.length} | TONAL ${tonal.length}`
  );
  if (tonal.length) {
    console.log("  tonal: " + tonal.map((e) => `${e.t.toFixed(2)}s@${e.peak}Hz(${e.ton.toFixed(0)})`).join(" "));
  }
}
