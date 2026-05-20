#!/usr/bin/env node
/**
 * Audit repo + dist for deploy safety: no copyrighted audio, no local paths.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "apps/web/dist");

const BLOCKED_AUDIO_EXT = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".m4a",
  ".ogg",
  ".aac",
  ".wma",
]);
const ALLOWED_MP5_IN_DIST = new Set(["demo_mp5l_v3_tone.mp5"]);

const LOCAL_PATH_PATTERNS = [
  /C:\\Users\\/i,
  /OneDrive/i,
  /file:\/\//i,
  /localhost:5173/i,
];

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

const SKIP_DIRS = new Set([
  "node_modules",
  "target",
  ".git",
  "dist",
  "apps/web/dist",
  ".vercel",
]);

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      const rel = p.replace(root, "").replace(/\\/g, "/");
      if (rel.includes("/benchmarks/real-music/exports")) continue;
      walk(p, files);
    } else files.push(p);
  }
  return files;
}

console.log("\n=== Deploy content audit ===\n");

const repoAudio = walk(root).filter((p) => {
  const ext = extname(p).toLowerCase();
  if (!BLOCKED_AUDIO_EXT.has(ext)) return false;
  // Synthetic compatibility WAV fixtures (generated, not deployed).
  const norm = p.replace(/\\/g, "/");
  if (norm.includes("test-fixtures/compatibility/") && ext === ".wav") return false;
  return true;
});
if (repoAudio.length === 0) ok("no copyrighted source audio in repo (synthetic compatibility WAV OK)");
else {
  fail(`blocked source audio in repo: ${repoAudio.slice(0, 5).join(", ")}`);
}

const repoMp5OutsideFixtures = walk(root).filter(
  (p) =>
    p.endsWith(".mp5") &&
    !p.includes("test-fixtures") &&
    !p.includes("benchmarks"),
);
if (repoMp5OutsideFixtures.length === 0) ok("no stray .mp5 outside test-fixtures/ and benchmarks/");
else warn(`${repoMp5OutsideFixtures.length} local .mp5 under benchmarks/ (not deployed)`);

const mp5InRepo = walk(join(root, "test-fixtures")).filter((p) => p.endsWith(".mp5"));
if (mp5InRepo.length === 0) {
  warn("no .mp5 in test-fixtures/ (generate with pnpm fixtures:generate before build)");
} else {
  ok(`test-fixtures: ${mp5InRepo.length} synthetic .mp5 file(s)`);
}

if (!existsSync(dist)) {
  fail("apps/web/dist missing — run pnpm build");
} else {
  const distFiles = walk(dist);
  const distAudio = distFiles.filter((p) => {
    const ext = extname(p).toLowerCase();
    if (ext === ".mp5") {
      const base = p.split(/[/\\]/).pop();
      return !ALLOWED_MP5_IN_DIST.has(base);
    }
    return BLOCKED_AUDIO_EXT.has(ext);
  });
  if (distAudio.length === 0) ok("dist contains no unexpected audio (only allowed demo .mp5 if present)");
  else fail(`unexpected audio in dist: ${distAudio.join(", ")}`);

  const textBundle = distFiles
    .filter((p) => /\.(js|html|css|json)$/.test(p))
    .map((p) => readFileSync(p, "utf8"))
    .join("\n");
  for (const pat of LOCAL_PATH_PATTERNS) {
    if (pat.test(textBundle)) fail(`dist references local-only path matching ${pat}`);
  }
  if (!failed) ok("dist bundles have no Windows/localhost hardcoded paths");
}

const srcFiles = walk(join(root, "apps/web/src")).filter((p) =>
  /\.(ts|tsx)$/.test(p),
);
const srcText = srcFiles.map((p) => readFileSync(p, "utf8")).join("\n");
if (/C:\\Users\\/i.test(srcText)) fail("apps/web/src contains Windows user path");
else ok("apps/web/src has no C:\\Users\\ paths");

if (/benchmarks\/real-music\/ORIGAMI/.test(srcText)) {
  warn("e2e/tests may reference local ORIGAMI paths — not shipped in dist");
} else ok("no ORIGAMI paths in web src");

console.log("\n=== Summary ===\n");
console.log("  Hosted deploy ships: static dist only — no env vars, no server secrets.");
console.log("  Demo audio: synthetic 440 Hz tone (demo_mp5l_v3_tone.mp5) when bundled at build.");

if (failed) {
  console.error("\nDeploy content audit failed.\n");
  process.exit(1);
}
console.log(warned ? "\nDeploy content audit passed with warnings.\n" : "\nDeploy content audit passed.\n");
