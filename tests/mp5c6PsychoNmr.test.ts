/**
 * Phase 5.3 psycho model + NMR reject-filter screen through the WASM surface.
 * Normative reference: docs/MP5C_NEXT_SPEC.md sec. 5. Requires `pnpm wasm:build`.
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
  encode_mp5c6_vbr: (
    samples: Int16Array,
    channels: number,
    preset: number,
    sampleRate: number,
    qi: number,
  ) => Uint8Array;
  decode_mp5c6: (data: Uint8Array) => Int16Array;
  nmr_screen_wasm: (
    original: Int16Array,
    decoded: Int16Array,
    channels: number,
    sampleRate: number,
  ) => string;
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

describe("Phase 5.3 psycho model through WASM", () => {
  it("encodes profile 3 with psycho on and decodes to full duration", () => {
    const c = codec();
    const src = loudQuietLoud(SR * 3, 2);
    const stream = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 0, 0, false, false, true);
    expect(stream[3]).toBe(3);
    // psycho is encoder-side: flags stay 0 when js/win are off.
    expect(stream[20] | (stream[21] << 8)).toBe(0);
    expect(c.decode_mp5c6(stream).length).toBe(src.length);
  });

  it("full stack (js + win + psycho) hits constrained ABR targets", () => {
    const c = codec();
    const src = loudQuietLoud(SR * 3, 2);
    for (const kbps of [96, 80]) {
      const stream = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, kbps, 1, true, true, true);
      const achieved = (stream.length * 8) / 1000 / (src.length / 2 / SR);
      expect(Math.abs(achieved - kbps) / kbps).toBeLessThanOrEqual(0.03);
      expect(c.decode_mp5c6(stream).length).toBe(src.length);
    }
  });
});

describe("NMR reject-filter screen (Phase 5.3)", () => {
  it("passes a sound encode and rejects a degraded one", () => {
    const c = codec();
    const src = loudQuietLoud(SR * 3, 2);
    const good = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 0, 0, false, false, true);
    const decGood = c.decode_mp5c6(good);
    const goodReport = JSON.parse(c.nmr_screen_wasm(src, decGood, 2, SR));
    expect(goodReport.frames).toBeGreaterThan(0);
    expect(goodReport.maxNmrDb).toBeLessThan(10.0);

    // Degraded: VBR quality index way down.
    const bad = c.encode_mp5c6_vbr(src, 2, PRESET_HIGH, SR, -16);
    const decBad = c.decode_mp5c6(bad);
    const badReport = JSON.parse(c.nmr_screen_wasm(src, decBad, 2, SR));
    expect(badReport.maxNmrDb).toBeGreaterThan(goodReport.maxNmrDb);
    expect(badReport.maxNmrDb).toBeGreaterThan(10.0);
  });

  it("is deterministic on identical inputs", () => {
    const c = codec();
    const src = loudQuietLoud(8192, 2);
    const a = c.nmr_screen_wasm(src, src, 2, SR);
    const b = c.nmr_screen_wasm(src, src, 2, SR);
    expect(a).toBe(b);
    // Source vs itself has no noise: NMR should be very negative.
    const report = JSON.parse(a);
    expect(report.maxNmrDb).toBeLessThan(-30);
  });
});
