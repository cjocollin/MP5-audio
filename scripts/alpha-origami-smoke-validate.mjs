#!/usr/bin/env node
/**
 * Validates ORIGAMI MP5-L export via WASM decode + format labels (matches web player).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mp5Path = join(root, "benchmarks/real-music/ORIGAMI_mp5l_v3_alpha.mp5");
const flacPath = "C:\\Users\\colli\\OneDrive\\Desktop\\- ORIGAMI!.flac";

const { parseMp5, CodecId } = await import(
  pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href
);
const {
  codecLabel,
  describeMp5lPlayback,
  mp5lBitstreamVersion,
} = await import(pathToFileURL(join(root, "apps/web/src/lib/codecDisplay.ts")).href);

const wasmDir = join(root, "apps/web/src/wasm/pkg");
const mod = await import(pathToFileURL(join(wasmDir, "mp5_codec.js")).href);
await mod.default(readFileSync(join(wasmDir, "mp5_codec_bg.wasm")));

const buf = readFileSync(mp5Path);
const parsed = parseMp5(buf);
const frame = parsed.audioFrames[0]?.data;
if (!frame) throw new Error("no AUDI frame");

const decoded = mod.decode_mp5l(frame);
const labels = describeMp5lPlayback(frame);
const ver = mp5lBitstreamVersion(frame);

console.log("=== Format panel (web UI) ===");
console.log("codec-label:", codecLabel(parsed.head?.codecId ?? 0));
console.log("container:", labels.containerMode);
console.log("encoder version:", labels.encoderVersion);
console.log("output quality:", labels.outputQuality);
console.log("decode-path:", ver === 3 ? "MP5-L WASM v3 decode (lossless)" : `MP5-L v${ver}`);
console.log("encoder info:", parsed.info.find((i) => i.key === "encoder")?.value);
console.log("meta:", parsed.meta.map((m) => `${m.key}=${m.value}`).join(", ") || "(none)");

const head = parsed.head;
const pcmBytes =
  Number(head.totalSamples) * head.channels * (head.bitsPerSample / 8);
console.log("\n=== Sizes ===");
console.log("mp5 bytes:", buf.length);
console.log("pcm bytes:", pcmBytes);
console.log("ratio:", (buf.length / pcmBytes).toFixed(3));

console.log("\n=== Playback ===");
console.log("decoded samples:", decoded.length);
console.log("expected (approx):", Number(head.totalSamples) * head.channels);
console.log("codecId MP5L:", head.codecId === CodecId.MP5L);
console.log("bitstream v3:", ver === 3);

if (!flacPath) {
  console.log("(FLAC path check skipped)");
}
