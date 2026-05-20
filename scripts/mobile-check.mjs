#!/usr/bin/env node
/**
 * Review Capacitor mobile packaging scaffold (no native build).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const capConfig = join(root, "capacitor.config.ts");
const iosDir = join(root, "ios");
const androidDir = join(root, "android");

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

console.log("\n=== Mobile (Capacitor) packaging review ===\n");

if (!existsSync(capConfig)) {
  fail("capacitor.config.ts missing");
} else {
  ok("capacitor.config.ts present");
  const text = readFileSync(capConfig, "utf8");
  if (text.includes('webDir: "apps/web/dist"')) ok("webDir → apps/web/dist");
  else warn('webDir should be "apps/web/dist" after web build');
  if (text.includes('appId: "com.mp5.player"')) ok('appId "com.mp5.player"');
}

if (existsSync(iosDir)) ok("ios/ platform folder present");
else warn("ios/ not generated — run: npx cap add ios (after pnpm build)");

if (existsSync(androidDir)) ok("android/ platform folder present");
else warn("android/ not generated — run: npx cap add android (after pnpm build)");

console.log("\n=== Readiness ===\n");
console.log("  Status: CONFIG ONLY — mobile is NOT production-ready.");
console.log("  Limitations on device:");
console.log("    • Large WASM + FFmpeg payloads — memory and load time");
console.log("    • File picker / downloads differ from desktop browsers");
console.log("    • Background audio and OS integrations not validated");
console.log("  Expected flow (when wired):");
console.log("    1. pnpm wasm:build && pnpm build");
console.log("    2. npx cap sync");
console.log("    3. Open Xcode / Android Studio for platform builds");

if (failed) {
  console.error("\nMobile check failed.\n");
  process.exit(1);
}
console.log("\nMobile check passed (scaffold review).\n");
