#!/usr/bin/env node
/**
 * Write test-fixtures/demo_embedded_album_package.mp5p (embedded binary .mp5p).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test-fixtures");
mkdirSync(outDir, { recursive: true });

const tonePath = join(outDir, "demo_mp5l_v3_tone.mp5");
const stemsPath = join(outDir, "demo_mp5l_v3_stems.mp5");
if (!existsSync(tonePath) || !existsSync(stemsPath)) {
  console.error("Missing demo .mp5 fixtures — run pnpm fixtures:generate first");
  process.exit(1);
}

const {
  EMBEDDED_ALBUM_MANIFEST_FORMAT,
  writeEmbeddedAlbumPackage,
  sha256HexDigest,
} = await import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);

const toneBytes = new Uint8Array(readFileSync(tonePath));
const stemsBytes = new Uint8Array(readFileSync(stemsPath));
const toneHash = await sha256HexDigest(toneBytes);
const stemsHash = await sha256HexDigest(stemsBytes);

const manifest = {
  format: EMBEDDED_ALBUM_MANIFEST_FORMAT,
  version: 1,
  album: {
    title: "MP5 Demo Embedded Album",
    artist: "MP5 Alpha Demo",
    albumArtist: "MP5 Alpha Demo",
    year: "2026",
    genre: "Synthetic demo",
  },
  tracks: [
    {
      trackId: "demo-tone",
      file: "demo_mp5l_v3_tone.mp5",
      trackNumber: 1,
      discNumber: 1,
      title: "Demo tone (MP5-L v3)",
      fileSha256: toneHash,
    },
    {
      trackId: "demo-stems",
      file: "demo_mp5l_v3_stems.mp5",
      trackNumber: 2,
      discNumber: 1,
      title: "Demo stems / karaoke / sections",
      fileSha256: stemsHash,
    },
  ],
  credits: "Synthetic MP5 demo only — embedded album package prototype.",
  gaplessDefault: false,
};

const pkg = writeEmbeddedAlbumPackage({
  manifest,
  tracks: [
    {
      trackId: "demo-tone",
      logicalFile: "demo_mp5l_v3_tone.mp5",
      bytes: toneBytes,
      sha256: toneHash,
    },
    {
      trackId: "demo-stems",
      logicalFile: "demo_mp5l_v3_stems.mp5",
      bytes: stemsBytes,
      sha256: stemsHash,
    },
  ],
});

const outPath = join(outDir, "demo_embedded_album_package.mp5p");
writeFileSync(outPath, pkg);
console.log(`Wrote ${outPath} (${pkg.length} bytes)`);
