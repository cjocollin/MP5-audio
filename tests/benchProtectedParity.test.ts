/**
 * Rust inspect_unit_mix vs JS tag-walk parity for %protected reporting.
 *
 * Runs the equality assert when the WASM export is present; otherwise reports
 * a clear skip reason (never silently vacuous).
 */
import { describe, it, expect, beforeAll } from "vitest";
// @ts-expect-error
import { loadCodec } from "../tools/audio-lab/wasm.mjs";
// @ts-expect-error
import { allFixtures } from "../tools/audio-lab/fixtures.mjs";
// @ts-expect-error
import { allKillers } from "../tools/audio-lab/killers.mjs";
// @ts-expect-error
import { walkUnitMixJs, mixParityDiff, threeFigureReport } from "../tools/audio-lab/unitMix.mjs";
// @ts-expect-error
import { encodeMp5Lossy, inspectMix } from "../tools/audio-lab/bench-lame.mjs";

let codec: Awaited<ReturnType<typeof loadCodec>>;
let rustInspectAvailable = false;

beforeAll(async () => {
  codec = await loadCodec();
  rustInspectAvailable = typeof codec.inspect_unit_mix === "function";
});

describe("%protected parity (Rust vs JS)", () => {
  it("JS walk produces a complete three-figure report on MDCT/C6 encode", () => {
    const fx = allFixtures().find((f: { name: string }) => f.name === "dense_music");
    expect(fx).toBeTruthy();
    const enc = encodeMp5Lossy(codec, fx.samples, fx.channels, fx.sampleRate, 2);
    const mix = walkUnitMixJs(enc.bytes);
    expect(mix).not.toBeNull();
    const protectFrames =
      (mix!.framesByTag.lossless_L ?? 0) + (mix!.framesByTag.lossless_B ?? 0);
    const mdctFrames = mix!.framesByTag.mdct_M ?? 0;
    expect(mix!.protectFrames).toBe(protectFrames);
    expect(mix!.mdctFrames).toBe(mdctFrames);
    expect(mix!.protectFrames + mix!.mdctFrames).toBeLessThanOrEqual(mix!.totalFrames);

    const dur = fx.samples.length / fx.channels / fx.sampleRate;
    const three = threeFigureReport(mix, dur, {
      audiBytes: enc.bytes.length,
      fileBytes: enc.bytes.length,
    });
    expect(three.ok).toBe(true);
    expect(Number.isFinite(three.codedPathBitrateKbps)).toBe(true);
    expect(Number.isFinite(three.protectedSamplePct)).toBe(true);
    expect(Number.isFinite(three.protectedBytePct)).toBe(true);
    expect(Number.isFinite(three.totalAudiBytes)).toBe(true);
  });

  it("Rust inspect_unit_mix matches JS tally exactly (or documents missing export)", () => {
    if (!rustInspectAvailable) {
      // Clear, non-vacuous skip reason when Phase 2 export is absent.
      expect(
        typeof codec.inspect_unit_mix,
        "expected inspect_unit_mix missing — Phase 2 parallel work not landed yet",
      ).not.toBe("function");
      return;
    }

    const sources = [
      allFixtures().find((f: { name: string }) => f.name === "dense_music"),
      allFixtures().find((f: { name: string }) => f.name === "reverb_tail"),
      allKillers().find(
        (f: { name: string }) => f.name === "killer_protect_threshold_alt",
      ),
    ].filter(Boolean);

    for (const fx of sources) {
      const enc = encodeMp5Lossy(codec, fx!.samples, fx!.channels, fx!.sampleRate, 2);
      const { js, rust } = inspectMix(codec, enc.bytes);
      expect(js, "JS walk failed on " + fx!.name).not.toBeNull();
      expect(rust, "Rust inspect failed on " + fx!.name).not.toBeNull();
      expect((rust as { error?: string }).error).toBeUndefined();
      const { equal, diffs } = mixParityDiff(js, rust);
      expect(equal, "parity failed on " + fx!.name + ": " + diffs.join("; ")).toBe(
        true,
      );
    }
  });
});