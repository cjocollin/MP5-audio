#!/usr/bin/env node
/**
 * Production demo — build if needed, serve apps/web/dist, print smoke-test hint.
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distIndex = join(root, "apps/web/dist/index.html");
const wasmBg = join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
const demoFixture = join(root, "test-fixtures/demo_mp5l_v3_tone.mp5");

const PREVIEW_HOST = "127.0.0.1";
const PREVIEW_PORT = "4173";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

console.log("\n  MP5 Alpha — production preview\n");

const setup = [];
if (!existsSync(wasmBg)) setup.push("pnpm wasm:build");
if (!existsSync(demoFixture)) setup.push("pnpm fixtures:generate");

if (setup.length) {
  console.log("Running setup:\n");
  for (const s of setup) {
    console.log(`  ${s}\n`);
    const [cmd, ...args] = s.split(" ");
    await run(cmd, args);
  }
}

if (!existsSync(distIndex)) {
  console.log("Building production bundle…\n");
  await run("pnpm", ["build"]);
} else {
  console.log("Using existing dist/ (run pnpm build to refresh).\n");
}

console.log(`Starting preview → http://${PREVIEW_HOST}:${PREVIEW_PORT}\n`);
console.log("In another terminal:  node scripts/verify-prod-preview.mjs\n");
console.log("Manual checks: Player, Converter, Load MP5-L demo, PWA install (localhost OK).\n");

const child = spawn(
  "pnpm",
  ["--filter", "@mp5/web", "preview", "--", "--host", PREVIEW_HOST, "--port", PREVIEW_PORT],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);

child.on("exit", (code) => process.exit(code ?? 0));
