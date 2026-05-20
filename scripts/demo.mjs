#!/usr/bin/env node
/**
 * Local MP5 demo launcher — checks setup, then starts the web app.
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmBg = join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
const wasmJs = join(root, "apps/web/src/wasm/pkg/mp5_codec.js");
const containerDist = join(root, "packages/mp5-container/dist/index.js");
const demoFixture = join(root, "test-fixtures/demo_mp5l_v3_tone.mp5");

function ok(path) {
  return existsSync(path);
}

console.log("\n  MP5 Alpha — local demo\n");

const steps = [];

if (!ok(join(root, "node_modules"))) {
  steps.push("pnpm install");
}
if (!ok(containerDist)) {
  steps.push("pnpm --filter @mp5/container build");
}
if (!ok(wasmBg) || !ok(wasmJs)) {
  steps.push("pnpm wasm:build");
}
if (!ok(demoFixture)) {
  steps.push("pnpm fixtures:generate");
}

if (steps.length > 0) {
  console.log("Setup incomplete. Run these commands first:\n");
  for (const s of steps) {
    console.log(`  ${s}`);
  }
  console.log("\nOr run the full gate:  pnpm alpha:check\n");
  if (steps.some((s) => s.includes("wasm"))) {
    console.log(
      "Without WASM: the app runs in PCM reference/debug mode only.\n" +
        "MP5-L, MP5-C, and MP5-H encode/decode require:  pnpm wasm:build\n",
    );
  }
} else {
  console.log("Setup OK — WASM codecs and demo fixtures found.\n");
  console.log("  Try: test-fixtures/demo_mp5l_v3_tone.mp5\n");
}

console.log("Starting dev server → http://localhost:5173\n");

const child = spawn("pnpm", ["dev"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
