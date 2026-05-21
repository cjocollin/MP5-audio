#!/usr/bin/env node
/**
 * Validate .mp5 / .mp5p with profiles: basic | playable | rich | strict | package
 * Usage:
 *   pnpm validate:mp5 <file> [--profile playable]
 *   pnpm validate:mp5p <manifest.mp5p> [--dir <sidecars>] [--profile package]
 */
import { readFileSync, existsSync, statSync } from "fs";
import { dirname, resolve, join, basename } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const PROFILES = ["basic", "playable", "rich", "strict", "package"];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const container = await import(
  pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href
);

const { parseMp5, assessMp5Compatibility, assessMp5pCompatibility } = container;

function parseArgs(argv) {
  let profile = "playable";
  let sidecarDir = null;
  const files = [];
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--profile" && argv[i + 1]) {
      profile = argv[++i];
      continue;
    }
    if (argv[i] === "--dir" && argv[i + 1]) {
      sidecarDir = resolve(argv[++i]);
      continue;
    }
    files.push(resolve(argv[i]));
  }
  return { files, profile, sidecarDir };
}

function main() {
  const { files, profile, sidecarDir } = parseArgs(process.argv);
  if (!files.length) {
    console.error(
      "Usage: pnpm validate:mp5 <file.mp5> [--profile basic|playable|rich|strict]\n" +
        "       pnpm validate:mp5p <file.mp5p> [--dir <folder>] [--profile package]",
    );
    process.exit(1);
  }
  if (!PROFILES.includes(profile)) {
    console.error(`Unknown profile: ${profile}. Use: ${PROFILES.join(", ")}`);
    process.exit(1);
  }

  let failed = false;
  for (const path of files) {
    if (!existsSync(path)) {
      console.error(`MISSING ${path}`);
      failed = true;
      continue;
    }
    const name = basename(path).toLowerCase();
    if (name.endsWith(".mp5p")) {
      const text = readFileSync(path, "utf8");
      const baseDir = sidecarDir ?? dirname(path);
      const report = assessMp5pCompatibility(text, {
        path,
        sidecarExists: (rel) => existsSync(join(baseDir, rel)),
      });
      const ok = report.profiles[profile] ?? report.profiles.package;
      console.log(
        ok ? `OK ${basename(path)} [${profile}]` : `FAIL ${basename(path)} [${profile}]`,
      );
      if (!ok) {
        failed = true;
        for (const e of report.validationErrors) console.error("  ", e);
        for (const m of report.missingSidecars) console.error("  missing sidecar:", m);
      }
      continue;
    }

    const buf = readFileSync(path);
    const parsed = parseMp5(buf);
    const report = assessMp5Compatibility(parsed, {
      path,
      fileSize: statSync(path).size,
    });
    const ok = report.profiles[profile];
    console.log(
      ok
        ? `OK ${basename(path)} [${profile}] level=${report.compatibilityLevel}`
        : `FAIL ${basename(path)} [${profile}] level=${report.compatibilityLevel}`,
    );
    if (!ok) {
      failed = true;
      for (const e of report.errors) console.error("  ", e);
      for (const w of report.warnings) console.error("  warn:", w);
    }
  }

  if (failed) {
    console.error("\nValidation failed. This tool checks structure only — not legal rights.");
    process.exit(1);
  }
  console.log("\nValidation passed (informational checks only — no rights verification).");
}

main();
