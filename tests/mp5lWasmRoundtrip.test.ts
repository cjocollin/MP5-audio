/**
 * MP5-L v3/v4 WASM encode/decode bit-exact proof (requires pnpm wasm:build).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CodecId, parseMp5, writeMp5 } from "@mp5/container";

type Mp5lStreamDecoder = {
  free(): void;
  push(data: Uint8Array): Int16Array;
  seek_frame(sample_index: number): void;
};

type WasmCodec = {
  default: (bytes: BufferSource) => Promise<void>;
  encode_mp5l: (samples: Int16Array, channels: number) => Uint8Array;
  encode_mp5l_v4: (samples: Int16Array, channels: number) => Uint8Array;
  decode_mp5l: (data: Uint8Array) => Int16Array;
  encode_mp5c_vnext_at: (
    samples: Int16Array,
    channels: number,
    preset: number,
    sampleRate: number,
  ) => Uint8Array;
  decode_mp5c_vnext: (data: Uint8Array) => Int16Array;
  Mp5lStreamDecoder: new (data_prefix: Uint8Array) => Mp5lStreamDecoder;
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

describe("MP5-L v4 WASM parity + seek", () => {
  it("encodes v4 bitstream and decodes bit-exact", () => {
    expect(wasmLoaded).toBe(true);
    if (!wasm) throw new Error("WASM not loaded — run pnpm wasm:build");

    const ch = 2;
    const samples = makeSine(8192, ch);
    const bitstream = wasm.encode_mp5l_v4(samples, ch);
    expect(bitstream[0]).toBe(0x4c);
    expect(bitstream[1]).toBe(4);
    expect(String.fromCharCode(...bitstream.slice(7, 11))).toBe("SEEK");

    const decoded = wasm.decode_mp5l(bitstream);
    expect(decoded.length).toBe(samples.length);
    for (let i = 0; i < samples.length; i++) {
      expect(decoded[i]).toBe(samples[i]);
    }
  });

  it("stream seek_frame lands on/after target (sparse SEEK)", () => {
    if (!wasm) throw new Error("WASM not loaded");
    const ch = 2;
    const frames = 10000;
    const samples = makeSine(frames, ch);
    const bitstream = wasm.encode_mp5l_v4(samples, ch);
    const target = 4500;
    const stream = new wasm.Mp5lStreamDecoder(bitstream);
    try {
      stream.seek_frame(target);
      const got = stream.push(new Uint8Array(0));
      expect(got.length).toBe((frames - target) * ch);
      for (let i = 0; i < got.length; i++) {
        expect(got[i]).toBe(samples[target * ch + i]);
      }
    } finally {
      stream.free();
    }
  });

  it("stream push_until bounds first window without draining EOF", () => {
    if (!wasm) throw new Error("WASM not loaded");
    const ch = 2;
    const frames = 20_000;
    const samples = makeSine(frames, ch);
    const bitstream = wasm.encode_mp5l_v4(samples, ch);
    const want = 8192;
    const stream = new wasm.Mp5lStreamDecoder(bitstream);
    try {
      const got = stream.push_until(new Uint8Array(0), want);
      expect(got.length).toBe(want * ch);
      for (let i = 0; i < got.length; i++) {
        expect(got[i]).toBe(samples[i]);
      }
    } finally {
      stream.free();
    }
  });

  it("chunked push_until concatenates sample-exact (no dropped seam tail)", () => {
    if (!wasm) throw new Error("WASM not loaded");
    const ch = 2;
    const frames = 20_000;
    const samples = makeSine(frames, ch);
    const bitstream = wasm.encode_mp5l_v4(samples, ch);
    // A window boundary (5000) that deliberately falls mid-block (block = 8192)
    // so the straddling frame's tail must be carried to the next call.
    const stream = new wasm.Mp5lStreamDecoder(bitstream);
    try {
      const first = stream.push_until(new Uint8Array(0), 5000);
      const rest = stream.push(new Uint8Array(0));
      const joined = new Int16Array(first.length + rest.length);
      joined.set(first, 0);
      joined.set(rest, first.length);
      expect(joined.length).toBe(samples.length);
      for (let i = 0; i < samples.length; i++) {
        expect(joined[i]).toBe(samples[i]);
      }
    } finally {
      stream.free();
    }
  });
});

/** MP5-C2 sub-block size (rust/mp5-codec/src/mp5c2.rs SUB_BLOCK). */
const C2_SUB_BLOCK = 1024;

/** MP5-C2 unit tags. Only L / B / F restore original PCM exactly. */
const C2_TAG_LOSSLESS = 0x4c; // 'L'
const C2_TAG_BAND = 0x42; // 'B'
const C2_TAG_SR = 0x46; // 'F'

/** Loud body into an exponentially decaying quiet tail — drives both C2 paths. */
function makeLoudThenQuiet(frames: number, ch: number): Int16Array {
  const out = new Int16Array(frames * ch);
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    const amp = t < 0.6 ? 0.6 : 0.6 * Math.exp(-(t - 0.6) * 14);
    const v = Math.round(Math.sin(i * 0.06) * amp * 32767);
    for (let c = 0; c < ch; c++) out[i * ch + c] = v;
  }
  return out;
}

/** Walk C2 unit framing: [tag u8][channelFrames u32le][payloadLen u32le][payload]. */
function c2UnitTags(stream: Uint8Array): number[] {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const tags: number[] = [];
  let pos = 10; // HEADER_LEN
  while (pos + 9 <= stream.length) {
    tags.push(stream[pos]);
    pos += 9 + view.getUint32(pos + 5, true);
  }
  return tags;
}

/**
 * CodecId 5 is bit-exact. The shipping encoder writes MP5-L for quiet/fragile/tail
 * units and min(TAG_SR+CORR, TAG_LOSSLESS) for loud units — both restore the source
 * sample-for-sample. Verified by sample equality (not ABX/SNR): C2 is not lossy.
 */
describe("MP5-C2 (CodecId 5) convert -> decode is sample-exact", () => {
  it("round-trips through the MP5 container with no sample or duration drift", () => {
    expect(wasmLoaded).toBe(true);
    if (!wasm) throw new Error("WASM not loaded — run pnpm wasm:build");

    const ch = 2;
    const samples = makeLoudThenQuiet(C2_SUB_BLOCK * 8, ch);
    const bitstream = wasm.encode_mp5c_vnext_at(samples, ch, 2, 44100);
    expect(bitstream[0]).toBe(0x43);
    expect(bitstream[1]).toBe(0x34);

    const container = writeMp5({
      head: {
        codecId: CodecId.MP5C2,
        channels: ch,
        bitsPerSample: 16,
        presetId: 2,
        sampleRate: 44100,
        totalSamples: BigInt(samples.length / ch),
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: bitstream }],
      info: [{ key: "encoder", value: "MP5-C2 WASM (lossless · bit-exact)" }],
    });

    const parsed = parseMp5(container);
    expect(parsed.head?.codecId).toBe(CodecId.MP5C2);
    const audi = parsed.audioFrames[0]?.data;
    expect(audi).toBeDefined();

    const decoded = wasm.decode_mp5c_vnext(audi!);
    expect(decoded.length).toBe(samples.length);
    for (let i = 0; i < samples.length; i++) {
      expect(decoded[i]).toBe(samples[i]);
    }
  });

  it("emits only bit-exact unit tags (no legacy lossy, no MDCT)", () => {
    if (!wasm) throw new Error("WASM not loaded");
    const ch = 2;
    const samples = makeLoudThenQuiet(C2_SUB_BLOCK * 8, ch);
    const tags = c2UnitTags(wasm.encode_mp5c_vnext_at(samples, ch, 2, 44100));
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect([C2_TAG_LOSSLESS, C2_TAG_BAND, C2_TAG_SR]).toContain(tag);
    }
  });

  it("is sample-exact on dense broadband content too", () => {
    if (!wasm) throw new Error("WASM not loaded");
    const ch = 2;
    const frames = C2_SUB_BLOCK * 6;
    const samples = new Int16Array(frames * ch);
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < ch; c++) {
        const v =
          Math.sin(i * 0.11) * 0.35 +
          Math.sin(i * 0.37) * 0.25 +
          Math.sin(i * 1.7) * 0.15 +
          (((i * 17 + c * 31) % 100) / 100) * 0.1;
        samples[i * ch + c] = Math.round(v * 32767);
      }
    }
    const decoded = wasm.decode_mp5c_vnext(
      wasm.encode_mp5c_vnext_at(samples, ch, 2, 44100),
    );
    expect(decoded.length).toBe(samples.length);
    for (let i = 0; i < samples.length; i++) {
      expect(decoded[i]).toBe(samples[i]);
    }
  });
});
