#!/usr/bin/env node
/**
 * Inspect .mp5 or .mp5p files (human-readable compatibility report).
 * Stem storage: stda-v1 (single STDA) or stdf-v1 (STDF×N fragments) when reported in STEM manifest.
 * Usage:
 *   pnpm inspect:mp5 <file.mp5>
 *   pnpm inspect:mp5 <manifest.mp5p> [--dir <folder-with-sidecars>]
 */
import { readFileSync, existsSync, statSync } from "fs";
import { basename, dirname, resolve, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const container = await import(
  pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href
);

const {
  parseMp5,
  assessMp5Compatibility,
  assessMp5pCompatibility,
} = container;

function parseArgs(argv) {
  const files = [];
  let sidecarDir = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--dir" && argv[i + 1]) {
      sidecarDir = resolve(argv[++i]);
      continue;
    }
    files.push(resolve(argv[i]));
  }
  return { files, sidecarDir };
}

function printMp5Report(r) {
  console.log("");
  console.log("File type:        .mp5");
  console.log("Path:             ", r.path ?? "(stdin)");
  console.log("File size:        ", r.fileSize, "bytes");
  console.log("Magic:            ", r.magic);
  console.log("Container:        ", r.containerVersion);
  console.log("Codec:            ", r.codecLabel, `(${r.codecId})`);
  console.log("Codec version:    ", r.codecVersion);
  console.log("Duration:         ", r.durationSec.toFixed(2), "s");
  console.log("Sample rate:      ", r.sampleRate, "Hz");
  console.log("Channels:         ", r.channels);
  console.log("");
  console.log("Chunks present:   ", r.chunksPresent.join(", "));
  console.log("Required OK:      ", r.requiredPresent.join(", ") || "(none)");
  if (r.requiredMissing.length) {
    console.log("Required MISSING: ", r.requiredMissing.join(", "));
  }
  if (r.optionalUnknown.length) {
    console.log("Unknown optional: ", r.optionalUnknown.join(", "));
  }
  console.log("");
  const meta = r.metadataSummary;
  console.log("Metadata:         ", [meta.title, meta.artist, meta.album].filter(Boolean).join(" · ") || "(none)");
  console.log("Cover art:        ", r.hasCover ? "yes" : "no");
  console.log(
    "Lyrics:           ",
    r.lyricsSynced ? `${r.lyricsSynced} synced` : "",
    r.lyricsUnsynced ? `${r.lyricsUnsynced} unsynced` : "",
    !r.lyricsSynced && !r.lyricsUnsynced ? "none" : "",
  );
  console.log(
    "Stems:            ",
    r.stemsCount
      ? `${r.stemsCount} (${r.stemTypes.join(", ")}) · ${r.stemStorageMode}${
          r.stemFragmentCount ? ` · ${r.stemFragmentCount} STDF fragment(s)` : ""
        }`
      : "none",
  );
  if (r.stemsCount) {
    console.log(
      "Stem data:        ",
      `~${Math.round(r.stemDataTotalBytes / (1024 * 1024))} MB total · largest chunk ${Math.round(r.largestStemChunkBytes / (1024 * 1024))} MB`,
    );
  }
  console.log(
    "Sections/HOOK/HILT:",
    `${r.sectionsCount} sections`,
    r.hooksCount ? "· hook" : "",
    r.highlightsCount ? `· ${r.highlightsCount} highlights` : "",
  );
  console.log("VISU theme:       ", r.hasVisualTheme ? "yes" : "no");
  console.log(
    "Credits/Rights/ID:",
    [r.hasCredits && "CRDT", r.hasRights && "LICN", r.hasIdentifiers && "IDEN"]
      .filter(Boolean)
      .join(", ") || "none",
  );
  console.log("Integrity:        ", r.integrityStatus);
  console.log("");
  console.log("Validation profiles:");
  for (const [k, v] of Object.entries(r.profiles)) {
    console.log(`  ${k.padEnd(10)} ${v ? "PASS" : "—"}`);
  }
  console.log("Compatibility:    ", r.compatibilityLevel.toUpperCase());
  if (r.warnings.length) {
    console.log("\nWarnings:");
    for (const w of r.warnings) console.log("  •", w);
  }
  if (r.errors.length) {
    console.log("\nErrors:");
    for (const e of r.errors) console.log("  •", e);
  }
  if (r.parseWarnings.length) {
    console.log("\nParse warnings:");
    for (const w of r.parseWarnings) console.log("  •", w);
  }
  console.log("");
  console.log("Note: MP5 does not verify legal rights or authenticity — metadata is informational only.");
}

function printMp5pReport(r) {
  console.log("");
  console.log("File type:        .mp5p (album manifest)");
  console.log("Path:             ", r.path ?? "");
  console.log("Manifest format:  ", r.manifestFormat);
  console.log("Manifest version: ", r.manifestVersion);
  console.log("Album:            ", r.albumTitle, r.albumArtist ? `· ${r.albumArtist}` : "");
  console.log("Tracks:           ", r.trackCount);
  console.log("Sidecars:         ", r.sidecarPaths.join(", ") || "(none)");
  console.log("Tracks w/ hash:   ", r.tracksWithHash);
  if (r.missingSidecars.length) {
    console.log("Missing sidecars: ", r.missingSidecars.join(", "));
  }
  console.log("");
  console.log("Validation profiles:");
  for (const [k, v] of Object.entries(r.profiles)) {
    console.log(`  ${k.padEnd(10)} ${v ? "PASS" : "—"}`);
  }
  console.log("Compatibility:    ", r.compatibilityLevel.toUpperCase());
  if (r.auditWarnings.length) {
    console.log("\nPackage warnings:");
    for (const w of r.auditWarnings) console.log("  •", w);
  }
  if (r.validationErrors.length) {
    console.log("\nValidation errors:");
    for (const e of r.validationErrors) console.log("  •", e);
  }
  console.log("");
}

function main() {
  const { files, sidecarDir } = parseArgs(process.argv);
  if (!files.length) {
    console.error("Usage: pnpm inspect:mp5 <file.mp5|.mp5p> [--dir <sidecar-folder>]");
    process.exit(1);
  }

  let exitCode = 0;
  for (const path of files) {
    if (!existsSync(path)) {
      console.error("File not found:", path);
      exitCode = 1;
      continue;
    }
    const buf = readFileSync(path);
    const name = basename(path).toLowerCase();
    console.log("\nMP5 Inspector");
    console.log("=============");
    console.log("Name:", basename(path));

    if (name.endsWith(".mp5p")) {
      const text = buf.toString("utf8");
      const baseDir = sidecarDir ?? dirname(path);
      const report = assessMp5pCompatibility(text, {
        path,
        sidecarExists: (rel) => existsSync(join(baseDir, rel)),
      });
      printMp5pReport(report);
      if (report.compatibilityLevel === "error") exitCode = 1;
      continue;
    }

    const parsed = parseMp5(buf);
    const report = assessMp5Compatibility(parsed, {
      path,
      fileSize: statSync(path).size,
    });
    printMp5Report(report);
    if (report.compatibilityLevel === "error") exitCode = 1;
  }
  process.exit(exitCode);
}

main();
