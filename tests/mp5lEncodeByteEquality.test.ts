/**
 * MP5-L v4 encode byte-equality gates for the WASM product path.
 * Requires pnpm wasm:build.
 *
 * Golden layout (MP5LGOLD | u32 pcm_len | pcm i16 LE | bitstream) is produced by
 * the WASM encoder for the same PCM as rust write_v4_encode_golden_fixture.
 * Native host vs wasm32 can diverge on f64 QLP ranking; the shipped encoder is WASM.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { encodeMp5lV4FrameParallel, encodeMp5lV4Progressive } from "../apps/web/src/converter/encodeMp5lV4Progressive";
import type { CodecModule } from "../apps/web/src/wasm/codec";

type WasmCodec = CodecModule & {
  default: (bytes: BufferSource) => Promise<void>;
  encode_mp5l_v4: (samples: Int16Array, channels: number) => Uint8Array;
  Mp5lV4StreamEncoder?: new (samples: Int16Array, channels: number) => {
    frameCount(): number;
    framesDone(): number;
    encodeNextFrame(): boolean;
    finish(): Uint8Array;
    free(): void;
  };
  plan_mp5l_v4_boundaries?: (samples: Int16Array, channels: number) => Uint32Array;
  encode_mp5l_v4_frame?: (
    samples: Int16Array,
    channels: number,
    start: number,
    end: number,
  ) => Uint8Array;
  assemble_mp5l_v4?: (
    channels: number,
    sample_offsets: Uint32Array,
    frames_concat: Uint8Array,
    frame_lengths: Uint32Array,
  ) => Uint8Array;
};

let wasm: WasmCodec | null = null;
let wasmLoaded = false;

const GOLDEN_PATH = join(process.cwd(), "tests/fixtures/mp5l_v4_encode_golden.bin");

/** Same PCM recipe as rust `write_v4_encode_golden_fixture`. */
function goldenPcm(): Int16Array {
  const out = new Int16Array(1536 * 2);
  for (let i = 0; i < 1536; i++) {
    const left = Math.trunc(Math.sin(i * 0.023) * 22_000);
    const right = Math.max(-32768, Math.min(32767, left - (((i % 11) as number) - 5)));
    out[i * 2] = left;
    out[i * 2 + 1] = right;
  }
  return out;
}

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

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function loadGolden(): { pcm: Int16Array; bitstream: Uint8Array } | null {
  if (!existsSync(GOLDEN_PATH)) return null;
  const buf = readFileSync(GOLDEN_PATH);
  if (buf.length < 12 || buf.subarray(0, 8).toString("ascii") !== "MP5LGOLD") return null;
  const pcmLen = buf.readUInt32LE(8);
  const pcmBytes = pcmLen * 2;
  const pcmStart = 12;
  const bitStart = pcmStart + pcmBytes;
  if (bitStart > buf.length) return null;
  const pcm = new Int16Array(buf.buffer, buf.byteOffset + pcmStart, pcmLen);
  const bitstream = new Uint8Array(buf.buffer, buf.byteOffset + bitStart, buf.length - bitStart);
  return { pcm: new Int16Array(pcm), bitstream: new Uint8Array(bitstream) };
}

function writeGolden(pcm: Int16Array, bitstream: Uint8Array): void {
  const magic = Buffer.from("MP5LGOLD");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(pcm.length, 0);
  writeFileSync(
    GOLDEN_PATH,
    Buffer.concat([magic, len, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength), Buffer.from(bitstream)]),
  );
}

describe("MP5-L v4 encode byte equality", () => {
  it("WASM encode is deterministic", () => {
    expect(wasmLoaded).toBe(true);
    if (!wasm) throw new Error("WASM not loaded — run pnpm wasm:build");
    const samples = new Int16Array(4096);
    for (let i = 0; i < samples.length; i++) samples[i] = ((i * 13) % 2000) - 1000;
    const a = wasm.encode_mp5l_v4(samples, 2);
    const b = wasm.encode_mp5l_v4(samples, 2);
    expect(sha256(a)).toBe(sha256(b));
    expect(a[0]).toBe(0x4c);
    expect(a[1]).toBe(4);
  });

  it("matches frozen WASM encode golden", () => {
    if (!wasm) throw new Error("WASM not loaded");
    const pcm = goldenPcm();
    const encoded = wasm.encode_mp5l_v4(pcm, 2);
    if (process.env.WRITE_MP5L_V4_GOLDEN === "1") {
      writeGolden(pcm, encoded);
    }
    expect(
      existsSync(GOLDEN_PATH),
      `Missing golden fixture at ${GOLDEN_PATH}. Generate with WRITE_MP5L_V4_GOLDEN=1 pnpm exec vitest run tests/mp5lEncodeByteEquality.test.ts`,
    ).toBe(true);
    const golden = loadGolden();
    expect(golden).not.toBeNull();
    expect(sha256(golden!.pcm)).toBe(sha256(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)));
    expect(sha256(encoded)).toBe(sha256(golden!.bitstream));
  });

  it("progressive stream encoder matches one-shot WASM bytes", () => {
    if (!wasm) throw new Error("WASM not loaded");
    const samples = new Int16Array(4096);
    for (let i = 0; i < samples.length; i++) samples[i] = ((i * 17) % 1800) - 900;
    const oneshot = wasm.encode_mp5l_v4(samples, 2);
    const progressive = encodeMp5lV4Progressive(wasm, samples, 2);
    expect(sha256(progressive)).toBe(sha256(oneshot));
  });

  it("frame-parallel assemble matches one-shot WASM bytes", async () => {
    if (!wasm) throw new Error("WASM not loaded");
    if (
      typeof wasm.plan_mp5l_v4_boundaries !== "function" ||
      typeof wasm.encode_mp5l_v4_frame !== "function" ||
      typeof wasm.assemble_mp5l_v4 !== "function"
    ) {
      console.warn("frame-parallel WASM APIs unavailable — rebuild WASM");
      return;
    }
    const samples = new Int16Array(6144);
    for (let i = 0; i < samples.length; i++) samples[i] = ((i * 19) % 2400) - 1200;
    const oneshot = wasm.encode_mp5l_v4(samples, 2);
    const parallel = await encodeMp5lV4FrameParallel(wasm, samples, 2, { concurrency: 2 });
    expect(sha256(parallel)).toBe(sha256(oneshot));
  });
});
