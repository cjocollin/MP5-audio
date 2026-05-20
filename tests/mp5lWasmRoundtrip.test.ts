/**
 * MP5-L v3 WASM encode/decode bit-exact proof (requires pnpm wasm:build).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CodecId, parseMp5, writeMp5 } from "@mp5/container";

type WasmCodec = {
  default: (bytes: BufferSource) => Promise<void>;
  encode_mp5l: (samples: Int16Array, channels: number) => Uint8Array;
  decode_mp5l: (data: Uint8Array) => Int16Array;
};

let wasm: WasmCodec | null = null;
let wasmLoaded = false;

beforeAll(async () => {
  try {
    const mod = (await import("../apps/web/src/wasm/pkg/mp5_codec.js")) as WasmCodec;
    const wasmPath = join(process.cwd(), "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
    await mod.default(readFileSync(wasmPath));
    wasm = mod;
    wasmLoaded = true;
  } catch {
    wasmLoaded = false;
  }
});

function makeSine(n: number, ch: number): Int16Array {
  const out = new Int16Array(n * ch);
  for (let i = 0; i < n; i++) {
    const v = (Math.sin(i * 0.02) * 12000) as number;
    for (let c = 0; c < ch; c++) {
      out[i * ch + c] = Math.round(v);
    }
  }
  return out;
}

describe("MP5-L v3 WASM roundtrip", () => {
  it("encodes v3 bitstream and decodes bit-exact", () => {
    expect(wasmLoaded).toBe(true);
    if (!wasm) throw new Error("WASM not loaded — run pnpm wasm:build");

    const ch = 2;
    const samples = makeSine(8192, ch);
    const bitstream = wasm.encode_mp5l(samples, ch);
    expect(bitstream[0]).toBe(0x4c);
    expect(bitstream[1]).toBe(3);

    const decoded = wasm.decode_mp5l(bitstream);
    expect(decoded.length).toBe(samples.length);
    for (let i = 0; i < samples.length; i++) {
      expect(decoded[i]).toBe(samples[i]);
    }
  });

  it("roundtrips through MP5 container", () => {
    if (!wasm) throw new Error("WASM not loaded");
    const ch = 1;
    const samples = makeSine(4096, ch);
    const bitstream = wasm.encode_mp5l(samples, ch);
    const container = writeMp5({
      head: {
        codecId: CodecId.MP5L,
        channels: ch,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 48000,
        totalSamples: BigInt(samples.length),
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: bitstream }],
      info: [{ key: "encoder", value: "MP5-L WASM v3 (lossless · bit-exact)" }],
    });
    const parsed = parseMp5(container);
    expect(parsed.head?.codecId).toBe(CodecId.MP5L);
    const audi = parsed.audioFrames[0]?.data;
    expect(audi?.[1]).toBe(3);
    const decoded = wasm.decode_mp5l(audi!);
    expect(Array.from(decoded)).toEqual(Array.from(samples));
  });
});
