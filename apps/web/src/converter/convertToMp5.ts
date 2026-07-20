import { CodecId, writeMp5, type AudioFrame, type CodecIdValue, type CoverArt, type MetaField } from "@mp5/container";
import { getCodec, CodecPreset, isWasmCodecReady } from "../wasm/codec";
import { generateWaveform } from "./generateWaveform";

export type OutputCodec = "pcm" | "mp5c" | "mp5l" | "mp5h" | "mp5c2";

export interface ConvertOptions {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  codec: OutputCodec;
  preset?: number;
  metadata?: Record<string, string>;
  metaFields?: MetaField[];
  cover?: CoverArt | Uint8Array;
  optional?: Map<string, Uint8Array>;
  extraChunks?: { fourcc: string; payload: Uint8Array }[];
}

export async function convertToMp5(opts: ConvertOptions): Promise<Uint8Array> {
  const codec = await getCodec();
  const wasmReady = isWasmCodecReady();
  const ch = opts.channels;
  const preset =
    opts.codec === "mp5l" || opts.codec === "pcm"
      ? 0
      : (opts.preset ?? CodecPreset.High);

  if (!wasmReady && opts.codec !== "pcm") {
    throw new Error(
      "MP5 codecs require WASM. Run pnpm wasm:build and refresh, or export as PCM only.",
    );
  }

  let bitstream: Uint8Array;
  let codecId: number;
  let corrFrames: { frameIndex: number; data: Uint8Array }[] | undefined;
  let encoderLabel = "MP5 Reference v0.1";

  if (opts.codec === "pcm" || !wasmReady) {
    bitstream = new Uint8Array(opts.samples.buffer, opts.samples.byteOffset, opts.samples.byteLength);
    codecId = CodecId.PCM;
    encoderLabel = "MP5 PCM export (uncompressed)";
  } else if (opts.codec === "mp5l") {
    bitstream = codec.encode_mp5l(opts.samples, ch);
    codecId = CodecId.MP5L;
    encoderLabel = "MP5-L WASM v3 (lossless · bit-exact)";
  } else if (opts.codec === "mp5h") {
    // Size-gate: build best H (≥ requested preset) vs pure MP5-L; emit smaller with honest CodecId.
    const wrapped = codec.encode_mp5h_min(opts.samples, ch, preset);
    const lBitstream = codec.encode_mp5l(opts.samples, ch);

    let hBase: Uint8Array;
    let hCorr: Uint8Array | null = null;
    if (wrapped[0] === 0x48) {
      const view = new DataView(wrapped.buffer, wrapped.byteOffset, wrapped.byteLength);
      const baseLen = view.getUint32(2, true);
      hBase = wrapped.slice(6, 6 + baseLen);
      const corrOff = 6 + baseLen;
      const corrLen = view.getUint32(corrOff, true);
      hCorr = wrapped.slice(corrOff + 4, corrOff + 4 + corrLen);
    } else {
      hBase = wrapped;
    }

    const hFrames: AudioFrame[] = [{ frameIndex: 0, timeType: 0, flags: 0, data: hBase }];
    const lFrames: AudioFrame[] = [{ frameIndex: 0, timeType: 0, flags: 0, data: lBitstream }];
    const totalSamples = BigInt(Math.floor(opts.samples.length / ch));
    const wave = generateWaveform(opts.samples, ch);
    const meta =
      opts.metaFields ??
      Object.entries(opts.metadata ?? {}).map(([key, value]) => ({ key, value }));

    const hFile = writeMp5({
      head: {
        codecId: CodecId.MP5H as CodecIdValue,
        channels: ch,
        bitsPerSample: 16,
        presetId: preset,
        sampleRate: opts.sampleRate,
        totalSamples,
        encoderVersion: 1,
      },
      meta,
      cover: opts.cover,
      audioFrames: hFrames,
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      waveform: wave.peaks,
      info: [{ key: "encoder", value: "MP5-H WASM (MP5-C base + lossless CORR)" }],
      corr: hCorr ? [{ frameIndex: 0, data: hCorr }] : undefined,
      optional: opts.optional,
      extraChunks: opts.extraChunks,
    });
    const lFile = writeMp5({
      head: {
        codecId: CodecId.MP5L as CodecIdValue,
        channels: ch,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: opts.sampleRate,
        totalSamples,
        encoderVersion: 1,
      },
      meta,
      cover: opts.cover,
      audioFrames: lFrames,
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      waveform: wave.peaks,
      info: [
        {
          key: "encoder",
          value: "MP5-L WASM v3 (lossless · bit-exact; H request resolved to smaller L)",
        },
      ],
      optional: opts.optional,
      extraChunks: opts.extraChunks,
    });

    if (lFile.length <= hFile.length) {
      return lFile;
    }
    return hFile;
  } else if (opts.codec === "mp5c2") {
    const encodeAt =
      typeof codec.encode_mp5c_vnext_at === "function"
        ? codec.encode_mp5c_vnext_at
        : null;
    bitstream = encodeAt
      ? encodeAt(opts.samples, ch, preset, opts.sampleRate >>> 0)
      : codec.encode_mp5c_vnext(opts.samples, ch, preset);
    codecId = CodecId.MP5C2;
    encoderLabel = "MP5-C2 WASM (hybrid quiet-lossless + SR loud · not default)";
  } else {
    bitstream = codec.encode_mp5c(opts.samples, ch, preset);
    codecId = CodecId.MP5C;
    encoderLabel = "MP5-C WASM v5.1 (experimental — may hiss)";
  }

  const frames: AudioFrame[] = [{ frameIndex: 0, blockType: 0, flags: 0, data: bitstream }];

  const totalSamples = BigInt(Math.floor(opts.samples.length / ch));
  const wave = generateWaveform(opts.samples, ch);

  const meta =
    opts.metaFields ??
    Object.entries(opts.metadata ?? {}).map(([key, value]) => ({
      key,
      value,
    }));

  return writeMp5({
    head: {
      codecId: codecId as CodecIdValue,
      channels: ch,
      bitsPerSample: 16,
      presetId: preset,
      sampleRate: opts.sampleRate,
      totalSamples,
      encoderVersion: 1,
    },
    meta,
    cover: opts.cover,
    audioFrames: frames,
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: wave.peaks,
    info: [{ key: "encoder", value: encoderLabel }],
    corr: corrFrames,
    optional: opts.optional,
    extraChunks: opts.extraChunks,
  });
}
