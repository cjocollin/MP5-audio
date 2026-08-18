/**
 * CodecId 6 joint stereo (Phase 5.1, profile 3) through the WASM surface.
 *
 * Normative reference: docs/MP5C_NEXT_SPEC.md sec. 3.3. Requires `pnpm wasm:build`.
 * Acceptance: >= 8% saving on correlated material without image collapse;
 * anti-phase content stays independent (plan rule).
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

function correlated(frames: number): Int16Array {
  const out = new Int16Array(frames * 2);
  let rng = 0x13579bdf;
  for (let i = 0; i < frames; i++) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const n = ((rng >>> 8) / 2 ** 24 - 0.5) * 3000;
    const t = i;
    const l = Math.sin(t * 0.05) * 9000 + Math.sin(t * 0.013) * 6000 + Math.sin(t * 0.111) * 2500 + n;
    const r = l * 0.92 + n * 0.05;
    out[i * 2] = Math.max(-32768, Math.min(32767, Math.round(l)));
    out[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(r)));
  }
  return out;
}

function antiphase(frames: number): Int16Array {
  const out = new Int16Array(frames * 2);
  let rng = 0x2468ace1;
  for (let i = 0; i < frames; i++) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const n = ((rng >>> 8) / 2 ** 24 - 0.5) * 4000;
    const l = Math.sin(i * 0.043) * 10000 + Math.sin(i * 0.017) * 5000 + n;
    out[i * 2] = Math.max(-32768, Math.min(32767, Math.round(l)));
    out[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(-l)));
  }
  return out;
}

function stereoCorr(samples: Int16Array): number {
  let dot = 0, el = 0, er = 0;
  for (let i = 0; i < samples.length / 2; i++) {
    const l = samples[i * 2], r = samples[i * 2 + 1];
    dot += l * r; el += l * l; er += r * r;
  }
  return el < 1e-9 || er < 1e-9 ? 1 : dot / (Math.sqrt(el) * Math.sqrt(er));
}

describe("CodecId 6 joint stereo (profile 3)", () => {
  it("writes profile 3 with flags.joint_stereo_mode = 1 and M5 payloads", () => {
    const c = codec();
    const stream = c.encode_mp5c6_opt(correlated(SR * 2), 2, PRESET_HIGH, SR, 0, 0, true, false);
    expect(stream[3]).toBe(3); // profile_id
    expect(stream[20] | (stream[21] << 8)).toBe(1); // flags: joint_stereo_mode
    const mix = JSON.parse(c.inspect_unit_mix(stream));
    expect(mix.profile_id).toBe(3);
    expect(c.decode_mp5c6(stream).length).toBe(SR * 2 * 2);
  });

  it("saves >= 8% over independent coding on correlated material", () => {
    const c = codec();
    const src = correlated(SR * 6);
    // Independent baseline: explicit options with joint + window off (M4 payload).
    const indep = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 0, 0, false, false, false);
    const joint = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 0, 0, true, false, false);
    const save = 1 - joint.length / indep.length;
    expect(save).toBeGreaterThanOrEqual(0.08);
    const dec = c.decode_mp5c6(joint);
    expect(dec.length).toBe(src.length);
    // Image must not collapse: correlation is preserved.
    const corrSrc = stereoCorr(src);
    const corrDec = stereoCorr(dec);
    expect(corrSrc).toBeGreaterThan(0.9);
    expect(Math.abs(corrSrc - corrDec)).toBeLessThan(0.05);
  });

  it("keeps anti-phase content independent and stable (no image collapse)", () => {
    const c = codec();
    const src = antiphase(SR * 3);
    const joint = c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 0, 0, true, false);
    const dec = c.decode_mp5c6(joint);
    expect(stereoCorr(dec)).toBeLessThan(-0.85);
  });

  it("refuses joint stereo requests that contradict profile or channels", () => {
    const c = codec();
    const src = correlated(4096);
    // Mono input with joint requested must fail, not silently write flags.
    const mono = new Int16Array(2048);
    expect(() => c.encode_mp5c6_opt(mono, 1, PRESET_HIGH, SR, 0, 0, true, false)).toThrow();
    expect(c.decode_mp5c6(c.encode_mp5c6_opt(src, 2, PRESET_HIGH, SR, 0, 0, false, false)).length).toBe(
      src.length,
    );
  });
});
