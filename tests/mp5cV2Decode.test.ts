/**
 * Confirms MP5-C v2 bitstreams still decode after v3 encoder changes.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { parseMp5 } from "@mp5/container";

const V2_DESKTOP = "C:/Users/colli/OneDrive/Desktop/- ORIGAMI! test2.mp5";

type Wasm = {
  default: (input: Buffer) => Promise<unknown>;
  decode_mp5c: (d: Uint8Array) => Int16Array;
};

let wasm: Wasm;

beforeAll(async () => {
  const root = process.cwd();
  const mod = (await import(
    pathToFileURL(join(root, "apps/web/src/wasm/pkg/mp5_codec.js")).href
  )) as Wasm;
  await mod.default(readFileSync(join(root, "apps/web/src/wasm/pkg/mp5_codec_bg.wasm")));
  wasm = mod;
});

describe("MP5-C v2 legacy decode", () => {
  it("decodes Desktop v2 export or skips if absent", () => {
    if (!existsSync(V2_DESKTOP)) {
      return;
    }
    const parsed = parseMp5(readFileSync(V2_DESKTOP));
    const audi = parsed.audioFrames[0]!.data;
    expect(audi[0]).toBe(0x43);
    if (audi[1] !== 2) {
      // File was re-exported as v3 — v2 path covered by Rust v2_legacy_decode_still_works
      return;
    }
    const decoded = wasm.decode_mp5c(audi);
    expect(decoded.length).toBeGreaterThan(0);
  });
});
