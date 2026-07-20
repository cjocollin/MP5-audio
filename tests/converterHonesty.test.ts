import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodecId, parseMp5 } from "@mp5/container";

const getCodec = vi.fn(async () => ({}));
const isWasmCodecReady = vi.fn(() => false);

vi.mock("../apps/web/src/wasm/codec", () => ({
  getCodec: () => getCodec(),
  isWasmCodecReady: () => isWasmCodecReady(),
  CodecPreset: { Low: 0, Standard: 1, High: 2, Extreme: 3 },
}));

import { convertToMp5 } from "../apps/web/src/converter/convertToMp5";

const samples = new Int16Array([0, 1000, -1000, 500]);

/** Minimal MP5-H wrapper: magic + base + large CORR so H container > L. */
function wrapH(base: Uint8Array, corr: Uint8Array): Uint8Array {
  const out = new Uint8Array(6 + base.length + 4 + corr.length);
  out[0] = 0x48;
  out[1] = 0x01;
  new DataView(out.buffer).setUint32(2, base.length, true);
  out.set(base, 6);
  new DataView(out.buffer).setUint32(6 + base.length, corr.length, true);
  out.set(corr, 10 + base.length);
  return out;
}

describe("converter honesty", () => {
  beforeEach(() => {
    isWasmCodecReady.mockReturnValue(false);
    getCodec.mockResolvedValue({});
  });

  it("exports PCM when WASM unavailable and pcm selected", async () => {
    const buf = await convertToMp5({
      samples,
      sampleRate: 44100,
      channels: 1,
      codec: "pcm",
    });
    const p = parseMp5(buf);
    expect(p.head?.codecId).toBe(CodecId.PCM);
    const info = p.info.find((i) => i.key === "encoder");
    expect(info?.value).toContain("PCM");
  });

  it("rejects MP5-C when WASM unavailable", async () => {
    await expect(
      convertToMp5({
        samples,
        sampleRate: 44100,
        channels: 1,
        codec: "mp5c",
      }),
    ).rejects.toThrow(/WASM/);
  });

  it("resolves MP5-H request to MP5-L when L container is smaller", async () => {
    isWasmCodecReady.mockReturnValue(true);
    const lBits = new Uint8Array([0x4c, 3, 1, 0, 0, 0, 0]);
    const hBase = new Uint8Array([1, 2, 3, 4]);
    const hCorr = new Uint8Array(8000); // inflate H
    getCodec.mockResolvedValue({
      encode_mp5l: () => lBits,
      encode_mp5h_min: () => wrapH(hBase, hCorr),
      encode_mp5h: () => wrapH(hBase, hCorr),
    });
    const buf = await convertToMp5({
      samples,
      sampleRate: 44100,
      channels: 1,
      codec: "mp5h",
      preset: 2,
    });
    const p = parseMp5(buf);
    expect(p.head?.codecId).toBe(CodecId.MP5L);
    const info = p.info.find((i) => i.key === "encoder");
    expect(info?.value).toMatch(/resolved to smaller L/i);
  });
});
