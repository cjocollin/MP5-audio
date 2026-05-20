#!/usr/bin/env node
/**
 * Vercel build: use committed WASM pkg when present; otherwise install wasm-pack (Linux CI).
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmBg = join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
const demoFixture = join(root, "test-fixtures/demo_mp5l_v3_tone.mp5");

function run(label, command, args) {
  console.log(`\n> ${label}\n`);
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`\nFailed: ${label}\n`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(wasmBg)) {
  console.log("WASM pkg missing — installing wasm-pack on builder…\n");
  run("wasm-pack installer", "bash", [
    "-c",
    'curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh && source "$HOME/.cargo/env" && rustup target add wasm32-unknown-unknown 2>/dev/null || true',
  ]);
  run("wasm:build", "pnpm", ["wasm:build"]);
} else {
  console.log("(WASM pkg present — skipping wasm:build)\n");
}

run("container build", "pnpm", ["--filter", "@mp5/container", "build"]);

if (!existsSync(demoFixture)) {
  run("demo fixtures", "node", ["scripts/generate-demo-fixtures.mjs"]);
} else {
  console.log("(demo fixture present — skipping fixtures:generate)\n");
}

run("icons", "node", ["scripts/generate-pwa-icons.mjs"]);
run("web build", "pnpm", ["--filter", "@mp5/web", "build"]);
