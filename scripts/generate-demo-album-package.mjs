#!/usr/bin/env node
/**
 * Write demo_album_package.mp5p referencing synthetic demo .mp5 files.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test-fixtures");
mkdirSync(outDir, { recursive: true });

const { manifestToJson, ALBUM_MANIFEST_FORMAT } = await import(
  pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href
);

const manifest = {
  format: ALBUM_MANIFEST_FORMAT,
  version: 1,
  album: {
    title: "MP5 Demo Album",
    artist: "MP5 Alpha Demo",
    albumArtist: "MP5 Alpha Demo",
    year: "2026",
    releaseDate: "2026-05-20",
    genre: "Synthetic demo",
  },
  tracks: [
    {
      trackId: "demo-tone",
      file: "demo_mp5l_v3_tone.mp5",
      trackNumber: 1,
      discNumber: 1,
      title: "Demo tone (MP5-L v3)",
      artist: "MP5 Alpha Demo",
    },
    {
      trackId: "demo-song-map",
      file: "demo_mp5l_v3_stems.mp5",
      trackNumber: 2,
      discNumber: 1,
      title: "Demo song map — stems, karaoke, sections, highlights, VISU",
      artist: "MP5 Alpha Demo",
      gaplessNext: false,
    },
  ],
  credits:
    "Synthetic MP5 demo only. Import: drop this .mp5p plus demo_mp5l_v3_tone.mp5 and demo_mp5l_v3_stems.mp5 together.",
  crdt: {
    primaryArtist: ["MP5 Alpha Demo"],
    producer: ["MP5 Synthetic Lab"],
    copyrightHolder: ["MP5 Alpha Demo"],
  },
  licn: {
    licenseType: "Synthetic demo — not for commercial distribution",
    informationalOnly:
      "Rights metadata is informational only and may not be verified or enforced.",
  },
  iden: {
    catalogNumber: "MP5-DEMO-ALBUM-001",
    releaseDate: "2026-05-20",
  },
  gaplessDefault: false,
};

const path = join(outDir, "demo_album_package.mp5p");
writeFileSync(path, manifestToJson(manifest, true), "utf8");
console.log(`Wrote ${path}`);
