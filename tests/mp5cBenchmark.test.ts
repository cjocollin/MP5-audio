/**
 * WASM MP5-C v3 benchmark subset (parity with Rust fixtures).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

const SR = 44100;
const CH = 2;

function sine2s(): Int16Array {
  const n = SR * 2;
  const out = new Int16Array(n * CH);
  for (let i = 0; i < n; i++) {
    out[i * 2] = Math.round(Math.sin((2 * Math.PI * 440 * i) / SR) * 14000);
    out[i * 2 + 1] = Math.round(Math.cos((2 * Math.PI * 330 * i) / SR) * 14000);
  }
  return out;
}

function silence2s(): Int16Array {
  return new Int16Array(SR * 2 * CH);
}

function snrDb(o: Int16Array, d: Int16Array): number {
  const n = Math.min(o.length, d.length);
  let s = 0;
  let e = 0;
  for (let i = 0; i < n; i++) {
    const a = o[i]! / 32768;
    const b = d[i]! / 32768;
    s += a * a;
    e += (a - b) ** 2;
  }
  if (e === 0) return 120;
  return 10 * Math.log10(s / e);
}

type Wasm = {
  default: (input: Buffer) => Promise<unknown>;
  encode_mp5c: (s: Int16Array, ch: number, preset: number) => Uint8Array;
  decode_mp5c: (d: Uint8Array) => Int16Array;
};

let wasm: Wasm;

beforeAll(async () => {
  const root = process.cwd();
  const mod = (await import(
    pathToFileURL(join(root, "apps/web/src/wasm/pkg/mp5_codec.js")).href
  )) as Wasm;
  await mod.default(readFileSync(join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm")));
  wasm = mod;
});

describe("MP5-C v3 WASM benchmark", () => {
  it("encodes v3 bitstream with silence compression", () => {
    const pcm = silence2s();
    const enc = wasm.encode_mp5c(pcm, CH, 1);
    expect(enc[0]).toBe(0x43);
    expect(enc[1]).toBe(6); // MP5-C v5.1 current encoder
    expect(enc.length).toBeLessThan(pcm.byteLength / 10);
  });

  it("Standard beats PCM on 30s music-like stereo", () => {
    const sec = 30;
    const n = SR * sec;
    const pcm = new Int16Array(n * CH);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const v = Math.round(
        (Math.sin(2 * Math.PI * 110 * t) * 12000 +
          Math.sin(2 * Math.PI * 440 * t) * 6000) /
          2,
      );
      pcm[i * 2] = v;
      pcm[i * 2 + 1] = Math.round(v * 0.97);
    }
    const enc = wasm.encode_mp5c(pcm, CH, 1);
    const dec = wasm.decode_mp5c(enc);
    const snr = snrDb(pcm, dec.subarray(0, pcm.length));
    expect(enc.length / pcm.byteLength).toBeLessThan(0.95);
    // Simple two-tone fixture; full SNR matrix is in Rust: pnpm bench:mp5c
    expect(snr).toBeGreaterThan(18);
  });

  it("Extreme may exceed PCM on 0.5s sine (header overhead)", () => {
    const n = Math.floor(SR / 2);
    const pcm = new Int16Array(n * CH);
    for (let i = 0; i < n; i++) {
      pcm[i * 2] = Math.round(Math.sin((2 * Math.PI * 440 * i) / SR) * 14000);
      pcm[i * 2 + 1] = pcm[i * 2]!;
    }
    const enc = wasm.encode_mp5c(pcm, CH, 3);
    expect(enc[1]).toBe(6);
    // Documented behavior: short + Extreme can be > PCM
    const ratio = enc.length / pcm.byteLength;
    expect(ratio).toBeGreaterThan(0.4);
  });
});
