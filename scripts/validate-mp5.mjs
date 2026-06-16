#!/usr/bin/env node
/**
 * Validate .mp5 and .mp5p files with compatibility profiles.
 */
import { readFileSync, existsSync, statSync } from "fs";
import { dirname, resolve, join, basename } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const PROFILES = ["basic", "playable", "rich", "strict", "package"];

function printHelp() {
  console.log(`MP5 validator

Usage:
  pnpm validate:mp5 <file.mp5> [--profile basic|playable|rich|strict]
  pnpm validate:mp5p <file.mp5p> [--dir <sidecar-folder>] [--profile package]

Profiles:
  basic     Container/package structure parses within Public Beta limits.
  playable  Required playback data is present. Default for .mp5.
  rich      Playable plus implemented optional metadata validates.
  strict    Rich plus supported integrity metadata verifies.
  package   Manifest or embedded .mp5p package validates. Default fallback for .mp5p.

Examples:
  pnpm validate:mp5 test-fixtures/demo_mp5l_v3_tone.mp5 --profile playable
  pnpm validate:mp5p test-fixtures/demo_album_package.mp5p --dir test-fixtures --profile package
  pnpm validate:mp5p test-fixtures/demo_embedded_album_package.mp5p --profile package

Notes:
  This checks structure and compatibility only. It does not verify legal rights,
  DRM, ownership, or archival suitability.`);
}

function parseArgs(argv) {
  let profile = "playable";
  let sidecarDir = null;
  let help = false;
  const files = [];

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--profile" && argv[i + 1]) {
      profile = argv[++i];
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

  return { files, profile, sidecarDir, help };
}

async function loadContainer() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  return import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);
}

async function validateFile(path, profile, sidecarDir, container) {
  const {
    parseMp5,
    assessMp5Compatibility,
    assessMp5pFromBytes,
    verifyMp5FileIntegrity,
  } = container;

  if (!existsSync(path)) {
    console.error(`MISSING ${path}`);
    return false;
  }

  try {
    const name = basename(path).toLowerCase();
    if (name.endsWith(".mp5p")) {
      const buf = new Uint8Array(readFileSync(path));
      const baseDir = sidecarDir ?? dirname(path);
      const report = assessMp5pFromBytes(buf, {
        path,
        sidecarExists: (rel) => existsSync(join(baseDir, rel)),
      });
      const ok = report.profiles[profile] ?? report.profiles.package;
      console.log(
        ok ? `OK ${basename(path)} [${profile}]` : `FAIL ${basename(path)} [${profile}]`,
      );
      if (!ok) {
        for (const e of report.validationErrors) console.error("  error:", e);
        for (const m of report.missingSidecars) console.error("  missing sidecar:", m);
      }
      return ok;
    }

    const buf = readFileSync(path);
    const parsed = parseMp5(buf);
    const integrity = await verifyMp5FileIntegrity(parsed, buf);
    const report = assessMp5Compatibility(parsed, {
      path,
      fileSize: statSync(path).size,
      integrity,
    });
    const ok = !!report.profiles[profile];
    console.log(
      ok
        ? `OK ${basename(path)} [${profile}] level=${report.compatibilityLevel}`
        : `FAIL ${basename(path)} [${profile}] level=${report.compatibilityLevel}`,
    );
    if (!ok) {
      for (const e of report.errors) console.error("  error:", e);
      for (const w of report.warnings) console.error("  warn:", w);
    }
    return ok;
  } catch (err) {
    console.error(`FAIL ${basename(path)} [${profile}]`);
    console.error("  error:", err instanceof Error ? err.message : String(err));
    return false;
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

  if (!PROFILES.includes(args.profile)) {
    console.error(`Unknown profile: ${args.profile}. Use: ${PROFILES.join(", ")}`);
    process.exit(1);
  }

  const container = await loadContainer();
  let failed = false;
  for (const path of args.files) {
    const ok = await validateFile(path, args.profile, args.sidecarDir, container);
    failed ||= !ok;
  }

  if (failed) {
    console.error("\nValidation failed. Checks are structural and informational only.");
    process.exit(1);
  }
  console.log("\nValidation passed. Checks are structural and informational only.");
}

main();
