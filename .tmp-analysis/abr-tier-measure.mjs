// Measure C6 at ABR rates on the Low/Standard bases vs MP3 128/192 figures.
import { readFileSync } from "node:fs";
import { loadCodec } from "../tools/audio-lab/wasm.mjs";

const SR = 48000;
const codec = await loadCodec();
const b = readFileSync(".tmp-analysis/src48.raw");
const src = new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);

function snrDb(dec) {
  let s = 0, e = 0;
  for (let i = 0; i < src.length; i++) {
    s += src[i] * src[i];
    const d = src[i] - dec[i];
    e += d * d;
  }
  return 10 * Math.log10(s / Math.max(e, 1e-12));
}
function dipErrDb(dec) {
  const from = (8.0 * SR * 2) | 0, to = (8.75 * SR * 2) | 0;
  let e = 0;
  for (let i = from; i < to; i++) { const d = src[i] - dec[i]; e += d * d; }
  return 10 * Math.log10(Math.max(e / (to - from), 1e-12) / (32768 * 32768));
}

console.log("config | measured kbps | full SNR | dip err");
for (const [preset, kbps] of [[0, 96], [0, 112], [0, 128], [1, 160], [1, 176], [1, 192]]) {
  const stream = codec.encode_mp5c6_at(src, 2, preset, SR, kbps, 1);
  const dec = codec.decode_mp5c6(stream);
  const real = (stream.length * 8) / 217.5 / 1000;
  console.log(`preset ${preset} ABR ${kbps} | ${real.toFixed(0)} | ${snrDb(dec).toFixed(2)} | ${dipErrDb(dec).toFixed(1)}`);
}
