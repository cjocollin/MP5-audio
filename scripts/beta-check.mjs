#!/usr/bin/env node
/**
 * Pre-Beta / QA hardening gate — stricter than day-to-day dev.
 * Runs golden fixture validation, beta docs tests, full alpha:check, build, deploy:check.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(label, command, args) {
  console.log(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\nBeta check failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("MP5 Beta readiness check (v0.10.4-alpha gate)\n");

run("Container build", "pnpm", ["--filter", "@mp5/container", "build"]);
run("Golden fixture validation", "node", ["scripts/validate-golden-fixtures.mjs"]);
run("Beta readiness unit tests", "pnpm", [
  "exec",
  "vitest",
  "run",
  "tests/betaReadiness.test.ts",
  "tests/publicLanding.test.ts",
  "tests/specFreezeCompatibility.test.ts",
]);

const wasmPkg = join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
if (!existsSync(wasmPkg)) {
  console.log("\n(WASM pkg missing — alpha:check will run wasm:build via fixtures:generate)\n");
}

run("Alpha check (full gate)", "pnpm", ["alpha:check"]);
run("Production build", "pnpm", ["build"]);
run("Deploy dist check", "pnpm", ["deploy:check"]);

console.log("\n=== MP5 Beta check: all passed ===\n");
console.log("See docs/MP5_BETA_READINESS.md for manual sign-off items.\n");
