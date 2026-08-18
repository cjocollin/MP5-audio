/**
 * CodecId 6 window switching (Phase 5.2, profile 3 window_mode) through the
 * WASM surface. Normative reference: docs/MP5C_NEXT_SPEC.md sec. 3.3.
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
  ) => Uint8Array;
  decode_mp5c6: (data: Uint8Array) => Int16Array;
  inspect_unit_mix: (data: Uint8Array) => string;
};

const SR = 44100;
const PRESET_HIGH = 2;

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

/** Loud / near-silent / loud, mirrors the Rust container fixture. */
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

function regionErrorDb(src: Int16Array, dec: Int16Array, from: number, to: number): number {
  let err = 0;
  let n = 0;
  for (let i = from * 2; i < to * 2; i++) {
    const e = src[i] - dec[i];
    err += e * e;
    n++;
  }
  return 10 * Math.log10(err / Math.max(n, 1) / (32767 * 32767));
}

/** Silence, one sharp attack at `attackAt`, tonal decay. */
function castanet(frames: number, attackAt: number): Int16Array {
  const out = new Int16Array(frames * 2);
  let rng = 0x0badf00d;
  for (let i = attackAt; i < frames; i++) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const t = i - attackAt;
    const env = Math.exp(-t / 1500);
    const noise = ((rng >>> 8) / 2 ** 24 - 0.5) * 2;
    const v = (Math.sin(t * 0.35) * 0.7 + noise * 0.3) * env * 24000;
    const q = Math.max(-32768, Math.min(32767, Math.round(v)));
    out[i * 2] = q;
    out[i * 2 + 1] = q;
  }
  return out;
}

describe("CodecId 6 window switching (profile 3 window_mode)", () => {
  it("writes flags.window_mode = 1 and decodes to full duration", () => {
    const c = codec();
    const src = loudQuietLoud(SR * 3, 2);
    const stream = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 0, 0, false, true);
    expect(stream[3]).toBe(3);
    expect(stream[20] | (stream[21] << 8)).toBe(4);
    expect(c.decode_mp5c6(stream).length).toBe(src.length);
    const mix = JSON.parse(c.inspect_unit_mix(stream));
    expect(mix.profile_id).toBe(3);
  });

  it("combines with joint stereo (flags = 5)", () => {
    const c = codec();
    const src = loudQuietLoud(SR * 2, 2);
    const stream = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 0, 0, true, true);
    expect(stream[20] | (stream[21] << 8)).toBe(5);
    expect(c.decode_mp5c6(stream).length).toBe(src.length);
  });

  it("beats tighten-only pre-echo by >= 12 dB (acceptance)", () => {
    const c = codec();
    const frames = 16384;
    const attackAt = 6000;
    const src = castanet(frames, attackAt);
    // tighten-only: explicit options with window switching off (legacy path)
    const tighten = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 0, 0, false, false, false);
    const windowed = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 0, 0, false, true);
    const decT = c.decode_mp5c6(tighten);
    const decW = c.decode_mp5c6(windowed);
    expect(decT.length).toBe(src.length);
    expect(decW.length).toBe(src.length);
    const eT = regionErrorDb(src, decT, attackAt - 1024, attackAt - 64);
    const eW = regionErrorDb(src, decW, attackAt - 1024, attackAt - 64);
    expect(eT - eW).toBeGreaterThanOrEqual(12.0);
  });

  it("hits ABR targets with window switching on", () => {
    const c = codec();
    const src = loudQuietLoud(SR * 3, 2);
    for (const kbps of [320, 128]) {
      const stream = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, kbps, 1, false, true);
      const achieved = (stream.length * 8) / 1000 / (src.length / 2 / SR);
      expect(Math.abs(achieved - kbps) / kbps).toBeLessThanOrEqual(0.03);
      expect(c.decode_mp5c6(stream).length).toBe(src.length);
    }
  });
});
