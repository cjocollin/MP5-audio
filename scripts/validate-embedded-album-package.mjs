#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "test-fixtures", "demo_embedded_album_package.mp5p");

if (!existsSync(path)) {
  console.error("MISSING demo_embedded_album_package.mp5p — run node scripts/generate-demo-embedded-album-package.mjs");
  process.exit(1);
}

const {
  indexEmbeddedAlbumPackage,
  verifyEmbeddedPackageIntegrityAsync,
  EMBEDDED_MAX_FRAGMENT_PAYLOAD,
  decodeEmbeddedFragment,
} = await import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);

const bytes = new Uint8Array(readFileSync(path));
let index;
try {
  index = indexEmbeddedAlbumPackage(bytes);
} catch (e) {
  console.error("FAIL index:", e instanceof Error ? e.message : e);
  process.exit(1);
}

if (index.tracks.length < 2) {
  console.error("FAIL: expected 2+ embedded tracks");
  process.exit(1);
}

for (const t of index.tracks) {
  for (const f of t.fragments) {
    const slice = bytes.slice(f.recordOffset, f.recordOffset + f.recordLength);
    const decoded = decodeEmbeddedFragment(slice);
    if (!decoded) {
      console.error(`FAIL fragment decode ${t.trackId} part ${f.partIndex}`);
      process.exit(1);
    }
    if (decoded.payload.length > EMBEDDED_MAX_FRAGMENT_PAYLOAD) {
      console.error(`FAIL fragment exceeds safe limit: ${decoded.payload.length}`);
      process.exit(1);
    }
  }
}

const integrity = await verifyEmbeddedPackageIntegrityAsync(bytes, { verifyTrackHashes: true });
if (!integrity.valid) {
  console.error("FAIL integrity:", integrity.issues[0]?.message ?? "unknown");
  process.exit(1);
}

console.log(
  `OK demo_embedded_album_package.mp5p (${index.tracks.length} tracks, ${index.totalFragmentCount} fragments, ${bytes.length} bytes)`,
);
