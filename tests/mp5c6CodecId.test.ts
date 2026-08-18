/**
 * CodecId 6 ("MP5-C") end-to-end proofs through the WASM surface.
 *
 * Normative reference: docs/MP5C_NEXT_SPEC.md. Requires `pnpm wasm:build`.
 *
 * The load-bearing test here is `protect islands are sample-exact`: CodecId 6 is a
 * lossy stream, so the only honest bit-exactness claim is per protect unit, and it
 * has to be proven against the source region rather than asserted in prose.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CodecId,
  assessMp5Compatibility,
  mp5CodecVersionLabel,
  parseMp5,
  writeMp5,
  type CodecIdValue,
} from "@mp5/container";
import { codecLabel, describeMp5c6Playback } from "../apps/web/src/lib/codecDisplay";

type WasmCodec = {
  default: (bytes: BufferSource) => Promise<void>;
  encode_mp5l: (samples: Int16Array, channels: number) => Uint8Array;
  decode_mp5l: (data: Uint8Array) => Int16Array;
  encode_mp5c: (samples: Int16Array, channels: number, preset: number) => Uint8Array;
  decode_mp5c: (data: Uint8Array) => Int16Array;
  encode_mp5c3: (samples: Int16Array, channels: number, preset: number) => Uint8Array;
  encode_mp5c_vnext_at: (
    samples: Int16Array,
    channels: number,
    preset: number,
    sampleRate: number,
  ) => Uint8Array;
  encode_mp5c_vnext_mdct: (
    samples: Int16Array,
    channels: number,
    preset: number,
  ) => Uint8Array;
  decode_mp5c_vnext: (data: Uint8Array) => Int16Array;
  encode_mp5h: (samples: Int16Array, channels: number, preset: number) => Uint8Array;
  decode_mp5h: (data: Uint8Array, enhanced: boolean) => Int16Array;
  encode_mp5c6: (
    samples: Int16Array,
    channels: number,
    preset: number,
    sampleRate: number,
  ) => Uint8Array;
  decode_mp5c6: (data: Uint8Array) => Int16Array;
  inspect_unit_mix: (data: Uint8Array) => string;
  snr_db_wasm: (original: Int16Array, decoded: Int16Array) => number;
};

const SR = 44100;
const PRESET_HIGH = 2;
const HEADER_LEN = 28;
const UNIT_PREFIX_LEN = 9;
const UNIT_CRC_LEN = 4;
const TAG_LOSSLESS = 0x4c;
const TAG_BAND = 0x42;
const TAG_MDCT = 0x4d;
const TAG_SR = 0x46;

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

/**
 * Loud head into a decaying tail: guarantees the encoder plans both MDCT units
 * and protect islands, which is what the bit-exactness test needs.
 */
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

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32/IEEE, matching `crc32_bytes` in rust/mp5-codec/src/mp5l/mod.rs. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(data: Uint8Array, at: number): number {
  return (
    (data[at] | (data[at + 1] << 8) | (data[at + 2] << 16) | (data[at + 3] << 24)) >>> 0
  );
}

type Unit = { tag: number; nFrames: number; payload: Uint8Array; startFrame: number };

/**
 * Independent JS re-implementation of the spec's unit walk. Deliberately does not
 * call into Rust so that a Rust-side framing bug cannot hide behind a shared parser.
 */
function walkUnits(stream: Uint8Array): Unit[] {
  expect(stream.length).toBeGreaterThanOrEqual(HEADER_LEN);
  expect(stream[0]).toBe(0x43);
  expect(stream[1]).toBe(0x36);
  expect(u32(stream, 24)).toBe(crc32(stream.subarray(0, HEADER_LEN - 4)));

  const units: Unit[] = [];
  let pos = HEADER_LEN;
  let startFrame = 0;
  while (pos < stream.length) {
    expect(pos + UNIT_PREFIX_LEN + UNIT_CRC_LEN).toBeLessThanOrEqual(stream.length);
    const tag = stream[pos];
    const nFrames = u32(stream, pos + 1);
    const payloadLen = u32(stream, pos + 5);
    const payloadStart = pos + UNIT_PREFIX_LEN;
    const payloadEnd = payloadStart + payloadLen;
    expect(payloadEnd + UNIT_CRC_LEN).toBeLessThanOrEqual(stream.length);
    expect(u32(stream, payloadEnd)).toBe(crc32(stream.subarray(pos, payloadEnd)));
    units.push({ tag, nFrames, payload: stream.subarray(payloadStart, payloadEnd), startFrame });
    startFrame += nFrames;
    pos = payloadEnd + UNIT_CRC_LEN;
  }
  return units;
}

describe("CodecId 6 bitstream identity", () => {
  it("writes the spec header: magic 0x43 0x36, 28 bytes, verifying CRC", () => {
    const c = codec();
    const frames = 1024 * 8;
    const src = mixedSignal(frames, 2);
    const stream = c.encode_mp5c6(src, 2, PRESET_HIGH, SR);

    expect(stream[0]).toBe(0x43);
    expect(stream[1]).toBe(0x36);
    expect(stream[2]).toBe(2); // channels
    expect(stream[3]).toBe(3); // profile_id 3 = Phase 5 syntax family
    expect(u32(stream, 4)).toBe(SR);
    expect(u32(stream, 8)).toBe(frames);
    expect(u32(stream, 12)).toBeGreaterThan(0); // mdct_frame_count
    expect(stream[20] | (stream[21] << 8)).toBe(5); // flags: joint stereo + window switching
    expect(stream[22] | (stream[23] << 8)).toBe(1024); // unit_size = SUB_BLOCK
    expect(u32(stream, 24)).toBe(crc32(stream.subarray(0, 24)));
  });

  it("round-trips to the same sample count and duration (lossy, not bit-exact)", () => {
    const c = codec();
    for (const ch of [1, 2]) {
      const frames = 1024 * 6;
      const src = mixedSignal(frames, ch);
      const stream = c.encode_mp5c6(src, ch, PRESET_HIGH, SR);
      const decoded = c.decode_mp5c6(stream);
      expect(decoded.length).toBe(src.length);
      expect(decoded.length / ch / SR).toBeCloseTo(frames / SR, 9);
    }
    const frames = 1024 * 8;
    const src = mixedSignal(frames, 2);
    const decoded = codec().decode_mp5c6(codec().encode_mp5c6(src, 2, PRESET_HIGH, SR));
    expect(Array.from(decoded)).not.toEqual(Array.from(src));
  });

  it("uses TAG_MDCT for loud runs and never TAG_SR", () => {
    const c = codec();
    const stream = c.encode_mp5c6(mixedSignal(1024 * 8, 2), 2, PRESET_HIGH, SR);
    const tags = walkUnits(stream).map((u) => u.tag);
    expect(tags).toContain(TAG_MDCT);
    expect(tags).not.toContain(TAG_SR);
  });
});

describe("CodecId 6 protect islands", () => {
  it("decodes every TAG_LOSSLESS / TAG_BAND unit sample-exact against the source", () => {
    const c = codec();
    const ch = 2;
    const frames = 1024 * 12;
    const src = mixedSignal(frames, ch);
    const stream = c.encode_mp5c6(src, ch, PRESET_HIGH, SR);
    const units = walkUnits(stream);
    const full = c.decode_mp5c6(stream);

    let protectUnits = 0;
    let covered = 0;
    for (const unit of units) {
      covered += unit.nFrames;
      if (unit.tag !== TAG_LOSSLESS && unit.tag !== TAG_BAND) continue;
      protectUnits++;
      const from = unit.startFrame * ch;
      const to = (unit.startFrame + unit.nFrames) * ch;

      // (a) the unit payload on its own must be bit-exact MP5-L
      const island = c.decode_mp5l(unit.payload);
      expect(island.length).toBe(to - from);
      for (let i = 0; i < island.length; i++) {
        expect(island[i]).toBe(src[from + i]);
      }

      // (b) and the same span must survive the full CodecId 6 decode untouched
      for (let i = from; i < to; i++) {
        expect(full[i]).toBe(src[i]);
      }
    }

    expect(covered).toBe(frames);
    expect(protectUnits).toBeGreaterThan(0);
  });

  it("keeps all-silent input fully protected and bit-exact", () => {
    const c = codec();
    const src = new Int16Array(1024 * 4 * 2);
    const stream = c.encode_mp5c6(src, 2, PRESET_HIGH, SR);
    expect(Array.from(c.decode_mp5c6(stream))).toEqual(Array.from(src));

    const mix = JSON.parse(c.inspect_unit_mix(stream));
    expect(mix.protected_sample_pct).toBe(100);
    expect(mix.tags.mdct.units).toBe(0);
    expect(mix.declared_mdct_frames).toBe(0);
  });

  it("plans the same protect islands as the CodecId 5 MDCT path", () => {
    const c = codec();
    const src = mixedSignal(1024 * 10, 2);
    const six = JSON.parse(c.inspect_unit_mix(c.encode_mp5c6(src, 2, PRESET_HIGH, SR)));
    const five = JSON.parse(c.inspect_unit_mix(c.encode_mp5c_vnext_mdct(src, 2, PRESET_HIGH)));
    expect(six.codec_id).toBe(6);
    expect(five.codec_id).toBe(5);
    expect(six.tags.lossless_l.frames + six.tags.lossless_b.frames).toBe(
      five.tags.lossless_l.frames + five.tags.lossless_b.frames,
    );
  });
});

describe("CodecId 6 magic separation and forever-decode", () => {
  it("is rejected by the classic MP5-C and MP5-C2 decoders", () => {
    const c = codec();
    const stream = c.encode_mp5c6(mixedSignal(1024 * 4, 2), 2, PRESET_HIGH, SR);
    expect(() => c.decode_mp5c_vnext(stream)).toThrow();
    expect(() => c.decode_mp5c(stream)).toThrow();
  });

  it("rejects classic MP5-C, MP5-C2 and bare mp5c3 streams", () => {
    const c = codec();
    const src = mixedSignal(1024 * 4, 2);
    expect(() => c.decode_mp5c6(c.encode_mp5c(src, 2, PRESET_HIGH))).toThrow();
    expect(() => c.decode_mp5c6(c.encode_mp5c_vnext_at(src, 2, PRESET_HIGH, SR))).toThrow();
    expect(() => c.decode_mp5c6(c.encode_mp5c3(src, 2, PRESET_HIGH))).toThrow();
    expect(() => c.decode_mp5c6(c.encode_mp5l(src, 2))).toThrow();
  });

  it("leaves CodecId 1 / 3 / 5 decoding unchanged", () => {
    const c = codec();
    const src = mixedSignal(1024 * 4, 2);

    const classic = c.decode_mp5c(c.encode_mp5c(src, 2, PRESET_HIGH));
    expect(classic.length).toBe(src.length);

    const c2stream = c.encode_mp5c_vnext_at(src, 2, PRESET_HIGH, SR);
    const c2 = c.decode_mp5c_vnext(c2stream);
    expect(Array.from(c2)).toEqual(Array.from(src)); // CodecId 5 stays bit-exact

    const h = c.decode_mp5h(c.encode_mp5h(src, 2, PRESET_HIGH), true);
    expect(h.length).toBe(src.length);
  });
});

describe("CodecId 6 fails closed", () => {
  it("errors at every truncation offset instead of returning short audio", () => {
    const c = codec();
    const src = mixedSignal(1024 * 6, 2);
    const stream = c.encode_mp5c6(src, 2, PRESET_HIGH, SR);

    for (const off of [
      1,
      2,
      HEADER_LEN - 1,
      HEADER_LEN,
      HEADER_LEN + 1,
      HEADER_LEN + UNIT_PREFIX_LEN,
      Math.floor(stream.length / 3),
      Math.floor(stream.length / 2),
      stream.length - UNIT_CRC_LEN - 1,
      stream.length - 1,
    ]) {
      expect(() => c.decode_mp5c6(stream.subarray(0, off))).toThrow();
    }
    for (let off = HEADER_LEN; off < stream.length; off += 401) {
      expect(() => c.decode_mp5c6(stream.subarray(0, off))).toThrow();
    }
  });

  it("errors on a corrupt header CRC", () => {
    const c = codec();
    const stream = c.encode_mp5c6(mixedSignal(1024 * 4, 2), 2, PRESET_HIGH, SR);
    const bad = Uint8Array.from(stream);
    bad[24] ^= 0xff;
    expect(() => c.decode_mp5c6(bad)).toThrow();
    expect(() => c.inspect_unit_mix(bad)).toThrow();
  });

  it("errors on a corrupt unit CRC and on a flipped payload byte", () => {
    const c = codec();
    const stream = c.encode_mp5c6(mixedSignal(1024 * 6, 2), 2, PRESET_HIGH, SR);

    const badCrc = Uint8Array.from(stream);
    badCrc[badCrc.length - 1] ^= 0xff;
    expect(() => c.decode_mp5c6(badCrc)).toThrow();

    const badPayload = Uint8Array.from(stream);
    badPayload[HEADER_LEN + UNIT_PREFIX_LEN + 3] ^= 0x40;
    expect(() => c.decode_mp5c6(badPayload)).toThrow();
  });

  it("errors on an absurd payload length", () => {
    const c = codec();
    const stream = c.encode_mp5c6(mixedSignal(1024 * 4, 2), 2, PRESET_HIGH, SR);
    const lenAt = HEADER_LEN + 5;

    for (const value of [0xffffffff, stream.length, stream.length * 4]) {
      const bad = Uint8Array.from(stream);
      new DataView(bad.buffer, bad.byteOffset).setUint32(lenAt, value >>> 0, true);
      expect(() => c.decode_mp5c6(bad)).toThrow();
    }
  });

  it("errors when the header frame count disagrees with the units", () => {
    const c = codec();
    const stream = c.encode_mp5c6(mixedSignal(1024 * 4, 2), 2, PRESET_HIGH, SR);
    const bad = Uint8Array.from(stream);
    const view = new DataView(bad.buffer, bad.byteOffset);
    view.setUint32(8, 1024 * 99, true); // total_frames
    view.setUint32(24, crc32(bad.subarray(0, 24)), true); // repair header CRC
    expect(() => c.decode_mp5c6(bad)).toThrow();
  });

  it("errors on unsupported profile_id, channels and reserved flag bits", () => {
    const c = codec();
    const stream = c.encode_mp5c6(mixedSignal(1024 * 4, 2), 2, PRESET_HIGH, SR);
    const mutate = (fn: (bad: Uint8Array, view: DataView) => void) => {
      const bad = Uint8Array.from(stream);
      const view = new DataView(bad.buffer, bad.byteOffset);
      fn(bad, view);
      view.setUint32(24, crc32(bad.subarray(0, 24)), true);
      return bad;
    };
    expect(() => c.decode_mp5c6(mutate((b) => (b[3] = 9)))).toThrow(); // unknown profile_id
    // profile_id 0 is a *known* profile, but it contradicts the coded-scalefactor
    // magic in the TAG_MDCT payload — the cross-check must reject it.
    expect(() => c.decode_mp5c6(mutate((b) => (b[3] = 0)))).toThrow();
    expect(() => c.decode_mp5c6(mutate((b) => (b[2] = 4)))).toThrow(); // channels
    expect(() => c.decode_mp5c6(mutate((_b, v) => v.setUint16(20, 0x0010, true)))).toThrow();
  });

  it("rejects an encode request with unsupported geometry", () => {
    const c = codec();
    const src = mixedSignal(1024, 2);
    expect(() => c.encode_mp5c6(src, 0, PRESET_HIGH, SR)).toThrow();
    expect(() => c.encode_mp5c6(src, 3, PRESET_HIGH, SR)).toThrow();
    expect(() => c.encode_mp5c6(src, 2, PRESET_HIGH, 4000)).toThrow();
  });
});

describe("inspect_unit_mix reporting contract", () => {
  it("publishes coded-path bitrate, protected percentages and stream size", () => {
    const c = codec();
    const ch = 2;
    const frames = 1024 * 12;
    const src = mixedSignal(frames, ch);
    const stream = c.encode_mp5c6(src, ch, PRESET_HIGH, SR);
    const mix = JSON.parse(c.inspect_unit_mix(stream));

    expect(mix.codec_id).toBe(6);
    expect(mix.channels).toBe(ch);
    expect(mix.sample_rate_hz).toBe(SR);
    expect(mix.profile_id).toBe(3);
    expect(mix.unit_size).toBe(1024);
    expect(mix.total_frames).toBe(frames);
    expect(mix.declared_frames).toBe(frames);
    expect(mix.stream_bytes).toBe(stream.length);
    expect(mix.duration_seconds).toBeCloseTo(frames / SR, 9);

    // Tag tallies must agree with an independent walk of the same bytes.
    const units = walkUnits(stream);
    const walked = { units: 0, frames: 0, bytes: 0, protectFrames: 0, protectBytes: 0 };
    for (const u of units) {
      walked.units++;
      walked.frames += u.nFrames;
      walked.bytes += u.payload.length;
      if (u.tag === TAG_LOSSLESS || u.tag === TAG_BAND) {
        walked.protectFrames += u.nFrames;
        walked.protectBytes += u.payload.length;
      }
    }
    expect(mix.total_units).toBe(walked.units);
    expect(mix.total_payload_bytes).toBe(walked.bytes);
    expect(mix.tags.lossless_l.frames + mix.tags.lossless_b.frames).toBe(walked.protectFrames);
    expect(mix.protected_sample_pct).toBeCloseTo((100 * walked.protectFrames) / frames, 6);
    expect(mix.protected_byte_pct).toBeCloseTo((100 * walked.protectBytes) / walked.bytes, 6);

    // (a) coded-path bitrate counts lossy payload only.
    expect(mix.coded_path_bytes).toBe(mix.tags.mdct.payload_bytes);
    expect(mix.coded_path_kbps).toBeCloseTo(
      (mix.coded_path_bytes * 8) / 1000 / (frames / SR),
      6,
    );
    expect(mix.tags.signal_relative.units).toBe(0);
    expect(mix.tags.unknown.units).toBe(0);
  });

  it("reports a CodecId 5 stream through the same call with a null bitrate", () => {
    const c = codec();
    const src = mixedSignal(1024 * 8, 2);
    const mix = JSON.parse(c.inspect_unit_mix(c.encode_mp5c_vnext_at(src, 2, PRESET_HIGH, SR)));
    expect(mix.codec_id).toBe(5);
    expect(mix.sample_rate_hz).toBe(0);
    expect(mix.profile_id).toBeNull();
    expect(mix.declared_mdct_frames).toBeNull();
    expect(mix.coded_path_kbps).toBeNull();
    expect(mix.total_frames).toBe(1024 * 8);
  });
});

describe("CodecId 6 in the container", () => {
  it("round-trips through writeMp5 / parseMp5 and decodes from the frame", () => {
    const c = codec();
    const ch = 2;
    const frames = 1024 * 6;
    const src = mixedSignal(frames, ch);
    const stream = c.encode_mp5c6(src, ch, PRESET_HIGH, SR);

    const file = writeMp5({
      head: {
        codecId: CodecId.MP5C6 as CodecIdValue,
        channels: ch,
        bitsPerSample: 16,
        presetId: PRESET_HIGH,
        sampleRate: SR,
        totalSamples: BigInt(frames),
        encoderVersion: 1,
      },
      meta: [],
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: stream }],
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      waveform: [],
      info: [{ key: "encoder", value: "MP5-C v6 WASM (lossy · experimental)" }],
    });

    const parsed = parseMp5(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    expect(parsed.head?.codecId).toBe(6);
    const frame = parsed.audioFrames[0]?.data;
    expect(frame).toBeDefined();
    expect(c.decode_mp5c6(frame!).length).toBe(src.length);

    const report = assessMp5Compatibility(parsed, { fileSize: file.byteLength });
    const issue = report.issues.find((i) => i.code === "codec_mp5c6_experimental");
    expect(issue?.level).toBe("warning");
    expect(report.errors).toEqual([]);
    expect(report.codecLabel).toMatch(/lossy/i);
    expect(mp5CodecVersionLabel(6, frame)).toMatch(/0x43 0x36/);
  });

  it("labels CodecId 6 honestly as lossy and experimental", () => {
    expect(codecLabel(CodecId.MP5C6)).toMatch(/MP5-C v6/);
    expect(codecLabel(CodecId.MP5C6)).toMatch(/lossy/i);
    expect(codecLabel(CodecId.MP5C6)).not.toMatch(/bit-exact/i);
    expect(codecLabel(CodecId.MP5C6)).not.toMatch(/classic/i);

    const labels = describeMp5c6Playback(new Uint8Array(28).fill(0));
    expect(labels.outputQuality).toMatch(/lossy/i);
    expect(labels.warning).toMatch(/not frozen/i);
  });
});
