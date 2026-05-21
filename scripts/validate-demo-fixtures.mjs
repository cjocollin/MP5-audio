#!/usr/bin/env node
/**
 * Validate demo / test fixtures parse and match expected codecs.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { CodecId, parseMp5, validateParsedFile, validateStemChunks, decodeStemManifest, decodeLyrc, decodeSect, decodeHook, decodeHilt, decodeVisu, parseAlbmPackageJson, STEM_DATA_FOURCC } = await import(
  pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href
);

const FIXTURES = [
  { file: "demo_mp5l_v3_tone.mp5", codec: CodecId.MP5L, magic: 0x4c },
  { file: "demo_mp5l_v3_stems.mp5", codec: CodecId.MP5L, magic: 0x4c, stems: true },
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
  if (spec.stems) {
    const manifest = decodeStemManifest(parsed.optional.get("STEM"));
    const check = validateStemChunks(manifest, parsed.optional.get(STEM_DATA_FOURCC));
    if (!check.valid) {
      console.error(`FAIL ${spec.file} stem validation:`, check.errors.join("; "));
      failed = true;
      continue;
    }
    const lyrc = decodeLyrc(parsed.optional.get("LYRC"));
    const synced = lyrc?.synced?.length ?? 0;
    if (spec.file === "demo_mp5l_v3_stems.mp5") {
      if (!synced) {
        console.error(`FAIL ${spec.file}: expected synced LYRC for karaoke demo`);
        failed = true;
        continue;
      }
      if (!manifest?.stems.some((s) => s.stemType === "instrumental")) {
        console.error(`FAIL ${spec.file}: expected instrumental stem`);
        failed = true;
        continue;
      }
      const sect = decodeSect(parsed.optional.get("SECT"));
      if (!sect?.sections.length) {
        console.error(`FAIL ${spec.file}: expected SECT sections`);
        failed = true;
        continue;
      }
      if (!decodeHook(parsed.optional.get("HOOK"))) {
        console.error(`FAIL ${spec.file}: expected HOOK chunk`);
        failed = true;
        continue;
      }
      const hilt = decodeHilt(parsed.optional.get("HILT"));
      const hasPreview = hilt?.highlights.some((h) => h.useCase === "preview");
      const hasShare = hilt?.highlights.some((h) => h.useCase === "share");
      if (!hasPreview || !hasShare) {
        console.error(`FAIL ${spec.file}: expected preview and share HILT highlights`);
        failed = true;
        continue;
      }
      const visu = decodeVisu(parsed.optional.get("VISU"));
      if (!visu?.themeName || !visu.accentColor) {
        console.error(`FAIL ${spec.file}: expected VISU theme with name and accent`);
        failed = true;
        continue;
      }
    }
    console.log(
      `OK ${spec.file} (${buf.length} bytes, codec ${spec.codec}, ${manifest?.stems.length ?? 0} stems${synced ? `, ${synced} lyric lines` : ""})`,
    );
  } else {
    console.log(`OK ${spec.file} (${buf.length} bytes, codec ${spec.codec})`);
  }
}

const albumPath = join(root, "test-fixtures", "demo_album_package.mp5p");
if (!existsSync(albumPath)) {
  console.error("MISSING: demo_album_package.mp5p — run node scripts/generate-demo-album-package.mjs");
  failed = true;
} else {
  const text = readFileSync(albumPath, "utf8");
  const { manifest, errors } = parseAlbmPackageJson(text);
  if (!manifest || errors.length) {
    console.error("FAIL demo_album_package.mp5p:", errors[0]?.message ?? "invalid");
    failed = true;
  } else if (manifest.tracks.length < 2) {
    console.error("FAIL demo_album_package.mp5p: expected at least 2 tracks");
    failed = true;
  } else {
    console.log(`OK demo_album_package.mp5p (${manifest.tracks.length} tracks, "${manifest.album.title}")`);
  }
}

if (failed) process.exit(1);
console.log("\nAll demo fixtures validated.");
