#!/usr/bin/env node
/**
 * Validate PWA manifest inputs and optional production build output.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = join(root, "apps/web");
const publicIcons = join(webRoot, "public/icons");
const distManifest = join(webRoot, "dist/manifest.webmanifest");

const requiredIcons = ["mp5-192.png", "mp5-512.png", "mp5-icon.svg"];
const requiredManifestFields = [
  "name",
  "short_name",
  "start_url",
  "display",
  "theme_color",
  "background_color",
  "icons",
];

let failed = false;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failed = true;
}

console.log("\n=== PWA source check ===\n");

for (const file of requiredIcons) {
  const path = join(publicIcons, file);
  if (existsSync(path)) ok(`icon ${file}`);
  else fail(`missing ${path} — run: pnpm icons:generate`);
}

const viteConfig = readFileSync(join(webRoot, "vite.config.ts"), "utf8");
if (viteConfig.includes('name: "MP5 Player"')) ok('manifest name "MP5 Player"');
else fail("vite PWA manifest name not found");

if (viteConfig.includes('short_name: "MP5"')) ok('manifest short_name "MP5"');
else fail("vite PWA short_name not found");

if (viteConfig.includes('theme_color: "#0a0a0f"')) ok("theme_color #0a0a0f");
else fail("theme_color mismatch");

if (viteConfig.includes("navigateFallback")) ok("SPA navigateFallback configured");
else fail("navigateFallback not set in workbox");

console.log("\n=== PWA build output (optional) ===\n");

if (existsSync(distManifest)) {
  const manifest = JSON.parse(readFileSync(distManifest, "utf8"));
  const iconCount = manifest.icons?.length ?? 0;
  if (iconCount >= 2) {
    ok(`dist manifest.icons (${iconCount})`);
    const icon192 = manifest.icons?.find((i) => i.sizes === "192x192");
    if (icon192) ok("dist manifest includes 192x192 icon");
    else fail("dist manifest missing 192x192 icon");
    for (const field of requiredManifestFields.filter((f) => f !== "icons")) {
      if (manifest[field] != null) ok(`dist manifest.${field}`);
      else fail(`dist manifest missing: ${field}`);
    }
  } else {
    console.log(
      "  ⚠ dist manifest has no icons (stale build?) — run: pnpm icons:generate && pnpm build",
    );
  }
} else {
  console.log("  (skip) dist/manifest.webmanifest not found — run: pnpm build");
}

console.log("\n=== Offline honesty ===\n");
console.log(
  "  • App shell + bundled WASM/FFmpeg can cache after first successful load.",
);
console.log(
  "  • Full offline conversion is NOT guaranteed: first visit needs network (fonts, assets).",
);
console.log(
  "  • Install requires HTTPS (or localhost) and manifest icons (192 + 512).",
);

if (failed) {
  console.error("\nPWA check failed.\n");
  process.exit(1);
}
console.log("\nPWA check passed.\n");
