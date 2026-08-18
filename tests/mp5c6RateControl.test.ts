/**
 * CodecId 6 deterministic rate control (Phase 4.3) through the WASM surface.
 *
 * Normative reference: docs/MP5C_NEXT_SPEC.md sec. 6.3. Requires `pnpm wasm:build`.
 *
 * The ladder is proven in order — 320 first, then 192, then 128 — and every
 * rate-targeted stream must (a) land within ±3% track-average, (b) record its
 * target in the header, (c) keep protect islands sample-exact, and (d) be
 * byte-identical on re-encode.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type WasmCodec = {
  default: (bytes: BufferSource) => Promise<void>;
  encode_mp5c6: (samples: Int16Array, channels: number, preset: number, sampleRate: number) => Uint8Array;
  encode_mp5c6_at: (
    samples: Int16Array,
    channels: number,
    preset: number,
    sampleRate: number,
    targetKbps: number,
    rateMode: number,
  ) => Uint8Array;
  encode_mp5c6_vbr: (
    samples: Int16Array,
    channels: number,
    preset: number,
    sampleRate: number,
    qi: number,
  ) => Uint8Array;
  decode_mp5c6: (data: Uint8Array) => Int16Array;
  decode_mp5l: (data: Uint8Array) => Int16Array;
  inspect_unit_mix: (data: Uint8Array) => string;
};

const SR = 44100;
const PRESET_HIGH = 2;
const HEADER_LEN = 28;
const UNIT_PREFIX_LEN = 9;
const UNIT_CRC_LEN = 4;
const TAG_LOSSLESS = 0x4c;
const TAG_BAND = 0x42;

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

/** Dense loud / near-silent / loud: MDCT units plus protect islands. */
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

function u16(data: Uint8Array, at: number): number {
  return data[at] | (data[at + 1] << 8);
}

function u32(data: Uint8Array, at: number): number {
  return (
    (data[at] | (data[at + 1] << 8) | (data[at + 2] << 16) | (data[at + 3] << 24)) >>> 0
  );
}

function totalKbps(bytes: number, frames: number): number {
  return (bytes * 8) / 1000 / (frames / SR);
}

const LADDER = [320, 192, 128] as const;

describe("CodecId 6 ABR rate control", () => {
  it("hits the 320/192/128 ladder within ±3% with protect islands intact", () => {
    const c = codec();
    const frames = SR * 3;
    const src = loudQuietLoud(frames, 2);
    for (const kbps of LADDER) {
      const stream = c.encode_mp5c6_at(src, 2, PRESET_HIGH, SR, kbps, 1);
      // Header records the honest target.
      expect(u16(stream, 16)).toBe(kbps);
      const mix = JSON.parse(c.inspect_unit_mix(stream));
      expect(mix.target_bitrate_kbps).toBe(kbps);
      expect(mix.tags.mdct.units).toBeGreaterThan(0);
      expect(mix.tags.lossless_l.units + mix.tags.lossless_b.units).toBeGreaterThan(0);

      const achieved = totalKbps(stream.length, frames);
      const err = Math.abs(achieved - kbps) / kbps;
      expect(err).toBeLessThanOrEqual(0.03);

      // Decodes to full duration; protect islands stay sample-exact.
      const decoded = c.decode_mp5c6(stream);
      expect(decoded.length).toBe(src.length);
      let frame = 0;
      let pos = HEADER_LEN;
      let protectChecked = 0;
      while (pos < stream.length) {
        const tag = stream[pos];
        const n = u32(stream, pos + 1);
        const len = u32(stream, pos + 5);
        const payload = stream.subarray(pos + UNIT_PREFIX_LEN, pos + UNIT_PREFIX_LEN + len);
        if (tag === TAG_LOSSLESS || tag === TAG_BAND) {
          const island = c.decode_mp5l(payload);
          for (let i = 0; i < island.length; i++) {
            expect(island[i]).toBe(src[frame * 2 + i]);
          }
          protectChecked++;
        }
        frame += n;
        pos += UNIT_PREFIX_LEN + len + UNIT_CRC_LEN;
      }
      expect(protectChecked).toBeGreaterThan(0);
    }
  });

  it("is byte-identical on re-encode (deterministic, bounded search)", () => {
    const c = codec();
    const src = loudQuietLoud(SR * 2, 2);
    for (const kbps of LADDER) {
      const a = c.encode_mp5c6_at(src, 2, PRESET_HIGH, SR, kbps, 1);
      const b = c.encode_mp5c6_at(src, 2, PRESET_HIGH, SR, kbps, 1);
      expect(Array.from(a)).toEqual(Array.from(b));
    }
  });
});

describe("CodecId 6 CBR rate control", () => {
  it("hits targets within ±3% and records them", () => {
    const c = codec();
    const frames = SR * 3;
    const src = loudQuietLoud(frames, 2);
    for (const kbps of LADDER) {
      const stream = c.encode_mp5c6_at(src, 2, PRESET_HIGH, SR, kbps, 2);
      expect(u16(stream, 16)).toBe(kbps);
      const err = Math.abs(totalKbps(stream.length, frames) - kbps) / kbps;
      expect(err).toBeLessThanOrEqual(0.03);
      expect(c.decode_mp5c6(stream).length).toBe(src.length);
    }
  });
});

describe("CodecId 6 VBR quality index", () => {
  it("scales size monotonically and never claims a rate target", () => {
    const c = codec();
    const frames = SR * 2;
    const src = loudQuietLoud(frames, 2);
    const sizes: number[] = [];
    for (const qi of [-8, 0, 8]) {
      const stream = c.encode_mp5c6_vbr(src, 2, PRESET_HIGH, SR, qi);
      expect(u16(stream, 16)).toBe(0);
      expect(c.decode_mp5c6(stream).length).toBe(src.length);
      sizes.push(stream.length);
    }
    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
  });
});

describe("CodecId 6 rate-control validation", () => {
  it("rejects bad modes and targets", () => {
    const c = codec();
    const src = loudQuietLoud(2048, 2);
    expect(() => c.encode_mp5c6_at(src, 2, PRESET_HIGH, SR, 192, 9)).toThrow();
    expect(() => c.encode_mp5c6_at(src, 2, PRESET_HIGH, SR, 0, 1)).toThrow();
    // rate_mode 0 ignores the target and encodes unconstrained.
    const off = c.encode_mp5c6_at(src, 2, PRESET_HIGH, SR, 0, 0);
    expect(u16(off, 16)).toBe(0);
    expect(off.length).toBe(c.encode_mp5c6(src, 2, PRESET_HIGH, SR).length);
  });
});
