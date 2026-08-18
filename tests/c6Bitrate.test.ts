/**
 * Bitrate readout helper (apps/web/src/lib/c6Bitrate.ts) against real C6 streams.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { audiKbps, bitrateBadgeLabel, bitrateDetailLabel, c6BitrateInfo } from "../apps/web/src/lib/c6Bitrate";

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
};

const SR = 44100;

let wasm: WasmCodec | null = null;
let wasmLoaded = false;

beforeAll(async () => {
  try {
    const mod = (await import("../apps/web/src/wasm/pkg/mp5_codec.js")) as WasmCodec;
    await mod.default(readFileSync(join(process.cwd(), "apps/web/src/wasm/pkg/mp5_codec_bg.wasm")));
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

function mixedSignal(frames: number, ch: number): Int16Array {
  const out = new Int16Array(frames * ch);
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    const amp = t < 0.4 ? 0.5 : 0.5 * Math.exp(-(t - 0.4) * 12);
    const v = Math.round(Math.sin(i * 0.06) * amp * 32767);
    for (let c = 0; c < ch; c++) out[i * ch + c] = v;
  }
  return out;
}

describe("c6BitrateInfo", () => {
  it("reads total kbps, target, coded-path and protect share from a C6 stream", () => {
    const c = codec();
    const frames = SR * 2;
    const src = mixedSignal(frames, 2);
    const stream = c.encode_mp5c6_at(src, 2, 2, SR, 192, 1);
    const info = c6BitrateInfo(stream);
    expect(info).not.toBeNull();
    expect(info!.targetKbps).toBe(192);
    const expectedTotal = (stream.length * 8) / 1000 / (frames / SR);
    expect(info!.totalKbps).toBeCloseTo(expectedTotal, 1);
    expect(info!.codedPathKbps).toBeGreaterThan(0);
    expect(info!.codedPathKbps!).toBeLessThan(info!.totalKbps! + 0.001);
    expect(info!.protectedBytePct).toBeGreaterThan(0);
    expect(info!.protectedBytePct!).toBeLessThan(100);
  });

  it("labels badges and details honestly", () => {
    const c = codec();
    const frames = SR * 2;
    const src = mixedSignal(frames, 2);
    const rated = c.encode_mp5c6_at(src, 2, 2, SR, 192, 1);
    const unrated = c.encode_mp5c6(src, 2, 2, SR);
    const ratedLabel = bitrateBadgeLabel(c6BitrateInfo(rated));
    expect(ratedLabel).toMatch(/^ABR 192 · \d+ kbps$/);
    const unratedLabel = bitrateBadgeLabel(c6BitrateInfo(unrated));
    expect(unratedLabel).toMatch(/^\d+ kbps$/);
    expect(unratedLabel).not.toMatch(/ABR/);
    const detail = bitrateDetailLabel(c6BitrateInfo(rated));
    expect(detail).toMatch(/lossy path \d+ kbps/);
    expect(detail).toMatch(/protect \d+\.\d% of payload/);
  });

  it("rejects non-C6 and truncated inputs", () => {
    expect(c6BitrateInfo(new Uint8Array([0x43, 0x34, 1, 2, 3]))).toBeNull();
    expect(c6BitrateInfo(new Uint8Array(28).fill(0))).toBeNull();
    expect(audiKbps(1000, 0)).toBeNull();
    expect(audiKbps(1000, 2)).toBeCloseTo(4, 3);
  });
});
