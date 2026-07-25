/**
 * Full playback load loop: ingest → peek → load AUDI → decode.
 * Catches hangs/regressions that leave the UI stuck on Preparing decode…
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  getLazyIngestThresholdBytes,
  indexMp5FromBlob,
  loadAudiFrames,
  parseMp5Async,
  peekAudiFramePrefix,
  type Mp5File,
} from "@mp5/container";
import type { CodecModule } from "../apps/web/src/wasm/codec";
import {
  getMixDecodeWorkerClient,
  resetMixDecodeWorkerClientForTests,
  decodeMp5ToPcmOffthread,
} from "../apps/web/src/player/mixDecodeWorkerClient";
import { decodeMp5ToPcm } from "../apps/web/src/player/decodeMp5";

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
      if (!wasmHolder.mod) throw new Error("WASM not loaded");
      return wasmHolder.mod as CodecModule;
    },
    isWasmCodecReady: () => wasmHolder.loaded && !!wasmHolder.mod,
  };
});

const FIXTURES = [
  "test-fixtures/demo_mp5l_v4_tone.mp5",
  "test-fixtures/demo_mp5l_v4_stems.mp5",
  "test-fixtures/demo_mp5l_v3_tone.mp5",
  "test-fixtures/validation_mp5l_v4.mp5",
  "test-fixtures/demo_pity_party_class.mp5",
];

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`TIMEOUT: ${label} exceeded ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function ingestFixture(path: string): Promise<{ parsed: Mp5File; bytes: Uint8Array }> {
  const bytes = new Uint8Array(readFileSync(path));
  const threshold = getLazyIngestThresholdBytes();
  if (bytes.byteLength >= threshold) {
    const blob = new Blob([bytes]);
    const parsed = await indexMp5FromBlob(blob, { yieldEveryChunks: 2 });
    return { parsed, bytes };
  }
  const parsed = await parseMp5Async(bytes, { yieldEveryChunks: 2 });
  return { parsed, bytes };
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

afterEach(() => {
  resetMixDecodeWorkerClientForTests();
});

describe("playback load loop", () => {
  it("ingests, peeks, loads AUDI, and decodes every available fixture", async () => {
    if (!wasmHolder.loaded) {
      console.warn("Skipping decode asserts — WASM missing (pnpm wasm:build)");
    }

    const present = FIXTURES.filter((p) => existsSync(p));
    expect(present.length).toBeGreaterThan(0);

    for (const path of present) {
      const t0 = performance.now();
      const { parsed } = await withTimeout(ingestFixture(path), 20_000, `ingest ${path}`);
      expect(parsed.head).toBeDefined();

      const prefix = await withTimeout(peekAudiFramePrefix(parsed, 8), 5_000, `peek ${path}`);
      expect(prefix === null || prefix.length > 0).toBe(true);

      const frames = await withTimeout(loadAudiFrames(parsed), 30_000, `loadAudi ${path}`);
      expect(frames.length).toBeGreaterThan(0);
      expect(frames[0]!.data.length).toBeGreaterThan(0);

      if (wasmHolder.loaded) {
        const decoded = await withTimeout(
          decodeMp5ToPcm(undefined, parsed),
          60_000,
          `decode ${path}`,
        );
        expect(decoded.samples.length).toBeGreaterThan(0);
        expect(decoded.sampleRate).toBe(parsed.head!.sampleRate);
        expect(decoded.channels).toBe(parsed.head!.channels);
      }

      console.log(
        `OK ${path} in ${Math.round(performance.now() - t0)}ms (lazy=${!!parsed.lazy})`,
      );
    }
  }, 180_000);

  it("superseded decode settles with AbortError instead of hanging forever", async () => {
    if (!wasmHolder.loaded) {
      console.warn("Skipping cancel-race test — WASM missing");
      return;
    }

    const path = FIXTURES.find((p) => existsSync(p));
    expect(path).toBeTruthy();
    const { parsed } = await ingestFixture(path!);
    await loadAudiFrames(parsed);

    const client = getMixDecodeWorkerClient();
    (client as unknown as { fallbackMode: boolean }).fallbackMode = true;

    const first = decodeMp5ToPcmOffthread(undefined, parsed);
    const second = decodeMp5ToPcmOffthread(undefined, parsed);

    const results = await withTimeout(
      Promise.allSettled([first, second]),
      60_000,
      "cancel race",
    );

    const rejected = results.filter((r) => r.status === "rejected");
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.status === "fulfilled" || r.status === "rejected")).toBe(true);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(DOMException);
      expect(((r as PromiseRejectedResult).reason as DOMException).name).toBe("AbortError");
    }
  }, 90_000);
});