#!/usr/bin/env node
/**
 * Validate production dist for web demo deployment.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "apps/web/dist");
const assetsDir = join(dist, "assets");

let failed = false;
let warned = false;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function warn(msg) {
  console.log(`  ⚠ ${msg}`);
  warned = true;
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failed = true;
}

function requirePath(rel, label) {
  const p = join(dist, rel);
  if (existsSync(p)) ok(`${label}: ${rel}`);
  else fail(`missing ${label}: ${rel}`);
}

console.log("\n=== MP5 deployment dist check ===\n");

if (!existsSync(dist)) {
  fail("apps/web/dist not found — run: pnpm build");
  process.exit(1);
}

requirePath("index.html", "entry HTML");
requirePath("manifest.webmanifest", "PWA manifest");
requirePath("sw.js", "service worker");
requirePath("icons/mp5-192.png", "PWA icon");
requirePath("icons/mp5-512.png", "PWA icon");

const demoFixture = join(dist, "fixtures/demo_mp5l_v3_tone.mp5");
if (existsSync(demoFixture)) {
  ok(`demo fixture bundled (${statSync(demoFixture).size} bytes)`);
} else {
  warn("dist/fixtures/demo_mp5l_v3_tone.mp5 missing — run pnpm fixtures:generate && pnpm build");
}

if (!existsSync(assetsDir)) {
  fail("dist/assets/ missing");
} else {
  const assets = readdirSync(assetsDir);
  const mp5Wasm = assets.find((f) => f.includes("mp5_codec") && f.endsWith(".wasm"));
  const ffmpegWasm = assets.find((f) => f.includes("ffmpeg-core") && f.endsWith(".wasm"));
  const ffmpegJs = assets.find((f) => f.includes("ffmpeg-core") && f.endsWith(".js"));

  if (mp5Wasm) ok(`MP5 codec WASM: assets/${mp5Wasm}`);
  else fail("MP5 codec WASM not found in dist/assets");

  if (ffmpegWasm) ok(`FFmpeg WASM: assets/${ffmpegWasm}`);
  else fail("FFmpeg WASM not found in dist/assets");

  if (ffmpegJs) ok(`FFmpeg core JS: assets/${ffmpegJs}`);
  else fail("FFmpeg core JS not found in dist/assets");
}

const html = readFileSync(join(dist, "index.html"), "utf8");
if (html.includes('type="module"')) ok("index.html loads ES module bundle");
else warn("index.html may not reference Vite bundle");

const manifest = JSON.parse(readFileSync(join(dist, "manifest.webmanifest"), "utf8"));
if (manifest.icons?.length >= 2) ok(`PWA manifest icons (${manifest.icons.length})`);
else fail("PWA manifest missing install icons");

console.log("\n=== Deployment notes ===\n");
console.log("  • First load is large (~30+ MB with FFmpeg WASM precache).");
console.log("  • HTTPS required for PWA install on public hosts.");
console.log("  • Repo ships synthetic demo tones only — no copyrighted music.");

if (failed) {
  console.error("\nDeployment check failed.\n");
  process.exit(1);
}
console.log(warned ? "\nDeployment check passed with warnings.\n" : "\nDeployment check passed.\n");
