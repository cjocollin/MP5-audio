#!/usr/bin/env node
/**
 * Validate demo_mp5l_v3_stems.mp5 — STEM/STDA integrity + AUDI playback + stem decode.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stemFile = join(root, "test-fixtures", "demo_mp5l_v3_stems.mp5");
const wasmDir = join(root, "apps/web/src/wasm/pkg");

const {
  CodecId,
  parseMp5,
  validateParsedFile,
  decodeStemManifest,
  validateStemChunks,
  STEM_DATA_FOURCC,
} = await import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);

if (!existsSync(stemFile)) {
  console.error("MISSING demo_mp5l_v3_stems.mp5 — run pnpm fixtures:generate");
  process.exit(1);
}

const buf = readFileSync(stemFile);
const parsed = parseMp5(buf);
validateParsedFile(parsed, 32);

if (!parsed.head || parsed.audioFrames.length === 0) {
  console.error("FAIL: missing AUDI full mix");
  process.exit(1);
}
if (parsed.head.codecId !== CodecId.MP5L) {
  console.error(`FAIL: expected MP5-L full mix, got codec ${parsed.head.codecId}`);
  process.exit(1);
}

const manifest = decodeStemManifest(parsed.optional.get("STEM"));
const stda = parsed.optional.get(STEM_DATA_FOURCC);
const stemCheck = validateStemChunks(manifest, stda);
if (!stemCheck.valid) {
  console.error("FAIL stem chunk validation:");
  for (const e of stemCheck.errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`OK STEM/STDA: ${manifest.stems.length} stems, fullMixInAudi=true`);

if (manifest.stems.length < 3) {
  console.error(`FAIL: expected at least 3 stems, got ${manifest.stems.length}`);
  process.exit(1);
}

const types = new Set(manifest.stems.map((s) => s.stemType));
for (const need of ["drums", "bass", "lead_vocals"]) {
  if (!types.has(need)) {
    console.error(`FAIL: missing stem type ${need}`);
    process.exit(1);
  }
}

let wasmOk = false;
if (existsSync(join(wasmDir, "mp5_codec_bg.wasm"))) {
  const mod = await import(pathToFileURL(join(wasmDir, "mp5_codec.js")).href);
  await mod.default(readFileSync(join(wasmDir, "mp5_codec_bg.wasm")));

  const mixFrame = parsed.audioFrames[0].data;
  const mixSamples = mod.decode_mp5l(mixFrame);
  if (!mixSamples?.length) {
    console.error("FAIL: AUDI full mix decode returned empty");
    process.exit(1);
  }
  console.log(`OK AUDI decode: ${mixSamples.length} samples`);

  const { decodeStdaEntries } = await import(
    pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href
  );
  const entries = decodeStdaEntries(stda);
  for (let i = 0; i < manifest.stems.length; i++) {
    const stem = manifest.stems[i];
    const frame = entries[i];
    try {
      const decoded = mod.decode_mp5l(frame);
      if (!decoded?.length) throw new Error("empty decode");
      console.log(`OK stem decode: ${stem.stemName} (${decoded.length} samples)`);
    } catch (e) {
      console.error(`FAIL stem decode ${stem.stemName}: ${e.message}`);
      process.exit(1);
    }
  }
  wasmOk = true;
} else {
  console.warn("SKIP stem WASM decode — wasm pkg missing");
}

// Corrupt checksum should fail validation
const badManifest = structuredClone(manifest);
badManifest.stems[0].checksum = "00000000";
const badCheck = validateStemChunks(badManifest, stda);
if (badCheck.valid) {
  console.error("FAIL: corrupt checksum should not validate");
  process.exit(1);
}
console.log("OK invalid checksum rejected safely");

console.log(
  `\nStem fixture validated (${buf.length} bytes)${wasmOk ? " with WASM decode" : ""}.\n`,
);
