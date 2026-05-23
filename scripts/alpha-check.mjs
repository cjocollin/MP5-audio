#!/usr/bin/env node
/**
 * Full MP5 Alpha verification — run before a demo or release tag.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPkg = join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");

function run(label, command, args) {
  console.log(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\nFailed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

run("Container build", "pnpm", ["--filter", "@mp5/container", "build"]);
if (existsSync(wasmPkg)) {
  console.log("\n(WASM pkg present — skipping wasm:build for demo fixtures)\n");
  run("Demo fixtures", "node", ["scripts/generate-demo-fixtures.mjs"]);
  run("Demo album package", "node", ["scripts/generate-demo-album-package.mjs"]);
} else {
  run("Demo fixtures", "pnpm", ["fixtures:generate"]);
  run("Demo album package", "node", ["scripts/generate-demo-album-package.mjs"]);
}
run("Unit tests (vitest)", "pnpm", ["test"]);
run("Rust codec tests", "cargo", ["test", "-p", "mp5-codec", "--release"]);
run("Golden fixture validation", "node", ["scripts/validate-golden-fixtures.mjs"]);
run("Stem fixture validation", "node", ["scripts/validate-stem-fixture.mjs"]);
run("Playback regression gate", "pnpm", ["playback:check"]);
run("E2E (Playwright)", "pnpm", ["test:e2e"]);

console.log("\n=== MP5 Alpha check: all passed ===\n");
