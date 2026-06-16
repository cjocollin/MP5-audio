#!/usr/bin/env node
/**
 * Inspect .mp5 and .mp5p files with a human-readable compatibility report.
 */
import { readFileSync, existsSync, statSync } from "fs";
import { basename, dirname, resolve, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

function printHelp() {
  console.log(`MP5 inspector

Usage:
  pnpm inspect:mp5 <file.mp5|file.mp5p> [--dir <sidecar-folder>]

Examples:
  pnpm inspect:mp5 test-fixtures/demo_mp5l_v3_tone.mp5
  pnpm inspect:mp5 test-fixtures/demo_album_package.mp5p --dir test-fixtures
  pnpm inspect:mp5 test-fixtures/demo_embedded_album_package.mp5p

What it reports:
  - container/package kind, codec, duration, chunks, metadata, cover, lyrics
  - stem storage mode (STDA or STDF), VISU, credits/rights IDs, integrity
  - validation profile pass/fail summary and compatibility level

Notes:
  This is an informational compatibility report. It does not verify legal rights,
  DRM, ownership, or archival suitability.`);
}

function parseArgs(argv) {
  const files = [];
  let sidecarDir = null;
  let help = false;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--dir" && argv[i + 1]) {
      sidecarDir = resolve(argv[++i]);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    files.push(resolve(arg));
  }
  return { files, sidecarDir, help };
}

async function loadContainer() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  return import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);
}

function yesNo(v) {
  return v ? "yes" : "no";
}

function line(label, value = "") {
  console.log(`${label.padEnd(19)} ${value}`);
}

function printProfiles(profiles) {
  console.log("Validation profiles:");
  for (const [k, v] of Object.entries(profiles)) {
    console.log(`  ${k.padEnd(10)} ${v ? "PASS" : "-"}`);
  }
}

function printMp5Report(r) {
  console.log("");
  line("File type:", ".mp5");
  line("Path:", r.path ?? "(stdin)");
  line("File size:", `${r.fileSize} bytes`);
  line("Magic:", r.magic);
  line("Container:", r.containerVersion);
  line("Codec:", `${r.codecLabel} (${r.codecId})`);
  line("Codec version:", r.codecVersion);
  line("Duration:", `${r.durationSec.toFixed(2)} s`);
  line("Sample rate:", `${r.sampleRate} Hz`);
  line("Channels:", r.channels);
  console.log("");
  line("Chunks present:", r.chunksPresent.join(", "));
  line("Required OK:", r.requiredPresent.join(", ") || "(none)");
  if (r.requiredMissing.length) line("Required missing:", r.requiredMissing.join(", "));
  if (r.optionalUnknown.length) line("Unknown optional:", r.optionalUnknown.join(", "));

  const meta = r.metadataSummary;
  console.log("");
  line("Metadata:", [meta.title, meta.artist, meta.album].filter(Boolean).join(" / ") || "(none)");
  line("Cover art:", yesNo(r.hasCover));
  line(
    "Lyrics:",
    r.lyricsSynced || r.lyricsUnsynced
      ? `${r.lyricsSynced} synced, ${r.lyricsUnsynced} unsynced`
      : "none",
  );
  line(
    "Stems:",
    r.stemsCount
      ? `${r.stemsCount} (${r.stemTypes.join(", ")}) / ${r.stemStorageMode}${
          r.stemFragmentCount ? ` / ${r.stemFragmentCount} STDF fragment(s)` : ""
        }`
      : "none",
  );
  if (r.stemsCount) {
    line(
      "Stem data:",
      `~${Math.round(r.stemDataTotalBytes / (1024 * 1024))} MB total; largest chunk ${Math.round(
        r.largestStemChunkBytes / (1024 * 1024),
      )} MB`,
    );
  }
  if (r.stemAudit?.length) {
    line("Stem audit:", `${r.stemAudit.length} stem(s)`);
    for (const s of r.stemAudit) {
      const parts = s.partIndexes.length > 0 ? `parts [${s.partIndexes.join(",")}]` : "no parts";
      console.log(
        `  ${s.stemName.padEnd(18)} ${s.status.padEnd(18)} frags ${s.indexedFragmentCount}/${s.expectedFragmentCount} / ${parts} / ~${Math.round(
          s.indexedInnerPayloadBytes / 1024,
        )} KB`,
      );
    }
  }
  line(
    "Sections:",
    `${r.sectionsCount} sections${r.hooksCount ? ", hook" : ""}${
      r.highlightsCount ? `, ${r.highlightsCount} highlights` : ""
    }`,
  );
  line("VISU theme:", `${yesNo(r.hasVisualTheme)}${r.visuThemeName ? ` / ${r.visuThemeName}` : ""}`);
  if (r.hasVisualTheme) {
    line(
      "VISU colors:",
      `${r.visuHasCustomColors ? "embedded hex" : "metadata only"}${
        r.visuSource ? ` / source ${r.visuSource}` : ""
      }`,
    );
  }
  line(
    "Credits/Rights/ID:",
    [r.hasCredits && "CRDT", r.hasRights && "LICN", r.hasIdentifiers && "IDEN"]
      .filter(Boolean)
      .join(", ") || "none",
  );
  line("Integrity:", r.integrityStatus);
  if (r.integrityMessage) line("Integrity note:", r.integrityMessage);

  console.log("");
  printProfiles(r.profiles);
  line("Compatibility:", r.compatibilityLevel.toUpperCase());
  if (r.warnings.length) {
    console.log("\nWarnings:");
    for (const w of r.warnings) console.log("  -", w);
  }
  if (r.errors.length) {
    console.log("\nErrors:");
    for (const e of r.errors) console.log("  -", e);
  }
  if (r.parseWarnings.length) {
    console.log("\nParse warnings:");
    for (const w of r.parseWarnings) console.log("  -", w);
  }
  console.log("\nNote: metadata is informational only; no legal rights or authenticity verification.");
}

function printMp5pReport(r) {
  console.log("");
  line("File type:", ".mp5p album package");
  line("Package kind:", r.packageKind ?? "manifest");
  line("Path:", r.path ?? "");
  if (r.fileSize != null) line("File size:", `${r.fileSize} bytes`);
  if (r.packageVersion != null) line("Package version:", r.packageVersion);
  line("Manifest format:", r.manifestFormat);
  line("Manifest version:", r.manifestVersion);
  line("Album:", `${r.albumTitle}${r.albumArtist ? ` / ${r.albumArtist}` : ""}`);
  line("Tracks:", r.trackCount);
  if (r.packageKind === "embedded") {
    line("Embedded audio:", `${r.totalEmbeddedBytes ?? 0} bytes`);
    line("Fragments:", r.totalFragmentCount ?? 0);
    if (r.embeddedTrackSizes?.length) {
      console.log("Embedded tracks:");
      for (const t of r.embeddedTrackSizes) {
        console.log(`  ${t.trackId.padEnd(16)} ${t.logicalFile} / ${t.bytes} bytes / ${t.fragments} fragment(s)`);
      }
    }
    line("Integrity:", r.integrityValid ? "OK" : "issues");
    if (r.integrityIssues?.length) {
      for (const i of r.integrityIssues) console.log("  -", i);
    }
  } else {
    line("Sidecars:", r.sidecarPaths.join(", ") || "(none)");
  }
  line("Tracks w/ hash:", r.tracksWithHash);
  if (r.missingSidecars.length) line("Missing sidecars:", r.missingSidecars.join(", "));

  console.log("");
  printProfiles(r.profiles);
  line("Compatibility:", r.compatibilityLevel.toUpperCase());
  if (r.auditWarnings.length) {
    console.log("\nPackage warnings:");
    for (const w of r.auditWarnings) console.log("  -", w);
  }
  if (r.validationErrors.length) {
    console.log("\nValidation errors:");
    for (const e of r.validationErrors) console.log("  -", e);
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printHelp();
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.files.length) {
    printHelp();
    process.exit(1);
  }

  const {
    parseMp5,
    assessMp5Compatibility,
    assessMp5pFromBytes,
    verifyMp5FileIntegrity,
    decodeStemManifest,
    auditStdfStemFromChunks,
  } = await loadContainer();

  let exitCode = 0;
  for (const path of args.files) {
    if (!existsSync(path)) {
      console.error("File not found:", path);
      exitCode = 1;
      continue;
    }

    try {
      const buf = readFileSync(path);
      const name = basename(path).toLowerCase();
      console.log("\nMP5 Inspector");
      console.log("=============");
      console.log("Name:", basename(path));

      if (name.endsWith(".mp5p")) {
        const baseDir = args.sidecarDir ?? dirname(path);
        const report = assessMp5pFromBytes(new Uint8Array(buf), {
          path,
          sidecarExists: (rel) => existsSync(join(baseDir, rel)),
        });
        printMp5pReport(report);
        if (report.compatibilityLevel === "error") exitCode = 1;
        continue;
      }

      const parsed = parseMp5(buf);
      const integrity = await verifyMp5FileIntegrity(parsed, buf);
      const report = assessMp5Compatibility(parsed, {
        path,
        fileSize: statSync(path).size,
        integrity,
      });
      const stemManifest = decodeStemManifest(parsed.optional.get("STEM"));
      if (stemManifest?.stems.length && parsed.stdfFragments?.length) {
        report.stemAudit = auditStdfStemFromChunks(stemManifest, parsed.stdfFragments);
      }
      printMp5Report(report);
      if (report.compatibilityLevel === "error") exitCode = 1;
    } catch (err) {
      console.error("Inspect failed:", err instanceof Error ? err.message : String(err));
      exitCode = 1;
    }
  }
  process.exit(exitCode);
}

main();
