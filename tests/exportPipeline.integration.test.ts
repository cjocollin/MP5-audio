/**
 * Integration: synthetic PCM -> runExportPipeline(mp5l_v4) -> parse -> decode bit-exact.
 * Skips when WASM is unavailable (run pnpm wasm:build first).
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMp5 } from "@mp5/container";
import { manualEditsFromSource } from "../apps/web/src/converter/manualMetadata";
import type { CodecModule } from "../apps/web/src/wasm/codec";

type WasmCodec = CodecModule & {
  default: (bytes: BufferSource) => Promise<void>;
};

const wasmHolder: { mod: WasmCodec | null; loaded: boolean } = {
  mod: null,
  loaded: false,
};

vi.mock("../apps/web/src/wasm/codec", async () => {
  const actual = await vi.importActual<typeof import("../apps/web/src/wasm/codec")>(
    "../apps/web/src/wasm/codec",
  );
  return {
    ...actual,
    getCodec: async () => {
      if (!wasmHolder.mod) throw new Error("WASM not loaded in integration test");
      return wasmHolder.mod as CodecModule;
    },
    isWasmCodecReady: () => wasmHolder.loaded && !!wasmHolder.mod,
  };
});

function syntheticPcm(): Int16Array {
  const frames = 2048;
  const out = new Int16Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    out[i * 2] = Math.trunc(Math.sin(i * 0.031) * 18_000);
    out[i * 2 + 1] = Math.trunc(Math.cos(i * 0.029) * 16_000);
  }
  return out;
}

beforeAll(async () => {
  try {
    const mod = (await import("../apps/web/src/wasm/pkg/mp5_codec.js")) as WasmCodec;
    const wasmPath = join(process.cwd(), "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
    await mod.default(readFileSync(wasmPath));
    wasmHolder.mod = mod;
    wasmHolder.loaded = true;
  } catch {
    wasmHolder.loaded = false;
  }
});

describe("exportPipeline mp5l_v4 integration", () => {
  it("encode -> parse -> decode is bit-exact vs source PCM", async () => {
    if (!wasmHolder.loaded || !wasmHolder.mod) {
      console.warn("Skipping exportPipeline integration - WASM not loaded (pnpm wasm:build)");
      return;
    }

    const { runExportPipeline } = await import("../apps/web/src/converter/exportPipeline");
    const samples = syntheticPcm();
    const extracted = { meta: { title: "Integration Tone" } };
    const result = await runExportPipeline(
      {
        pcm: { samples, sampleRate: 44_100, channels: 2 },
        extracted,
        edits: manualEditsFromSource(extracted),
        codec: "mp5l_v4",
        preset: 0,
      },
      () => {},
    );

    expect(result.mp5.length).toBeGreaterThan(32);
    const parsed = parseMp5(result.mp5);
    expect(parsed.head?.codecId).toBeDefined();
    const frame = parsed.audioFrames[0]?.data;
    expect(frame).toBeDefined();
    expect(frame![0]).toBe(0x4c);
    expect(frame![1]).toBe(4);

    const decoded = wasmHolder.mod.decode_mp5l(frame!);
    expect(decoded.length).toBe(samples.length);
    for (let i = 0; i < samples.length; i++) {
      if (decoded[i] !== samples[i]) {
        expect.fail(`PCM mismatch at sample ${i}: got ${decoded[i]}, want ${samples[i]}`);
      }
    }
  });
});
