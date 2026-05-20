#!/usr/bin/env node
/**
 * Validate demo / test fixtures parse and match expected codecs.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { CodecId, parseMp5, validateParsedFile } = await import(
  pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href
);

const FIXTURES = [
  { file: "demo_mp5l_v3_tone.mp5", codec: CodecId.MP5L, magic: 0x4c },
  { file: "demo_pcm_reference_tone.mp5", codec: CodecId.PCM },
  { file: "demo_mp5c_lab_tone.mp5", codec: CodecId.MP5C, magic: 0x43 },
  { file: "validation_mp5l_v3.mp5", codec: CodecId.MP5L },
  { file: "validation_pcm_slice.mp5", codec: CodecId.PCM },
];

let failed = false;
for (const spec of FIXTURES) {
  const path = join(root, "test-fixtures", spec.file);
  if (!existsSync(path)) {
    console.error(`MISSING: ${spec.file} — run pnpm fixtures:generate`);
    failed = true;
    continue;
  }
  const buf = readFileSync(path);
  const parsed = parseMp5(buf);
  validateParsedFile(parsed, 16);
  if (parsed.head?.codecId !== spec.codec) {
    console.error(
      `FAIL ${spec.file}: expected codec ${spec.codec}, got ${parsed.head?.codecId}`,
    );
    failed = true;
    continue;
  }
  const frame = parsed.audioFrames[0]?.data;
  if (spec.magic != null && frame && frame[0] !== spec.magic) {
    console.error(`FAIL ${spec.file}: bad frame magic ${frame[0]}`);
    failed = true;
    continue;
  }
  if (spec.codec === CodecId.MP5L && frame && frame[1] !== 3) {
    console.error(`FAIL ${spec.file}: expected MP5-L v3`);
    failed = true;
    continue;
  }
  console.log(`OK ${spec.file} (${buf.length} bytes, codec ${spec.codec})`);
}

if (failed) process.exit(1);
console.log("\nAll demo fixtures validated.");
