#!/usr/bin/env node
/**
 * Sync root package.json version → apps/web/src/generated/appVersion.ts
 * and apps/web/package.json. Run before dev/build if Vite is not invoked.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = rootPkg.version;

const outFile = join(root, "apps/web/src/generated/appVersion.ts");
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  `/** Auto-generated from root package.json — do not edit */\nexport const APP_VERSION = ${JSON.stringify(version)};\n`,
);

const webPkgPath = join(root, "apps/web/package.json");
const webPkg = JSON.parse(readFileSync(webPkgPath, "utf8"));
if (webPkg.version !== version) {
  webPkg.version = version;
  writeFileSync(webPkgPath, `${JSON.stringify(webPkg, null, 2)}\n`);
}

console.log(`App version synced: ${version}`);
