/**
 * Verifies MP5-C Extreme is a real WASM encode/decode path (not header-only PCM).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  CodecId,
  parseMp5,
  writeMp5,
  type AudioFrame,
} from "@mp5/container";

const FIXTURE_DIR = join(process.cwd(), "test-fixtures");
const FIXTURE_MP5C = join(FIXTURE_DIR, "verification_mp5c_extreme.mp5");
const FIXTURE_PCM = join(FIXTURE_DIR, "verification_pcm_compare.mp5");

const PRESET_EXTREME = 3;
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const DURATION_SEC = 2;

function makeStereoPcm(): Int16Array {
  const n = SAMPLE_RATE * DURATION_SEC;
  const out = new Int16Array(n * CHANNELS);
  for (let i = 0; i < n; i++) {
    out[i * 2] = Math.round(Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 14000);
    out[i * 2 + 1] = Math.round(Math.cos((2 * Math.PI * 330 * i) / SAMPLE_RATE) * 14000);
  }
  return out;
}

function snrDb(original: Float32Array, decoded: Float32Array): number {
  const n = Math.min(original.length, decoded.length);
  let sig = 0;
  let err = 0;
  for (let i = 0; i < n; i++) {
    const o = original[i]!;
    const d = decoded[i]!;
    sig += o * o;
    const e = o - d;
    err += e * e;
  }
  if (err === 0) return Infinity;
  return 10 * Math.log10(sig / err);
}

function i16ToF32(s: Int16Array): Float32Array {
  const o = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s[i]! / 32768;
  return o;
}

type WasmCodec = {
  default: (path?: string) => Promise<unknown>;
  encode_mp5c: (s: Int16Array, ch: number, preset: number) => Uint8Array;
  decode_mp5c: (d: Uint8Array) => Int16Array;
};

let wasm: WasmCodec | null = null;
let wasmLoaded = false;

beforeAll(async () => {
  try {
    const mod = (await import("../apps/web/src/wasm/pkg/mp5_codec.js")) as WasmCodec;
    const wasmPath = join(process.cwd(), "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
    const wasmBytes = readFileSync(wasmPath);
    await mod.default(wasmBytes);
    wasm = mod;
    wasmLoaded = true;
  } catch (e) {
    console.warn("WASM not available in test runner:", e);
    wasmLoaded = false;
  }
});

function wrapInMp5(
  bitstream: Uint8Array,
  codecId: number,
  presetId: number,
  encoder: string,
  totalSamples: bigint,
): Uint8Array {
  const frames: AudioFrame[] = [{ frameIndex: 0, blockType: 0, flags: 0, data: bitstream }];
  return writeMp5({
    head: {
      codecId: codecId as 0 | 1 | 2 | 3,
      channels: CHANNELS,
      bitsPerSample: 16,
      presetId,
      sampleRate: SAMPLE_RATE,
      totalSamples,
      encoderVersion: 1,
    },
    meta: [{ key: "title", value: "MP5-C verification" }],
    audioFrames: frames,
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: [0.1, 0.5, 0.9],
    info: [{ key: "encoder", value: encoder }],
  });
}

describe("MP5-C Extreme encode path verification", () => {
  it("WASM codec loads in Node (same pkg as browser)", () => {
    expect(wasmLoaded).toBe(true);
  });

  it("full checklist: codec_id, bitstream magic, decode path, sizes, SNR", () => {
    if (!wasm) {
      throw new Error("Skip: WASM not loaded — run pnpm wasm:build");
    }

    const pcm = makeStereoPcm();
    const totalSamples = BigInt(pcm.length / CHANNELS);

    const pcmBitstream = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const pcmFile = wrapInMp5(pcmBitstream, CodecId.PCM, 0, "MP5 PCM export (uncompressed)", totalSamples);

    const mp5cBitstream = wasm.encode_mp5c(pcm, CHANNELS, PRESET_EXTREME);
    const mp5cFile = wrapInMp5(
      mp5cBitstream,
      CodecId.MP5C,
      PRESET_EXTREME,
      "MP5-C WASM v4 (experimental)",
      totalSamples,
    );

    if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFileSync(FIXTURE_PCM, pcmFile);
    writeFileSync(FIXTURE_MP5C, mp5cFile);

    const parsed = parseMp5(mp5cFile);
    const audi = parsed.audioFrames[0]!.data;

    expect(parsed.head?.codecId).toBe(CodecId.MP5C);
    expect(parsed.head?.presetId).toBe(PRESET_EXTREME);
    expect(parsed.info.find((i) => i.key === "encoder")?.value).toBe(
      "MP5-C WASM v4 (experimental)",
    );

    expect(audi[0]).toBe(0x43);
    expect(audi[1]).toBe(6); // MP5-C v5.1 bitstream (current encoder)

    // AUDI payload must be MP5-C bitstream, not raw PCM bytes (size differs; not a passthrough)
    expect(audi.length).not.toBe(pcmBitstream.length);
    expect(Buffer.from(audi).equals(Buffer.from(pcmBitstream))).toBe(false);
    expect(mp5cFile.length).not.toBe(pcmFile.length);

    const decoded = wasm.decode_mp5c(audi);
    // Decode pads to full MP5-C frames; compare against HEAD totalSamples
    const expectedSamples = Number(totalSamples) * CHANNELS;
    expect(decoded.length).toBeGreaterThanOrEqual(expectedSamples);

    const snr = snrDb(
      i16ToF32(pcm.subarray(0, expectedSamples)),
      i16ToF32(decoded.subarray(0, expectedSamples)),
    );
    expect(snr).toBeGreaterThan(20);

    let pcmDecodeFailed = false;
    try {
      wasm.decode_mp5c(pcmBitstream);
    } catch {
      pcmDecodeFailed = true;
    }
    expect(pcmDecodeFailed).toBe(true);
  });
});
