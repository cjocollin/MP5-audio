// Remeasure shipping MP5-C2 (CodecId 5) on a real track.
//
// The public comparison table used to quote a stale 0.977x PCM / contentBitExact:false
// number from an encoder revision that still emitted lossy units. The shipping encoder
// picks min(TAG_SR+CORR, TAG_LOSSLESS) per loud unit and MP5-L for quiet/fragile/tail,
// so C2 output is bit-exact and sized near MP5-L. This script re-derives the number.
//
// Usage:
//   node tools/audio-lab/remeasure-c2.mjs [--source <audio file>]... [--preset 2] [--out <json>]
//   node tools/audio-lab/remeasure-c2.mjs --segments        # all corpus/origami_seg_*.flac
//
// `--source` may be repeated. Every source is measured independently and the totals are
// summed, so the whole track can be measured as segments on a memory-constrained box
// (one full-length decode + WASM encode of a 5-minute master needs ~1 GB resident).

import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCodec, REPO_ROOT } from "./wasm.mjs";

const CORPUS_DIR = join(REPO_ROOT, "benchmarks", "real-music", "corpus");
const DEFAULT_SOURCE = join(CORPUS_DIR, "origami_full.flac");
const DEFAULT_OUT = join(
  REPO_ROOT,
  "benchmarks",
  "audio-quality",
  "c2-real-track-remeasure.json",
);

/** MP5-C2 unit tags (see rust/mp5-codec/src/mp5c2.rs). */
const TAG_NAMES = {
  0x4c: "lossless_L", // 'L' broadband-quiet -> MP5-L, bit-exact
  0x42: "lossless_B", // 'B' per-band / decaying tail -> MP5-L, bit-exact
  0x46: "signal_relative_F", // 'F' normalize + MP5-C + lossless CORR, bit-exact
  0x43: "legacy_lossy_C", // 'C' decode-only legacy; shipping encoder never emits
  0x4d: "mdct_M", // 'M' lossy MDCT (mp5c3 lab path only)
};

/** Ordered origami_seg_NN.flac list — together these are the full ORIGAMI master. */
function segmentSources() {
  return readdirSync(CORPUS_DIR)
    .filter((n) => /^origami_seg_\d+\.flac$/.test(n))
    .sort()
    .map((n) => join(CORPUS_DIR, n));
}

function parseArgs(argv) {
  const out = { sources: [], preset: 2, out: DEFAULT_OUT, corpus: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--source") out.sources.push(argv[++i]);
    else if (a === "--segments") {
      out.sources.push(...segmentSources());
      out.corpus = "origami_segments";
    } else if (a === "--preset") out.preset = Number(argv[++i]);
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--corpus") out.corpus = argv[++i];
    else throw new Error(`unknown arg: ${a}`);
  }
  if (out.sources.length === 0) {
    out.sources.push(DEFAULT_SOURCE);
    out.corpus ??= "origami_full";
  }
  out.corpus ??= "custom";
  return out;
}

/** Decode any ffmpeg-readable file to interleaved s16le at its native rate. */
function decodeToPcm(source) {
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=sample_rate,channels",
        "-of", "json",
        source,
      ],
      { encoding: "utf8" },
    ),
  );
  const stream = probe.streams?.[0];
  if (!stream) throw new Error(`no audio stream in ${source}`);
  const sampleRate = Number(stream.sample_rate);
  const channels = Number(stream.channels);

  const dir = mkdtempSync(join(tmpdir(), "mp5-c2-remeasure-"));
  const raw = join(dir, "audio.raw");
  try {
    execFileSync("ffmpeg", [
      "-v", "error",
      "-y",
      "-i", source,
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      raw,
    ]);
    const buf = readFileSync(raw);
    const samples = new Int16Array(
      buf.buffer,
      buf.byteOffset,
      Math.floor(buf.byteLength / 2),
    ).slice();
    return { samples, channels, sampleRate };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function sampleEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Tally C2 unit tags so protected%/coded% can be reported honestly.
 * Unit framing: [tag u8][channelFrames u32le][payloadLen u32le][payload].
 */
function unitMix(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0x43 || bytes[1] !== 0x34) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tally = {
    units: 0,
    totalFrames: 0,
    totalPayloadBytes: 0,
    unitsByTag: {},
    framesByTag: {},
    payloadBytesByTag: {},
  };
  let pos = 10;
  while (pos + 9 <= bytes.length) {
    const tagByte = bytes[pos];
    const tag = TAG_NAMES[tagByte] ?? `unknown_0x${tagByte.toString(16)}`;
    const n = view.getUint32(pos + 1, true);
    const len = view.getUint32(pos + 5, true);
    pos += 9 + len;
    if (pos > bytes.length) throw new Error("truncated MP5-C2 unit while tallying");
    tally.units += 1;
    tally.totalFrames += n;
    tally.totalPayloadBytes += len;
    tally.unitsByTag[tag] = (tally.unitsByTag[tag] ?? 0) + 1;
    tally.framesByTag[tag] = (tally.framesByTag[tag] ?? 0) + n;
    tally.payloadBytesByTag[tag] = (tally.payloadBytesByTag[tag] ?? 0) + len;
  }
  // Shipping tags (L / B / F) all restore original PCM exactly; legacy C and MDCT do not.
  const lossyFrames =
    (tally.framesByTag.legacy_lossy_C ?? 0) + (tally.framesByTag.mdct_M ?? 0);
  tally.lossyFrames = lossyFrames;
  tally.bitExactFramePct = tally.totalFrames
    ? (100 * (tally.totalFrames - lossyFrames)) / tally.totalFrames
    : 0;
  return tally;
}

/** Merge a per-file unit tally into a running total. */
function mergeMix(total, mix) {
  if (!mix) return total;
  const acc = total ?? {
    units: 0,
    totalFrames: 0,
    totalPayloadBytes: 0,
    unitsByTag: {},
    framesByTag: {},
    payloadBytesByTag: {},
  };
  acc.units += mix.units;
  acc.totalFrames += mix.totalFrames;
  acc.totalPayloadBytes += mix.totalPayloadBytes;
  for (const key of ["unitsByTag", "framesByTag", "payloadBytesByTag"]) {
    for (const [tag, n] of Object.entries(mix[key])) {
      acc[key][tag] = (acc[key][tag] ?? 0) + n;
    }
  }
  return acc;
}

/** Measure one source end to end. Frees the PCM buffer before returning. */
function measureOne(codec, source, preset) {
  const { samples, channels, sampleRate } = decodeToPcm(source);
  const pcmBytes = samples.length * 2;

  const c2 = codec.encode_mp5c_vnext_at(samples, channels, preset, sampleRate);
  const c2Decoded = codec.decode_mp5c_vnext(c2);
  const lv4 = codec.encode_mp5l_v4(samples, channels);

  const bitExact =
    c2Decoded.length >= samples.length &&
    sampleEqual(samples, c2Decoded.subarray(0, samples.length));

  return {
    source: source.split(/[\\/]/).pop(),
    sampleRate,
    channels,
    totalSamples: samples.length / channels,
    pcmBytes,
    c2Bytes: c2.length,
    mp5lV4Bytes: lv4.length,
    ratioVsPcm: c2.length / pcmBytes,
    ratioVsMp5lV4: c2.length / lv4.length,
    contentBitExact: bitExact,
    decodedSamples: c2Decoded.length,
    unitMix: unitMix(c2),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const missing = args.sources.filter((s) => !existsSync(s));
  if (missing.length > 0) {
    console.error(`Source not found: ${missing.join(", ")}`);
    console.error("Point --source at a local track (corpus files are git-ignored).");
    process.exit(2);
  }

  const codec = await loadCodec();
  const parts = [];
  let mix = null;
  for (const source of args.sources) {
    const part = measureOne(codec, source, args.preset);
    parts.push(part);
    mix = mergeMix(mix, part.unitMix);
    process.stderr.write(
      `${part.source}: c2=${part.c2Bytes} l4=${part.mp5lV4Bytes} ` +
        `pcm=${part.pcmBytes} bitExact=${part.contentBitExact}\n`,
    );
  }

  const sum = (key) => parts.reduce((acc, p) => acc + p[key], 0);
  const pcmBytes = sum("pcmBytes");
  const c2Bytes = sum("c2Bytes");
  const mp5lV4Bytes = sum("mp5lV4Bytes");
  const bitExact = parts.every((p) => p.contentBitExact);

  if (mix) {
    const lossyFrames =
      (mix.framesByTag.legacy_lossy_C ?? 0) + (mix.framesByTag.mdct_M ?? 0);
    mix.lossyFrames = lossyFrames;
    mix.bitExactFramePct = mix.totalFrames
      ? (100 * (mix.totalFrames - lossyFrames)) / mix.totalFrames
      : 0;
  }

  const result = {
    corpus: args.corpus,
    sources: parts.map((p) => p.source),
    preset: args.preset,
    sampleRate: parts[0].sampleRate,
    channels: parts[0].channels,
    totalSamples: sum("totalSamples"),
    pcmBytes,
    c2Bytes,
    mp5lV4Bytes,
    ratioVsPcm: c2Bytes / pcmBytes,
    ratioVsMp5lV4: c2Bytes / mp5lV4Bytes,
    contentBitExact: bitExact,
    unitMix: mix,
    perSource: parts.length > 1 ? parts : undefined,
    measuredAt: new Date().toISOString(),
  };

  writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (!bitExact) {
    console.error("\nWARNING: C2 output is NOT bit-exact - public labels assume it is.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
