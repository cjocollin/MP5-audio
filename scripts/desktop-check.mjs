#!/usr/bin/env node
/**
 * Review Tauri desktop packaging scaffold (no full native build).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "src-tauri");
const tauriConf = join(tauriDir, "tauri.conf.json");
const tauriCargo = join(tauriDir, "Cargo.toml");

let failed = false;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function warn(msg) {
  console.log(`  ⚠ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failed = true;
}

console.log("\n=== Desktop (Tauri) packaging review ===\n");

if (!existsSync(tauriConf)) {
  fail("src-tauri/tauri.conf.json missing");
} else {
  ok("tauri.conf.json present");
  const conf = JSON.parse(readFileSync(tauriConf, "utf8"));
  if (conf.build?.frontendDist?.includes("apps/web/dist")) {
    ok(`frontendDist → ${conf.build.frontendDist}`);
  } else {
    warn("frontendDist may not point at apps/web/dist");
  }
  const assoc = conf.bundle?.fileAssociations?.find((a) => a.ext?.includes("mp5"));
  if (assoc) {
    ok(`.mp5 file association scaffolded (${assoc.description ?? "MP5 Audio"})`);
  } else {
    fail(".mp5 file association not configured in tauri.conf.json");
  }
}

if (existsSync(tauriCargo)) {
  ok("src-tauri/Cargo.toml present (native project started)");
} else {
  warn("src-tauri/Cargo.toml missing — run `tauri init` / CLI scaffold before `tauri build`");
}

console.log("\n=== Readiness ===\n");
console.log("  Status: SCAFFOLD ONLY — not a production desktop app yet.");
console.log("  Web build is the primary Alpha target: pnpm build → apps/web/dist");
console.log("  Expected desktop flow (when wired):");
console.log("    1. pnpm wasm:build && pnpm build");
console.log("    2. tauri build   (requires Rust + Tauri CLI + src-tauri project)");
console.log("  Native FFmpeg in Tauri is NOT configured (decodeSourceToPcm throws).");

if (failed) {
  console.error("\nDesktop check failed.\n");
  process.exit(1);
}
console.log("\nDesktop check passed (scaffold review).\n");
