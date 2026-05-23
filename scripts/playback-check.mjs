#!/usr/bin/env node
/**
 * Focused playback regression gate — does not replace alpha:check.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pityFixture = join(root, "test-fixtures", "demo_pity_party_class.mp5");
const wasmPkg = join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");

function run(label, command, args) {
  console.log(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\nPlayback check failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("MP5 playback regression check\n");

if (!existsSync(pityFixture)) {
  if (!existsSync(wasmPkg)) {
    run("Container + WASM (fixture gen)", "pnpm", [
      "--filter",
      "@mp5/container",
      "build",
    ]);
    run("WASM build", "pnpm", ["wasm:build"]);
  } else {
    run("Container build", "pnpm", ["--filter", "@mp5/container", "build"]);
  }
  run("Pity Party class fixture", "node", [
    "scripts/generate-pity-party-class-fixture.mjs",
  ]);
}

run("Pity Party class fixture validation", "node", [
  "scripts/validate-pity-party-class-fixture.mjs",
]);

run("Playback timing unit tests", "pnpm", [
  "exec",
  "vitest",
  "run",
  "tests/stemPlayheadAnchor.test.ts",
  "tests/playbackClockGate.test.ts",
  "tests/playbackTimingMath.test.ts",
  "tests/playbackTransport.test.ts",
  "tests/stemMixerTransport.test.ts",
  "tests/karaokeRequestPlayback.test.ts",
  "tests/activePlaybackClock.test.ts",
]);

run("Playback regression e2e", "pnpm", [
  "exec",
  "playwright",
  "test",
  "e2e/playback-regression.spec.ts",
]);

console.log("\n=== MP5 playback check: all passed ===\n");
