#!/usr/bin/env node
/**
 * Validate synthetic demo_pity_party_class.mp5 — Pity Party class regression profile.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "test-fixtures", "demo_pity_party_class.mp5");
const wasmDir = join(root, "apps/web/src/wasm/pkg");

const {
  CodecId,
  parseMp5,
  validateParsedFile,
  decodeStemManifest,
  validateStemChunks,
  STEM_DATA_FOURCC,
  decodeLyrc,
  decodeSect,
} = await import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);

if (!existsSync(file)) {
  console.error("MISSING demo_pity_party_class.mp5 — run pnpm fixtures:pity-party-class");
  process.exit(1);
}

const buf = readFileSync(file);
const parsed = parseMp5(buf);
validateParsedFile(parsed, 32);

if (!parsed.head || parsed.audioFrames.length === 0) {
  console.error("FAIL: missing AUDI full mix");
  process.exit(1);
}
if (parsed.head.codecId !== CodecId.MP5L) {
  console.error(`FAIL: expected MP5-L, got ${parsed.head.codecId}`);
  process.exit(1);
}

const manifest = decodeStemManifest(parsed.optional.get("STEM"));
const stda = parsed.optional.get(STEM_DATA_FOURCC);
const stdfFragments = parsed.stdfFragments ?? [];
const stemCheck = validateStemChunks(manifest, stda, stdfFragments);
if (!stemCheck.valid) {
  console.error("FAIL stem validation:");
  for (const e of stemCheck.errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (manifest.stems.length < 8) {
  console.error(`FAIL: expected ≥8 stems, got ${manifest.stems.length}`);
  process.exit(1);
}

const types = new Set(manifest.stems.map((s) => s.stemType));
if (types.has("instrumental")) {
  console.error("FAIL: pity-party-class must NOT include instrumental (karaoke mute-vocals path)");
  process.exit(1);
}
for (const need of ["lead_vocals", "background_vocals", "drums"]) {
  if (!types.has(need)) {
    console.error(`FAIL: missing stem type ${need}`);
    process.exit(1);
  }
}

if (manifest.storageMode !== "stdf-v1") {
  console.error(`FAIL: expected stdf-v1, got ${manifest.storageMode}`);
  process.exit(1);
}
if (stdfFragments.length < 10) {
  console.error(`FAIL: expected STDF fragments, got ${stdfFragments.length}`);
  process.exit(1);
}

const lyrc = parsed.optional.get("LYRC");
const sect = parsed.optional.get("SECT");
const visu = parsed.optional.get("VISU");
if (!lyrc || !decodeLyrc(lyrc)?.synced?.length) {
  console.error("FAIL: missing synced LYRC");
  process.exit(1);
}
if (!sect || !decodeSect(sect)?.sections?.length) {
  console.error("FAIL: missing SECT");
  process.exit(1);
}
if (!visu) {
  console.error("FAIL: missing VISU");
  process.exit(1);
}

const durationSec = Number(parsed.head.totalSamples) / parsed.head.sampleRate;
if (durationSec < 12) {
  console.error(`FAIL: duration too short (${durationSec}s)`);
  process.exit(1);
}

const mod = await import(pathToFileURL(join(wasmDir, "mp5_codec.js")).href);
await mod.default(readFileSync(join(wasmDir, "mp5_codec_bg.wasm")));

const mixFrame = parsed.audioFrames[0].data;
const mixPcm = mod.decode_mp5l(mixFrame, parsed.head.channels);
if (!mixPcm?.length) {
  console.error("FAIL: full mix decode");
  process.exit(1);
}

console.log(
  `OK pity-party-class: ${manifest.stems.length} stems, ${manifest.storageMode}, ${durationSec.toFixed(1)}s, LYRC/SECT/VISU`,
);
