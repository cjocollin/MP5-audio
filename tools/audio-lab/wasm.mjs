// MP5 Audio Quality Lab — WASM codec loader.
// Loads the prebuilt MP5 codec (apps/web/src/wasm/pkg). No telemetry, no network.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const pkgDir = join(repoRoot, "apps", "web", "src", "wasm", "pkg");

let wasm = null;

/**
 * Load the MP5 codec WASM module. Returns the codec namespace exposing
 * encode_/decode_ for mp5l/mp5c/mp5h plus snr_db_wasm.
 * Throws a clear error if the WASM has not been built yet.
 */
export async function loadCodec() {
  if (wasm) return wasm;
  const wasmBin = join(pkgDir, "mp5_codec_bg.wasm");
  const wasmJs = join(pkgDir, "mp5_codec.js");
  if (!existsSync(wasmBin) || !existsSync(wasmJs)) {
    throw new Error(
      `MP5 codec WASM not found in ${pkgDir}. Run \`pnpm wasm:build\` first.`,
    );
  }
  const mod = await import(pathToImport(wasmJs));
  await mod.default(readFileSync(wasmBin));
  wasm = mod;
  return wasm;
}

function pathToImport(p) {
  // Dynamic import on Windows needs a file:// URL.
  return new URL(`file://${p.replace(/\\/g, "/")}`).href;
}

export const REPO_ROOT = repoRoot;
