// Per-second analysis: where does the export lose content, and was that
// region MDCT or protected? Maps the protect coverage against window SNR.
import { readFileSync } from "node:fs";
import { loadCodec } from "./wasm.mjs";
import { decodeMp5FileToPcm, parseMp5File } from "./mp5file.mjs";

const [, , rawSrcPath, c6Path] = process.argv;
const codec = await loadCodec();

const raw = readFileSync(rawSrcPath);
const srcSamples = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength >> 1);
const SR = Number(process.env.SRC_RATE ?? 44100);

const c6 = decodeMp5FileToPcm(codec, c6Path);
const n = Math.min(srcSamples.length, c6.samples.length);
const a = srcSamples.subarray(0, n);
const b = c6.samples.subarray(0, n);

// Unit table: tag per unit with frame ranges.
const audi = parseMp5File(c6Path).audioFrames?.[0]?.data;
const TAGS = { 0x4c: "L", 0x42: "B", 0x4d: "M" };
function unitMap(bytes) {
  const out = [];
  let pos = 28;
  let frame = 0;
  while (pos + 9 <= bytes.length) {
    const tag = bytes[pos];
    const nf = bytes[pos + 1] | (bytes[pos + 2] << 8) | (bytes[pos + 3] << 16) | (bytes[pos + 4] << 24);
    const len = (bytes[pos + 5] | (bytes[pos + 6] << 8) | (bytes[pos + 7] << 16) | (bytes[pos + 8] << 24)) >>> 0;
    out.push({ tag, from: frame, to: frame + nf });
    frame += nf;
    pos += 9 + len + 4;
  }
  return out;
}
const units = audi ? unitMap(audi) : [];

const sec = SR * 2; // stereo samples per second
console.log("sec | winSnr | srcRms | tags | note");
for (let p = 0; p + sec <= n; p += sec) {
  let sig = 0, err = 0, srcE = 0;
  for (let i = p; i < p + sec; i++) {
    sig += a[i] * a[i];
    const d = a[i] - b[i];
    err += d * d;
    srcE += a[i] * a[i];
  }
  const snr = 10 * Math.log10(sig / Math.max(err, 1e-9));
  const rms = Math.sqrt(srcE / sec);
  const frame = p / 2;
  const tags = units.filter((u) => u.from < frame + SR && u.to > frame).map((u) => TAGS[u.tag] ?? "?").join("");
  const sec_ = (p / sec) | 0;
  const note = snr < 15 ? "  <<< LOSSY-EXPOSED" : tags && !tags.includes("M") ? "  (protected)" : "";
  console.log(`${String(sec_).padStart(3)} | ${snr.toFixed(1).padStart(6)} | ${rms.toFixed(0).padStart(6)} | ${tags.padEnd(4)} |${note}`);
}
