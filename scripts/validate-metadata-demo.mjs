#!/usr/bin/env node
/** Runs programmatic metadata demo validation (vitest). */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync("pnpm", ["vitest", "run", "tests/metadataDemoValidation.test.ts"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
