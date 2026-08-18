/**
 * Held-out corpus seal: tuning must not consume held-out without an explicit flag.
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
// @ts-expect-error
import {
  loadManifest,
  assertCorpusAccess,
  MANIFEST_PATH,
  TARGET_DEV,
  TARGET_HELD_OUT,
} from "../tools/audio-lab/corpus.mjs";
// @ts-expect-error
import { RATE_CONTROL_READY, matchedBitrateVerdict, mp5RateLabel } from "../tools/audio-lab/claimFlags.mjs";

describe("corpus held-out seal", () => {
  it("manifest exists and reports shortfall vs targets honestly", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const m = loadManifest();
    expect(m.manifestId).toBeTruthy();
    expect(m.counts.dev + m.counts.heldOut).toBe(m.counts.total);
    expect(m.shortfall.dev).toBe(Math.max(0, TARGET_DEV - m.counts.dev));
    expect(m.shortfall.heldOut).toBe(Math.max(0, TARGET_HELD_OUT - m.counts.heldOut));
    // Do not fabricate: shortfall is visible when under target.
    if (m.counts.dev < TARGET_DEV) {
      expect(m.shortfall.dev).toBeGreaterThan(0);
    }
  });

  it("blocks held-out without --allow-held-out", () => {
    const m = loadManifest();
    const held = m.tracks.filter((t: { role: string }) => t.role === "held-out");
    if (held.length === 0) {
      // Still assert the guard throws on a synthetic held-out entry.
      expect(() =>
        assertCorpusAccess([{ id: "synthetic_held", role: "held-out" }], {
          allowHeldOut: false,
        }),
      ).toThrow(/sealed|held-out/i);
      return;
    }
    expect(() =>
      assertCorpusAccess(held.slice(0, 1), { allowHeldOut: false }),
    ).toThrow(/sealed|held-out/i);
  });

  it("requires a recorded reason when allowing held-out", () => {
    expect(() =>
      assertCorpusAccess([{ id: "x", role: "held-out" }], {
        allowHeldOut: true,
        heldOutReason: "",
      }),
    ).toThrow(/held-out-reason/i);
  });

  it("allows held-out with flag + reason and returns a seal record", () => {
    const seal = assertCorpusAccess([{ id: "x", role: "held-out" }], {
      allowHeldOut: true,
      heldOutReason: "unit-test-rc-eval",
    });
    expect(seal.heldOutUsed).toBe(true);
    expect(seal.reason).toBe("unit-test-rc-eval");
    expect(seal.heldOutIds).toContain("x");
  });
});

describe("claim discipline flags", () => {
  it("has RATE_CONTROL_READY true since Phase 4.3 (rate control proven ±3%)", () => {
    expect(RATE_CONTROL_READY).toBe(true);
  });

  it("emits size-gate verdicts at matched rates, never quality verdicts", () => {
    expect(mp5RateLabel(192.4)).toMatch(/operating point ~/);
    const pass = matchedBitrateVerdict({
      mp5Kbps: 192,
      lameKbps: 192,
      metricDeltas: { sizeRatioMp5OverLame: 0.95 },
    });
    expect(pass.allowed).toBe(true);
    expect(pass.verdict).toBe("size-gate-pass");
    const fail = matchedBitrateVerdict({
      mp5Kbps: 192,
      lameKbps: 192,
      metricDeltas: { sizeRatioMp5OverLame: 1.25 },
    });
    expect(fail.verdict).toBe("size-gate-fail");
    // No figures -> no fabricated verdict.
    const pending = matchedBitrateVerdict({ mp5Kbps: 192, lameKbps: 192 });
    expect(pending.verdict).toBe("pending-size-figures");
  });
});
