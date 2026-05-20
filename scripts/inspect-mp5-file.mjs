/**
 * Inspect an .mp5 file and optionally generate preset comparison encodings from decoded PCM.
 * Usage: node scripts/inspect-mp5-file.mjs "<path.mp5>" [--compare]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parseMp5, writeMp5, CodecId } from "../packages/mp5-container/dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const PRESET_NAMES = ["Low", "Standard", "High", "Extreme"];
const CODEC_NAMES = { 0: "PCM", 1: "MP5-C", 2: "MP5-L", 3: "MP5-H" };
const DECODE_PATH = {
  0: "PCM (container passthrough)",
  1: "MP5-C WASM decode",
  2: "MP5-L WASM decode",
  3: "MP5-H WASM decode",
};

function snrDb(original, decoded) {
  const n = Math.min(original.length, decoded.length);
  let sig = 0;
  let err = 0;
  for (let i = 0; i < n; i++) {
    const o = original[i] / 32768;
    const d = decoded[i] / 32768;
    sig += o * o;
    const e = o - d;
    err += e * e;
  }
  if (err === 0) return Infinity;
  return 10 * Math.log10(sig / err);
}

function analyzePeaks(samples, channels) {
  let peak = 0;
  let clipped = 0;
  let silentFrames = 0;
  const frame = 4096;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a >= 32767) clipped++;
    if (a > peak) peak = a;
  }
  for (let off = 0; off < samples.length; off += frame * channels) {
    let e = 0;
    const end = Math.min(off + frame * channels, samples.length);
    for (let i = off; i < end; i++) e += samples[i] * samples[i];
    if (e === 0) silentFrames++;
  }
  return {
    peakDb: 20 * Math.log10(peak / 32768 || 1e-10),
    clippedSamples: clipped,
    silentFrameBlocks: silentFrames,
  };
}

async function loadWasm() {
  const wasmPath = join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
  const mod = await import(
    pathToFileURL(join(root, "apps/web/src/wasm/pkg/mp5_codec.js")).href,
  );
  await mod.default(readFileSync(wasmPath));
  return mod;
}

function inspectParsed(parsed, fileBytes, sourcePath) {
  const head = parsed.head;
  if (!head) throw new Error("Missing HEAD");
  const audi = parsed.audioFrames[0]?.data;
  if (!audi) throw new Error("Missing AUDI");
  const encoder = parsed.info.find((i) => i.key === "encoder")?.value ?? "(none)";

  const isMp5cMagic = audi[0] === 0x43 && audi[1] === 2;
  const isRawPcm =
    head.codecId === CodecId.PCM ||
    (audi.length === Number(head.totalSamples) * head.channels * (head.bitsPerSample / 8) &&
      audi[0] !== 0x43);

  const pcmBytes =
    Number(head.totalSamples) * head.channels * (head.bitsPerSample / 8);
  const durationSec = Number(head.totalSamples) / head.sampleRate;

  return {
    path: sourcePath,
    fileBytes,
    codecId: head.codecId,
    codecName: CODEC_NAMES[head.codecId] ?? `Unknown (${head.codecId})`,
    presetId: head.presetId,
    presetName: PRESET_NAMES[head.presetId] ?? `Preset ${head.presetId}`,
    encoder,
    decoderPath: DECODE_PATH[head.codecId] ?? "unknown",
    audiMagic: Array.from(audi.slice(0, 8)),
    audiBytes: audi.length,
    audiIsMp5cBitstream: isMp5cMagic,
    audiIsRawPcm: head.codecId === CodecId.PCM || (!isMp5cMagic && head.codecId === CodecId.PCM),
    audiKind: isMp5cMagic
      ? "MP5-C v2 bitstream"
      : head.codecId === CodecId.PCM
        ? "raw PCM"
        : "other codec bitstream",
    sampleRate: head.sampleRate,
    channels: head.channels,
    bitsPerSample: head.bitsPerSample,
    totalSamples: Number(head.totalSamples),
    durationSec,
    estimatedPcmBytes: pcmBytes,
    compressionVsPcm: fileBytes / pcmBytes,
    audiCompressionVsPcm: audi.length / pcmBytes,
  };
}

function wrapMp5(bitstream, headTemplate, codecId, presetId, encoder, totalSamples) {
  return writeMp5({
    head: {
      ...headTemplate,
      codecId,
      presetId,
      totalSamples: BigInt(totalSamples),
    },
    meta: [{ key: "title", value: "comparison" }],
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: bitstream }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: [0.1, 0.5, 0.9],
    info: [{ key: "encoder", value: encoder }],
  });
}

async function main() {
  const target = process.argv[2];
  const doCompare = process.argv.includes("--compare");
  if (!target || !existsSync(target)) {
    console.error("File not found:", target);
    process.exit(1);
  }

  const wasm = await loadWasm();
  const buf = readFileSync(target);
  const parsed = parseMp5(buf);
  const base = inspectParsed(parsed, buf.length, target);

  let referencePcm = null;
  let decodeError = null;
  let snrVsReference = null;
  const peaks = { peakDb: null, clippedSamples: null, silentFrameBlocks: null };

  try {
    const audi = parsed.audioFrames[0].data;
    if (parsed.head.codecId === CodecId.MP5C) {
      referencePcm = wasm.decode_mp5c(audi);
    } else if (parsed.head.codecId === CodecId.PCM) {
      referencePcm = new Int16Array(
        audi.buffer,
        audi.byteOffset,
        audi.byteLength / 2,
      );
    } else if (parsed.head.codecId === CodecId.MP5L) {
      referencePcm = wasm.decode_mp5l(audi);
    } else {
      referencePcm = null;
    }
  } catch (e) {
    decodeError = e.message;
  }

  if (referencePcm) {
    const expected = base.totalSamples * base.channels;
    const analysis = analyzePeaks(
      referencePcm.subarray(0, Math.min(referencePcm.length, expected)),
      base.channels,
    );
    Object.assign(peaks, analysis);

    // Roundtrip SNR: decode reference is our best "source" without external WAV
    if (parsed.head.codecId === CodecId.MP5C) {
      const reenc = wasm.encode_mp5c(
        referencePcm.subarray(0, expected),
        base.channels,
        parsed.head.presetId,
      );
      const redecode = wasm.decode_mp5c(reenc);
      snrVsReference = snrDb(
        referencePcm.subarray(0, expected),
        redecode.subarray(0, expected),
      );
    }
  }

  const table = [];
  const headTemplate = {
    channels: parsed.head.channels,
    bitsPerSample: parsed.head.bitsPerSample,
    sampleRate: parsed.head.sampleRate,
    encoderVersion: parsed.head.encoderVersion,
  };

  if (doCompare && referencePcm) {
    const pcmSamples = referencePcm.subarray(0, base.totalSamples * base.channels);
    const outDir = join(root, "test-fixtures", "origami-compare");
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const variants = [
      { label: "PCM fallback", codecId: CodecId.PCM, preset: 0, encoder: "MP5 PCM export (uncompressed)" },
      { label: "MP5-C Low", codecId: CodecId.MP5C, preset: 0, encoder: "MP5-C WASM" },
      { label: "MP5-C Standard", codecId: CodecId.MP5C, preset: 1, encoder: "MP5-C WASM" },
      { label: "MP5-C High", codecId: CodecId.MP5C, preset: 2, encoder: "MP5-C WASM" },
      { label: "MP5-C Extreme", codecId: CodecId.MP5C, preset: 3, encoder: "MP5-C WASM" },
    ];

    for (const v of variants) {
      let bitstream;
      if (v.codecId === CodecId.PCM) {
        bitstream = new Uint8Array(pcmSamples.buffer, pcmSamples.byteOffset, pcmSamples.byteLength);
      } else {
        bitstream = wasm.encode_mp5c(pcmSamples, base.channels, v.preset);
      }
      const file = wrapMp5(
        bitstream,
        headTemplate,
        v.codecId,
        v.preset,
        v.encoder,
        base.totalSamples,
      );
      const outPath = join(outDir, `${v.label.replace(/\s+/g, "_")}.mp5`);
      writeFileSync(outPath, file);

      let snr = null;
      let note = "";
      if (v.codecId === CodecId.MP5C) {
        const dec = wasm.decode_mp5c(bitstream);
        snr = snrDb(pcmSamples, dec.subarray(0, pcmSamples.length));
        note = bitstream[0] === 0x43 && bitstream[1] === 2 ? "MP5-C v2" : "bad magic";
      } else {
        note = "passthrough PCM";
      }

      table.push({
        label: v.label,
        fileBytes: file.length,
        codec: v.codecId === CodecId.PCM ? "PCM" : "MP5-C",
        preset: v.codecId === CodecId.PCM ? "—" : PRESET_NAMES[v.preset],
        snrDb: snr,
        ratioVsPcm: (file.length / base.estimatedPcmBytes).toFixed(4),
        notes: note,
      });
    }
  }

  // Try source file sizes nearby
  const dir = dirname(target);
  const stem = basename(target, ".mp5");
  const sourceCandidates = [".wav", ".flac", ".mp3", ".m4a", ".ogg"].map((ext) =>
    join(dir, stem + ext),
  );
  const sources = sourceCandidates
    .filter(existsSync)
    .map((p) => ({ path: p, bytes: statSync(p).size }));

  console.log(
    JSON.stringify(
      {
        primary: { ...base, decodeError, snrRoundtripDb: snrVsReference, peaks },
        sourcesFound: sources,
        comparisonTable: table,
        userFileMatchesExtremeRow:
          base.codecId === 1 && base.presetId === 3
            ? table.find((r) => r.label === "MP5-C Extreme")
            : null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
