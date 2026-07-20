// MP5 Audio Quality Lab — .mp5 container → PCM decode contract.
//
// Mirrors the app's authoritative decode path (apps/web/src/player/decodeMp5.ts):
//   parseMp5 → HEAD (codecId, channels, sampleRate, totalSamples) → AUDI bitstream
//   → matching WASM decoder → TRIM to totalSamples (MP5-C/MP5-H are frame-padded).
// MP5-H wraps the base AUDI stream with its CORR chunk before decode.
//
// This module is what makes `audio:compare-files` honest: a wrong length/offset
// here would masquerade as codec hiss, so `selfTest()` proves the path first.
import { readFileSync } from "node:fs";

// Resolve the built container relative to this file. Plain `node` cannot resolve
// the bare "@mp5/container" specifier (the repo wires it via a vitest alias), so
// the lab loads the compiled dist directly. Both node and vitest load this path.
let parseMp5, writeMp5, CodecId;
try {
  ({ parseMp5, writeMp5, CodecId } = await import(
    new URL("../../packages/mp5-container/dist/index.js", import.meta.url).href
  ));
} catch (e) {
  throw new Error(
    "@mp5/container is not built — run `pnpm --filter @mp5/container build` " +
      `(or any \`pnpm build\`) before using audio-lab .mp5 tooling. (${e.message})`,
  );
}

export const CODEC_NAME = {
  [CodecId.PCM]: "PCM",
  [CodecId.MP5C]: "MP5-C",
  [CodecId.MP5L]: "MP5-L",
  [CodecId.MP5H]: "MP5-H",
  [CodecId.MP5C2]: "MP5-C2",
  [CodecId.PASSTHROUGH]: "Passthrough",
};

function wrapMp5h(base, corr) {
  const out = new Uint8Array(6 + base.length + 4 + corr.length);
  out[0] = 0x48;
  out[1] = 0x01;
  const dv = new DataView(out.buffer);
  dv.setUint32(2, base.length, true);
  out.set(base, 6);
  const o = 6 + base.length;
  dv.setUint32(o, corr.length, true);
  out.set(corr, o + 4);
  return out;
}

/** Parse a .mp5 file from disk into the container's Mp5File structure. */
export function parseMp5File(path) {
  return parseMp5(readFileSync(path));
}

function bitstreamVersion(frame) {
  // MP5-L 0x4c / MP5-C 0x43 / MP5-H 0x48 magic, version in byte 1.
  if (!frame || frame.length < 2) return null;
  return frame[1];
}

/**
 * Decode a parsed Mp5File to interleaved i16 PCM, trimmed to totalSamples.
 * @returns {{samples:Int16Array, sampleRate:number, channels:number,
 *            totalFrames:number, codecId:number, codecName:string,
 *            decodePath:string, hasCorr:boolean, bitstreamVersion:number|null,
 *            framePaddedSamples:number}}
 */
export function decodeParsedToPcm(codec, parsed) {
  if (!parsed.head) throw new Error("missing HEAD chunk");
  const head = parsed.head;
  const frame = parsed.audioFrames?.[0]?.data;
  if (!frame) throw new Error("no AUDI frame");
  const ch = head.channels;
  const totalFrames = Number(head.totalSamples);
  let raw;
  let decodePath;
  let hasCorr = false;

  switch (head.codecId) {
    case CodecId.MP5L:
      raw = codec.decode_mp5l(frame);
      decodePath = `MP5-L WASM v${bitstreamVersion(frame)} decode (lossless)`;
      break;
    case CodecId.MP5C:
      raw = codec.decode_mp5c(frame);
      decodePath = `MP5-C WASM v${bitstreamVersion(frame)} decode (lossy/experimental)`;
      break;
    case CodecId.MP5C2:
      raw = codec.decode_mp5c_vnext(frame);
      decodePath = "MP5-C vNext WASM decode (hybrid quiet-lossless)";
      break;
    case CodecId.MP5H: {
      const corr = parsed.corr?.[0]?.data;
      hasCorr = !!(corr && corr.length > 0);
      const wrapped = hasCorr ? wrapMp5h(frame, corr) : frame;
      raw = codec.decode_mp5h(wrapped, hasCorr);
      decodePath = hasCorr
        ? "MP5-H WASM enhanced decode (CORR applied)"
        : "MP5-H WASM base-only decode (CORR missing)";
      break;
    }
    case CodecId.PCM:
      raw = new Int16Array(frame.buffer, frame.byteOffset, frame.byteLength >> 1);
      decodePath = "PCM (container passthrough)";
      break;
    default:
      throw new Error(`unsupported codec id ${head.codecId}`);
  }

  const want = totalFrames * ch;
  const framePaddedSamples = Math.max(0, raw.length - want);
  const samples = raw.length > want ? raw.subarray(0, want) : raw;
  return {
    samples,
    sampleRate: head.sampleRate,
    channels: ch,
    totalFrames,
    codecId: head.codecId,
    codecName: CODEC_NAME[head.codecId] ?? `codec ${head.codecId}`,
    decodePath,
    hasCorr,
    bitstreamVersion: bitstreamVersion(frame),
    framePaddedSamples,
  };
}

/** Decode a .mp5 file path straight to PCM (parse + decode). */
export function decodeMp5FileToPcm(codec, path) {
  return decodeParsedToPcm(codec, parseMp5File(path));
}

/** Structural inspection (no decode) for the reference report. */
export function inspectParsed(parsed, fileSizeBytes) {
  const head = parsed.head ?? {};
  const ch = head.channels ?? 0;
  const totalFrames = head.totalSamples ? Number(head.totalSamples) : 0;
  const sr = head.sampleRate ?? 0;
  const pcmBytes = totalFrames * ch * (head.bitsPerSample ? head.bitsPerSample / 8 : 2);
  const frame = parsed.audioFrames?.[0]?.data;
  const corr = parsed.corr?.[0]?.data;
  const chunks = new Set();
  if (head) chunks.add("HEAD");
  if (parsed.audioFrames?.length) chunks.add("AUDI");
  if (corr && corr.length) chunks.add("CORR");
  if (parsed.cover) chunks.add("COVR");
  if (parsed.waveform?.length) chunks.add("WAVE");
  if (parsed.seek?.length) chunks.add("SEEK");
  if (parsed.meta?.length) chunks.add("META");
  for (const k of parsed.optional?.keys?.() ?? []) chunks.add(k);
  const encoderLabel =
    parsed.info?.find((i) => i.key === "encoder")?.value ??
    parsed.info?.[0]?.value ??
    "(none)";
  return {
    codecId: head.codecId,
    codecName: CODEC_NAME[head.codecId] ?? `codec ${head.codecId}`,
    bitstreamVersion: bitstreamVersion(frame),
    presetId: head.presetId,
    channels: ch,
    sampleRate: sr,
    bitsPerSample: head.bitsPerSample,
    totalFrames,
    durationSec: sr ? totalFrames / sr : 0,
    fileSizeBytes,
    estPcmBytes: pcmBytes,
    ratioVsPcm: pcmBytes ? fileSizeBytes / pcmBytes : null,
    chunks: [...chunks],
    encoderLabel,
    hasCorr: !!(corr && corr.length > 0),
    corrBytes: corr?.length ?? 0,
    expectedBitExact:
      head.codecId === CodecId.MP5L ||
      head.codecId === CodecId.PCM ||
      (head.codecId === CodecId.MP5H && !!(corr && corr.length > 0)),
  };
}

/**
 * Pipeline self-test: encode a fixture to a real container via writeMp5, parse it
 * back, decode through the contract, and require MP5-L bit-exact. Catches
 * length/trim/parse bugs before any hiss conclusion is drawn.
 */
export function selfTest(codec) {
  const ch = 2;
  const frames = 5000;
  const src = new Int16Array(frames * ch);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin(i * 0.02) * 12000);
    src[i * 2] = v;
    src[i * 2 + 1] = Math.round(Math.cos(i * 0.013) * 9000);
  }
  const bitstream = codec.encode_mp5l(src, ch);
  const container = writeMp5({
    head: {
      codecId: CodecId.MP5L,
      channels: ch,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: 44100,
      totalSamples: BigInt(frames),
      encoderVersion: 1,
    },
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: bitstream }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: [0.1, 0.2, 0.1],
    info: [{ key: "encoder", value: "audio-lab self-test" }],
  });
  const parsed = parseMp5(container);
  const out = decodeParsedToPcm(codec, parsed);
  if (out.samples.length !== src.length) {
    return { ok: false, reason: `length ${out.samples.length} != ${src.length}` };
  }
  for (let i = 0; i < src.length; i++) {
    if (out.samples[i] !== src[i]) {
      return { ok: false, reason: `sample ${i} differs (${out.samples[i]} != ${src[i]})` };
    }
  }
  return { ok: true, frames, channels: ch };
}
