#!/usr/bin/env node
/**
 * @deprecated Use `pnpm fixtures:generate` (writes all demo fixtures).
 * Generate test-fixtures/validation_mp5l_v3.mp5 for e2e playback.
 * Requires: pnpm wasm:build
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmDir = join(root, "apps/web/src/wasm/pkg");

const mod = await import(pathToFileURL(join(wasmDir, "mp5_codec.js")).href);
await mod.default(readFileSync(join(wasmDir, "mp5_codec_bg.wasm")));

const sampleRate = 44100;
const channels = 1;
const n = sampleRate; // 1 second
const samples = new Int16Array(n);
for (let i = 0; i < n; i++) {
  samples[i] = Math.round(Math.sin((i * 440 * 2 * Math.PI) / sampleRate) * 8000);
}

const bitstream = mod.encode_mp5l(samples, channels);
if (bitstream[1] !== 3) {
  throw new Error(`Expected MP5-L v3, got version ${bitstream[1]}`);
}

// Minimal container write (HEAD + AUDI) — use dynamic import of container package
const { CodecId, writeMp5 } = await import(
  pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href
);

const out = writeMp5({
  head: {
    codecId: CodecId.MP5L,
    channels,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate,
    totalSamples: BigInt(n),
    encoderVersion: 1,
  },
  meta: [{ key: "title", value: "MP5-L v3 validation" }],
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: bitstream }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  info: [{ key: "encoder", value: "MP5-L WASM v3 (lossless · bit-exact)" }],
});

const path = join(root, "test-fixtures/validation_mp5l_v3.mp5");
writeFileSync(path, out);
console.log(`Wrote ${path} (${out.length} bytes, MP5-L v3)`);
