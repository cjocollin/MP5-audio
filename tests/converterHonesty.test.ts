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
    const lBits = new Uint8Array([0x4c, 4, 1, 0, 0, 0, 0]);
    const hBase = new Uint8Array([1, 2, 3, 4]);
    const hCorr = new Uint8Array(8000); // inflate H
    getCodec.mockResolvedValue({
      encode_mp5l_v4: () => lBits,
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

  it("default lossless path encodes MP5-L v4", async () => {
    isWasmCodecReady.mockReturnValue(true);
    const encode_mp5l = vi.fn(() => new Uint8Array([0x4c, 3, 1, 0, 0, 0, 0]));
    const encode_mp5l_v4 = vi.fn(() => new Uint8Array([0x4c, 4, 1, 0, 0, 0, 0]));
    getCodec.mockResolvedValue({ encode_mp5l, encode_mp5l_v4 });
    const buf = await convertToMp5({
      samples,
      sampleRate: 44100,
      channels: 1,
      codec: "mp5l_v4",
    });
    const p = parseMp5(buf);
    expect(p.head?.codecId).toBe(CodecId.MP5L);
    expect(encode_mp5l_v4).toHaveBeenCalled();
    expect(encode_mp5l).not.toHaveBeenCalled();
    const info = p.info.find((i) => i.key === "encoder");
    expect(info?.value).toMatch(/v4/i);
  });

  it("hard-fails MP5-L v4 encode without silent v3 fallback", async () => {
    isWasmCodecReady.mockReturnValue(true);
    const encode_mp5l = vi.fn(() => new Uint8Array([0x4c, 3, 1, 0, 0, 0, 0]));
    getCodec.mockResolvedValue({
      encode_mp5l,
      encode_mp5l_v4: () => {
        throw new Error("v4 boom");
      },
    });
    await expect(
      convertToMp5({
        samples,
        sampleRate: 44100,
        channels: 1,
        codec: "mp5l_v4",
      }),
    ).rejects.toThrow(/v4 boom/);
    expect(encode_mp5l).not.toHaveBeenCalled();
  });

  it("rejects MP5-L v4 bitstream with wrong magic without falling back to v3", async () => {
    isWasmCodecReady.mockReturnValue(true);
    const encode_mp5l = vi.fn(() => new Uint8Array([0x4c, 3, 1, 0, 0, 0, 0]));
    getCodec.mockResolvedValue({
      encode_mp5l,
      encode_mp5l_v4: () => new Uint8Array([0x4c, 3, 0, 0]),
    });
    await expect(
      convertToMp5({
        samples,
        sampleRate: 44100,
        channels: 1,
        codec: "mp5l_v4",
      }),
    ).rejects.toThrow(/no v3 fallback/i);
    expect(encode_mp5l).not.toHaveBeenCalled();
  });
});
