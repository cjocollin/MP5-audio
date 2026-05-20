import { expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  CodecId,
  parseMp5,
  validateParsedFile,
  writeMp5,
  type MetaField,
} from "@mp5/container";
import { buildExportMetadataBundle } from "../../apps/web/src/converter/buildExportBundles";
import { generateWaveform } from "../../apps/web/src/converter/generateWaveform";
import { codecLabel } from "../../apps/web/src/lib/codecDisplay";

export type WasmCodec = {
  default: (bytes: BufferSource) => Promise<void>;
  encode_mp5l: (samples: Int16Array, channels: number) => Uint8Array;
  decode_mp5l: (data: Uint8Array) => Int16Array;
  encode_mp5c: (samples: Int16Array, channels: number, preset: number) => Uint8Array;
  encode_mp5h: (samples: Int16Array, channels: number, preset: number) => Uint8Array;
  decode_mp5h: (data: Uint8Array, enhanced: boolean) => Int16Array;
};

let wasm: WasmCodec | null = null;
let wasmReady = false;

export async function loadWasmHarness(): Promise<boolean> {
  if (wasmReady) return true;
  try {
    const wasmPath = join(process.cwd(), "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
    if (!existsSync(wasmPath)) return false;
    const mod = (await import("../../apps/web/src/wasm/pkg/mp5_codec.js")) as WasmCodec;
    await mod.default(readFileSync(wasmPath));
    wasm = mod;
    wasmReady = true;
    return true;
  } catch {
    return false;
  }
}

export function getWasm(): WasmCodec {
  if (!wasm) throw new Error("WASM not loaded — run pnpm wasm:build");
  return wasm;
}

export function peaksFromSamples(samples: Int16Array, channels: number): number[] {
  const frames = samples.length / channels;
  const peaks: number[] = [];
  const step = Math.max(1, Math.floor(frames / 128));
  for (let i = 0; i < frames; i += step) {
    let max = 0;
    for (let c = 0; c < channels; c++) {
      max = Math.max(max, Math.abs(samples[i * channels + c] ?? 0));
    }
    peaks.push(max / 32768);
  }
  return peaks;
}

export async function exportMp5lFromPcm(args: {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  meta?: Record<string, string>;
  cover?: { mime: string; data: Uint8Array };
}): Promise<Uint8Array> {
  const wave = generateWaveform(args.samples, args.channels);
  const bundle = buildExportMetadataBundle(
    { meta: args.meta ?? { title: "Compat test" } },
    args.cover ? { cover: args.cover } : undefined,
    { peak: wave.peak, rms: wave.rms },
  );

  const bitstream = getWasm().encode_mp5l(args.samples, args.channels);
  const totalSamples = BigInt(Math.floor(args.samples.length / args.channels));

  return writeMp5({
    head: {
      codecId: CodecId.MP5L,
      channels: args.channels,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: args.sampleRate,
      totalSamples,
      encoderVersion: 1,
    },
    meta: bundle.metaFields,
    cover: bundle.cover,
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: bitstream }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: wave.peaks,
    info: [{ key: "encoder", value: "MP5-L WASM v3 (lossless · bit-exact)" }],
    optional: bundle.optional,
  });
}

export function assertMp5lExportValid(
  buf: Uint8Array,
  sourceSamples: Int16Array,
  channels: number,
): ReturnType<typeof parseMp5> {
  const parsed = parseMp5(buf);
  validateParsedFile(parsed, 16);
  expect(parsed.head?.codecId).toBe(CodecId.MP5L);
  expect(parsed.waveform?.length).toBeGreaterThan(0);
  expect(parsed.seek?.length).toBeGreaterThan(0);
  expect(codecLabel(parsed.head?.codecId ?? 0)).toMatch(/MP5-L/i);

  const frame = parsed.audioFrames[0]?.data;
  if (!frame) throw new Error("missing audio frame");
  const decoded = getWasm().decode_mp5l(frame);
  expect(decoded.length).toBe(sourceSamples.length);
  for (let i = 0; i < Math.min(500, sourceSamples.length); i++) {
    expect(decoded[i]).toBe(sourceSamples[i]);
  }
  for (let i = 0; i < sourceSamples.length; i++) {
    expect(decoded[i]).toBe(sourceSamples[i]);
  }
  return parsed;
}

export function writeCompatMp5(args: {
  codecId: number;
  bitstream: Uint8Array;
  sampleRate: number;
  channels: number;
  totalSamples: bigint;
  meta?: MetaField[];
  corr?: { frameIndex: number; data: Uint8Array }[];
  optional?: Map<string, Uint8Array>;
}): Uint8Array {
  return writeMp5({
    head: {
      codecId: args.codecId as 0 | 1 | 2 | 3,
      channels: args.channels,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: args.sampleRate,
      totalSamples: args.totalSamples,
      encoderVersion: 1,
    },
    meta: args.meta ?? [],
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: args.bitstream }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: [0.1, 0.5, 0.2],
    corr: args.corr,
    optional: args.optional,
  });
}
