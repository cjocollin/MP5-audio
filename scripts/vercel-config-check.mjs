#!/usr/bin/env node
/**
 * Validate vercel.json for mp5-audio Git-connected deployment.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vercelPath = join(root, "vercel.json");
const buildScript = join(root, "scripts/vercel-build.mjs");

let failed = false;
function ok(m) {
  console.log(`  ✓ ${m}`);
}
function fail(m) {
  console.error(`  ✗ ${m}`);
  failed = true;
}

console.log("\n=== Vercel config (mp5-audio) ===\n");

if (!existsSync(vercelPath)) fail("vercel.json missing");
else {
  const v = JSON.parse(readFileSync(vercelPath, "utf8"));
  if (v.outputDirectory === "apps/web/dist") ok("outputDirectory → apps/web/dist");
  else fail(`outputDirectory: ${v.outputDirectory}`);
  if (v.buildCommand === "node scripts/vercel-build.mjs") ok("buildCommand → vercel-build.mjs");
  else fail(`buildCommand: ${v.buildCommand}`);
  if (v.installCommand?.includes("pnpm")) ok("installCommand uses pnpm");
  else fail("installCommand should use pnpm install");
}

if (existsSync(buildScript)) {
  const src = readFileSync(buildScript, "utf8");
  if (src.includes("rustup.rs")) ok("vercel-build installs Rust on fresh clone");
  if (src.includes("wasm-pack")) ok("vercel-build installs wasm-pack");
  if (src.includes('["--filter", "@mp5/web", "build"]')) ok("vercel-build outputs web dist");
  if (!/C:\\\\Users/i.test(src)) ok("vercel-build has no Windows user paths");
} else fail("scripts/vercel-build.mjs missing");

const setup = readFileSync(join(root, "docs/MP5_VERCEL_SETUP.md"), "utf8");
if (setup.includes("mp5-audio")) ok("MP5_VERCEL_SETUP.md references mp5-audio");
else fail("setup doc missing mp5-audio");
if (setup.includes("mp5-alpha-demo") && setup.includes("Do not use")) ok("setup doc warns against mp5-alpha-demo");
if (setup.includes("dist-livid-two-82")) ok("setup doc marks dist-livid as temporary");

console.log("\n  Dashboard: project name mp5-audio → https://mp5-audio.vercel.app\n");

if (failed) process.exit(1);
console.log("Vercel config check passed.\n");
