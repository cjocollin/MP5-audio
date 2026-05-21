#!/usr/bin/env node
/**
 * Golden fixture validation — demo + compatibility (when generated).
 * Usage: pnpm fixtures:validate (alias) or node scripts/validate-golden-fixtures.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const compatDir = join(root, "test-fixtures", "compatibility");

const {
  CodecId,
  parseMp5,
  validateParsedFile,
  validateStemChunks,
  decodeStemManifest,
  decodeLyrc,
  decodeSect,
  decodeHook,
  decodeHilt,
  decodeVisu,
  parseAlbmPackageJson,
  assessMp5Compatibility,
  STEM_DATA_FOURCC,
} = await import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);

const DEMO_FIXTURES = [
  { file: "demo_mp5l_v3_tone.mp5", codec: CodecId.MP5L, magic: 0x4c, profile: "rich" },
  { file: "demo_mp5l_v3_stems.mp5", codec: CodecId.MP5L, magic: 0x4c, stems: true, profile: "rich" },
  { file: "demo_pcm_reference_tone.mp5", codec: CodecId.PCM, profile: "playable" },
  { file: "demo_mp5c_lab_tone.mp5", codec: CodecId.MP5C, magic: 0x43, profile: "playable" },
  { file: "validation_mp5l_v3.mp5", codec: CodecId.MP5L, profile: "rich" },
  { file: "validation_pcm_slice.mp5", codec: CodecId.PCM, profile: "playable" },
];

const COMPAT_FIXTURES = [
  { file: "mp5l_metadata_full.mp5", profile: "rich", codec: CodecId.MP5L },
  { file: "mp5l_with_cover.mp5", profile: "rich", codec: CodecId.MP5L },
  { file: "mp5h_with_corr.mp5", profile: "playable", codec: CodecId.MP5H },
  { file: "mp5h_no_corr.mp5", profile: "playable", warn: "mp5h_no_corr" },
  { file: "mp5l_unknown_futr.mp5", profile: "playable", unknown: "FUTR" },
  { file: "corrupt_truncated.mp5", expectParseFail: true },
];

let failed = false;

function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`OK ${msg}`);
}

for (const spec of DEMO_FIXTURES) {
  const path = join(root, "test-fixtures", spec.file);
  if (!existsSync(path)) {
    fail(`${spec.file} missing — run pnpm fixtures:generate`);
    continue;
  }
  const buf = readFileSync(path);
  const parsed = parseMp5(buf);
  validateParsedFile(parsed, 16);
  if (parsed.head?.codecId !== spec.codec) {
    fail(`${spec.file}: codec ${parsed.head?.codecId} !== ${spec.codec}`);
    continue;
  }
  const frame = parsed.audioFrames[0]?.data;
  if (spec.magic != null && frame && frame[0] !== spec.magic) {
    fail(`${spec.file}: bad frame magic`);
    continue;
  }
  if (spec.codec === CodecId.MP5L && frame && frame[1] !== 3) {
    fail(`${spec.file}: expected MP5-L v3`);
    continue;
  }
  if (spec.stems) {
    const manifest = decodeStemManifest(parsed.optional.get("STEM"));
    const check = validateStemChunks(manifest, parsed.optional.get(STEM_DATA_FOURCC));
    if (!check.valid) {
      fail(`${spec.file} stems: ${check.errors.join("; ")}`);
      continue;
    }
    if (spec.file === "demo_mp5l_v3_stems.mp5") {
      const lyrc = decodeLyrc(parsed.optional.get("LYRC"));
      if (!lyrc?.synced?.length) fail(`${spec.file}: missing synced LYRC`);
      if (!decodeSect(parsed.optional.get("SECT"))?.sections.length) fail(`${spec.file}: missing SECT`);
      if (!decodeHook(parsed.optional.get("HOOK"))) fail(`${spec.file}: missing HOOK`);
      const hilt = decodeHilt(parsed.optional.get("HILT"));
      if (!hilt?.highlights.some((h) => h.useCase === "preview")) fail(`${spec.file}: missing HILT preview`);
      if (!decodeVisu(parsed.optional.get("VISU"))?.themeName) fail(`${spec.file}: missing VISU`);
    }
  }
  const report = assessMp5Compatibility(parsed, { fileSize: buf.length });
  if (!report.profiles[spec.profile]) {
    fail(`${spec.file}: profile ${spec.profile} failed`);
    continue;
  }
  ok(`${spec.file} (${buf.length} B, profile ${spec.profile})`);
}

for (const spec of COMPAT_FIXTURES) {
  const path = join(compatDir, spec.file);
  if (!existsSync(path)) {
    console.log(`SKIP ${spec.file} — run pnpm compatibility:fixtures`);
    continue;
  }
  const buf = readFileSync(path);
  if (spec.expectParseFail) {
    try {
      parseMp5(buf);
      fail(`${spec.file}: expected parse failure`);
    } catch {
      ok(`${spec.file} (parse rejected as expected)`);
    }
    continue;
  }
  const parsed = parseMp5(buf);
  validateParsedFile(parsed, 32);
  if (spec.codec != null && parsed.head?.codecId !== spec.codec) {
    fail(`${spec.file}: wrong codec`);
    continue;
  }
  const report = assessMp5Compatibility(parsed, { fileSize: buf.length });
  if (!report.profiles[spec.profile]) {
    fail(`${spec.file}: profile ${spec.profile}`);
    continue;
  }
  if (spec.unknown && !report.optionalUnknown.includes(spec.unknown)) {
    fail(`${spec.file}: expected unknown chunk ${spec.unknown}`);
    continue;
  }
  if (spec.warn === "mp5h_no_corr") {
    const hasWarn = report.issues.some((i) => i.code === "mp5h_no_corr");
    if (!hasWarn) fail(`${spec.file}: expected MP5-H no CORR warning`);
  }
  ok(`compatibility/${spec.file} (profile ${spec.profile})`);
}

const albumPath = join(root, "test-fixtures", "demo_album_package.mp5p");
if (!existsSync(albumPath)) {
  fail("demo_album_package.mp5p missing");
} else {
  const text = readFileSync(albumPath, "utf8");
  const { manifest, errors } = parseAlbmPackageJson(text);
  if (!manifest || errors.length) {
    fail(`demo_album_package.mp5p: ${errors[0]?.message ?? "invalid"}`);
  } else if (manifest.tracks.length < 2) {
    fail("demo_album_package.mp5p: need 2+ tracks");
  } else {
    ok(`demo_album_package.mp5p (${manifest.tracks.length} tracks)`);
  }
}

if (failed) process.exit(1);
console.log("\nGolden fixture validation passed.");
