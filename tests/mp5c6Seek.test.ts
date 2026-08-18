/**
 * CodecId 6 seek decode (Phase 5.4) through the WASM surface.
 * Requires `pnpm wasm:build`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type WasmCodec = {
  default: (bytes: BufferSource) => Promise<void>;
  encode_mp5c6: (samples: Int16Array, channels: number, preset: number, sampleRate: number) => Uint8Array;
  encode_mp5c6_opt: (
    samples: Int16Array,
    channels: number,
    preset: number,
    sampleRate: number,
    targetKbps: number,
    rateMode: number,
    jointStereo: boolean,
    windowSwitching: boolean,
    psycho: boolean,
  ) => Uint8Array;
  decode_mp5c6: (data: Uint8Array) => Int16Array;
  decode_mp5c6_range: (data: Uint8Array, startFrame: number, numFrames: number) => Int16Array;
};

const SR = 44100;
const PRESET_HIGH = 2;
const UNIT = 1024;

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

function codec(): WasmCodec {
  expect(wasmLoaded).toBe(true);
  if (!wasm) throw new Error("WASM not loaded — run pnpm wasm:build");
  return wasm;
}

function loudQuietLoud(frames: number, ch: number): Int16Array {
  const out = new Int16Array(frames * ch);
  let rng = 0x2468ace0;
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const noise = ((rng >>> 8) / 2 ** 24 - 0.5) * 6000;
    const v =
      t < 0.4 || t > 0.65
        ? Math.sin(i * 0.061) * 14000 + Math.sin(i * 0.023) * 7000 + noise
        : Math.sin(i * 0.061) * 2;
    const q = Math.max(-32768, Math.min(32767, Math.round(v)));
    for (let c = 0; c < ch; c++) out[i * ch + c] = q;
  }
  return out;
}

describe("CodecId 6 seek decode (Phase 5.4)", () => {
  it("decodes ranges identical to full-decode slices", () => {
    const c = codec();
    const frames = UNIT * 10;
    const src = loudQuietLoud(frames, 2);
    const stream = c.encode_mp5c6(src, 2, PRESET_HIGH, SR);
    const full = c.decode_mp5c6(stream);

    expect(Array.from(c.decode_mp5c6_range(stream, 0, frames))).toEqual(Array.from(full));

    for (const [start, len] of [
      [0, UNIT],
      [UNIT, UNIT * 2],
      [UNIT * 7, UNIT * 3],
      [UNIT >> 1, UNIT],
    ] as const) {
      const slice = c.decode_mp5c6_range(stream, start, len);
      expect(Array.from(slice)).toEqual(Array.from(full.slice(start * 2, (start + len) * 2)));
    }
  });

  it("seek works under the full Phase 5 stack", () => {
    const c = codec();
    const frames = UNIT * 10;
    const src = loudQuietLoud(frames, 2);
    const stream = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 192, 1, true, true, true);
    const full = c.decode_mp5c6(stream);
    for (const start of [0, UNIT, UNIT * 5]) {
      const slice = c.decode_mp5c6_range(stream, start, UNIT);
      expect(Array.from(slice)).toEqual(Array.from(full.slice(start * 2, (start + UNIT) * 2)));
    }
  });

  it("fails closed on out-of-range and truncated input", () => {
    const c = codec();
    const frames = UNIT * 6;
    const src = loudQuietLoud(frames, 2);
    const stream = c.encode_mp5c6(src, 2, PRESET_HIGH, SR);
    expect(() => c.decode_mp5c6_range(stream, frames, 1)).toThrow();
    expect(() => c.decode_mp5c6_range(stream, frames - 10, 100)).toThrow();
    expect(() => c.decode_mp5c6_range(stream.subarray(0, stream.length >> 1), 0, UNIT)).toThrow();
  });
});
