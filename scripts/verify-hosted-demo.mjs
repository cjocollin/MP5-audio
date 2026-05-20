#!/usr/bin/env node
/**
 * Validate MP5 Alpha hosted HTTPS demo (static checks).
 * Usage: MP5_HOSTED_URL=https://your-app.vercel.app node scripts/verify-hosted-demo.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const url = process.env.MP5_HOSTED_URL ?? process.env.MP5_PREVIEW_URL;
if (!url) {
  console.error("Set MP5_HOSTED_URL to the deployed HTTPS origin.\n");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync("node", ["scripts/verify-prod-preview.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, MP5_PREVIEW_URL: url.replace(/\/$/, "") },
});
process.exit(r.status ?? 1);
