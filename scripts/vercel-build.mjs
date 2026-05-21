#!/usr/bin/env node
/**
 * Vercel build: use committed WASM pkg when present; otherwise install Rust + wasm-pack (Linux CI).
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmBg = join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm");
const demoFixture = join(root, "test-fixtures/demo_mp5l_v3_tone.mp5");
const cargoBin = join(homedir(), ".cargo", "bin");

/** Keep ~/.cargo/bin on PATH across separate spawnSync calls (install vs wasm:build). */
function buildEnv() {
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const sep = process.platform === "win32" ? ";" : ":";
  const base = process.env[pathKey] ?? "";
  if (!existsSync(cargoBin)) return process.env;
  const prefix = `${cargoBin}${sep}`;
  if (base.startsWith(prefix) || base.includes(`${sep}${cargoBin}${sep}`)) {
    return process.env;
  }
  return { ...process.env, [pathKey]: `${prefix}${base}` };
}

function run(label, command, args) {
  console.log(`\n> ${label}\n`);
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: buildEnv(),
  });
  if (r.status !== 0) {
    console.error(`\nFailed: ${label} (exit ${r.status ?? 1})\n`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(wasmBg)) {
  console.log("WASM pkg missing — installing Rust + wasm-pack, then pnpm wasm:build…\n");
  // Single bash session: cargo env does not persist across separate spawnSync calls.
  run("wasm toolchain + build", "bash", [
    "-c",
    [
      "set -euo pipefail",
      'if ! command -v rustc >/dev/null 2>&1; then',
      "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y -q",
      "fi",
      'source "$HOME/.cargo/env"',
      'if ! command -v wasm-pack >/dev/null 2>&1; then',
      "  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh",
      "fi",
      "command -v wasm-pack",
      "rustup target add wasm32-unknown-unknown",
      "pnpm wasm:build",
      'test -f "apps/web/src/wasm/pkg/mp5_codec_bg.wasm"',
    ].join("\n"),
  ]);
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
