#!/usr/bin/env node
/**
 * Compatibility pass: regenerate synthetic fixtures, run vitest compatibility suite, print summary.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", ...opts });
  return r.status ?? 1;
}

console.log("=== MP5 compatibility:check ===\n");

console.log("--- Build container (for fixtures) ---");
if (run("pnpm", ["--filter", "@mp5/container", "build"]) !== 0) process.exit(1);

const wasmPath = join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
if (!existsSync(wasmPath)) {
  console.log("--- WASM pkg missing; running wasm:build ---");
  if (run("pnpm", ["wasm:build"]) !== 0) {
    console.error("wasm:build failed — run pnpm wasm:build manually if Device Guard blocks it.");
    process.exit(1);
  }
} else {
  console.log("--- WASM pkg present; skipping wasm:build ---");
}

console.log("\n--- Generate compatibility fixtures ---");
if (run("node", ["scripts/generate-compatibility-fixtures.mjs"]) !== 0) process.exit(1);

const manifestPath = join(root, "test-fixtures/compatibility/manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  console.log("\n--- Fixture manifest ---");
  console.log(`WAV: ${manifest.wav?.length ?? 0} files`);
  const compressed = manifest.compressed?.filter((c) => c.file && c.ok) ?? [];
  const skipped = manifest.compressed?.filter((c) => c.note && !c.file) ?? [];
  console.log(`Compressed (ffmpeg): ${compressed.length} generated`);
  if (skipped.length) console.log(`Note: ${skipped[0]?.note ?? skipped[0]?.note}`);
  console.log(`MP5 edge-case fixtures: ${manifest.mp5?.length ?? 0}`);
}

console.log("\n--- Vitest compatibility suite ---");
const testStatus = run("pnpm", ["exec", "vitest", "run", "tests/compatibilityPass.test.ts"]);

if (testStatus !== 0) {
  console.error("\n=== compatibility:check FAILED ===\n");
  process.exit(1);
}

console.log("\n=== compatibility:check passed ===");
console.log("See docs/MP5_COMPATIBILITY_REPORT.md for full matrix and manual steps.\n");
