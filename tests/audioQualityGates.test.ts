/**
 * MP5 Audio Quality Gates (milestone: MP5 Audio Quality / Codec Lab MVP).
 *
 * Drives the prebuilt codec WASM over the audio-lab synthetic fixtures and
 * locks in HONEST behavior:
 *   - MP5-L is bit-exact (samples + length) with no duration drift.
 *   - MP5-C is lossy and still hisses on quiet passages (documented, not hidden).
 *   - MP5-H + CORR is sample-exact content.
 *   - MP5-C vNext (lab prototype) takes silence/quiet to bit-exact and improves
 *     reverb-tail quiet-window SNR over current MP5-C.
 *   - No codec path crashes on any fixture.
 *   - Public default remains MP5-L.
 *
 * Requires `pnpm wasm:build` (the pkg is committed, so this normally just runs).
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
// @ts-expect-error — .mjs lab modules have no type declarations
import { loadCodec } from "../tools/audio-lab/wasm.mjs";
// @ts-expect-error
import { allFixtures } from "../tools/audio-lab/fixtures.mjs";
// @ts-expect-error
import { buildModes } from "../tools/audio-lab/codecs.mjs";
// @ts-expect-error
import { computeMetrics, nullTest } from "../tools/audio-lab/metrics.mjs";
import { CODEC_MODE_HELP, MP5_HONEST_LIMIT } from "../apps/web/src/lib/codecModesCopy";
import { codecExportOptionLabel } from "../apps/web/src/lib/codecDisplay";

type Fixture = { name: string; category: string; samples: Int16Array; channels: number; sampleRate: number };
type Mode = { id: string; label: string; encode: (s: Int16Array, ch: number) => Uint8Array; decode: (b: Uint8Array) => Int16Array };

const fixtures: Fixture[] = allFixtures();
let modes: Mode[] = [];

function fx(name: string): Fixture {
  const f = fixtures.find((f) => f.name === name);
  if (!f) throw new Error(`fixture not found: ${name}`);
  return f;
}
function mode(id: string): Mode {
  const m = modes.find((m) => m.id === id);
  if (!m) throw new Error(`mode not found: ${id}`);
  return m;
}
function roundtrip(m: Mode, f: Fixture) {
  const dec = m.decode(m.encode(f.samples, f.channels));
  return computeMetrics(f.samples, dec, f.channels, f.sampleRate);
}
/** quiet-window SNR as a finite number ("inf"/null → very large sentinel). */
function quietSnr(metrics: { quietWindowSnrDb: number | string | null }): number {
  const v = metrics.quietWindowSnrDb;
  if (v === "inf") return 999;
  if (v === null) return NaN;
  return v as number;
}

beforeAll(async () => {
  const codec = await loadCodec();
  modes = buildModes(codec);
});

afterEach(async () => {
  // Let Vitest 3 drain worker RPC acknowledgements between CPU-bound cases.
  await new Promise<void>((resolve) => setImmediate(resolve));
});

describe("MP5-L lossless gate", () => {
  const names = ["silence", "loud_sine", "white_noise", "kick_snare", "dense_music", "reverb_tail"];
  it.each(names)("is bit-exact and duration-stable on %s", (name) => {
    const m = roundtrip(mode("mp5l"), fx(name));
    expect(m.bitExact).toBe(true);
    expect(m.contentBitExact).toBe(true);
    expect(m.durationMatch).toBe(true);
    expect(m.clippingCount).toBeLessThanOrEqual(countSourceClips(fx(name)));
  });

  it("nulls to digital silence on silence", () => {
    const f = fx("silence");
    const nt = nullTest(f.samples, mode("mp5l").decode(mode("mp5l").encode(f.samples, f.channels)), f.channels, f.sampleRate);
    expect(nt.digitalSilence).toBe(true);
    expect(nt.maxDiff).toBe(0);
  });
});

describe("MP5-C honest status (lab-only, lossy)", () => {
  it("decodes silence to silence (no residual hiss in true silence)", () => {
    const m = roundtrip(mode("mp5c-high"), fx("silence"));
    expect(m.contentBitExact).toBe(true); // silent in, silent out
    expect(m.silenceResidualPeak ?? 0).toBe(0);
  });

  it("is lossy on tonal/music content (not bit-exact)", () => {
    expect(roundtrip(mode("mp5c-high"), fx("dense_music")).contentBitExact).toBe(false);
    expect(roundtrip(mode("mp5c-high"), fx("quiet_sine")).contentBitExact).toBe(false);
  });

  // EXPECTED-FAIL-STYLE GATE: documents that MP5-C still hisses on quiet passages.
  // A "clean" codec would score >40 dB here; MP5-C scores single digits. If this
  // ever rises above 25 dB the codec improved — update the gate and the docs.
  it("still hisses on reverb-tail quiet windows (documented limitation)", () => {
    const q = quietSnr(roundtrip(mode("mp5c-high"), fx("reverb_tail")));
    expect(Number.isFinite(q)).toBe(true);
    expect(q).toBeLessThan(25);
  });
});

describe("MP5-H + CORR", () => {
  it.each(["dense_music", "reverb_tail", "loud_sine"])("is sample-exact content on %s", (name) => {
    const m = roundtrip(mode("mp5h-high"), fx(name));
    expect(m.contentBitExact).toBe(true); // lossless restored when CORR present
  });
});

describe("MP5-C vNext prototype (lab-only, default OFF)", () => {
  it("takes silence and sustained-quiet to bit-exact", () => {
    expect(roundtrip(mode("mp5c2-lab"), fx("silence")).bitExact).toBe(true);
    expect(roundtrip(mode("mp5c2-lab"), fx("quiet_sine")).bitExact).toBe(true);
  });

  it("has zero duration drift (trims blocks)", () => {
    for (const name of ["loud_sine", "dense_music", "reverb_tail"]) {
      expect(roundtrip(mode("mp5c2-lab"), fx(name)).durationMatch).toBe(true);
    }
  });

  it("improves reverb-tail quiet-window SNR vs current MP5-C", () => {
    const c = quietSnr(roundtrip(mode("mp5c-high"), fx("reverb_tail")));
    const v = quietSnr(roundtrip(mode("mp5c2-lab"), fx("reverb_tail")));
    expect(v).toBeGreaterThan(c);
  });
});

describe("robustness: no codec path crashes on any fixture", () => {
  it.each(fixtures.map(({ name }) => name))(
    "encodes+decodes %s in every non-MDCT mode without throwing",
    (name) => {
      const fastModes = modes.filter(
        (m) => !String(m.id).startsWith("mp5c3-") && !String(m.id).includes("mdct"),
      );
      const f = fx(name);
      for (const m of fastModes) {
        expect(() => {
          const dec = m.decode(m.encode(f.samples, f.channels));
          expect(dec.length).toBeGreaterThan(0);
        }, `${m.id} on ${f.name}`).not.toThrow();
      }
    },
    240_000,
  );

  // Phase 3 measurement (isolated): encode_mp5c_vnext_mdct / encode_mp5c6 on
  // dense_music (6s / 264600 frames stereo) ≈ 50 ms WASM (~5e6 samples/s).
  // The old "O(N^2) — skip entirely" justification is stale. Full fixtures×MDCT
  // under a loaded vitest suite still risks the shared RPC budget, so MDCT/C6
  // loud-path modes are exercised on a representative subset here (not skipped).
  it(
    "MDCT/C6 modes encode+decode representative fixtures (measured ~50ms/dense_music)",
    () => {
      const mdctModes = modes.filter((m) => {
        const id = String(m.id);
        return (
          id.startsWith("mp5c3-") ||
          id.includes("mdct") ||
          id.includes("mp5c6") ||
          id === "mp5c-next"
        );
      });
      if (mdctModes.length === 0) return;
      const names = ["silence", "dense_music", "reverb_tail", "kick_snare"];
      for (const name of names) {
        const f = fx(name);
        for (const m of mdctModes) {
          expect(() => {
            const t0 = performance.now();
            const enc = m.encode(f.samples, f.channels);
            const t1 = performance.now();
            const dec = m.decode(enc);
            expect(dec.length).toBeGreaterThan(0);
            // Soft budget: 6s dense_music should stay well under 2s even under load.
            if (f.name === "dense_music") {
              expect(t1 - t0).toBeLessThan(2000);
            }
          }, `${m.id} on ${f.name}`).not.toThrow();
        }
      }
    },
    90_000,
  );
});

describe("public policy: MP5-L remains the recommended default", () => {
  it("copy still recommends MP5-L and disclaims MP5-C", () => {
    const l = CODEC_MODE_HELP.find((c) => c.id === "mp5l")!;
    const c = CODEC_MODE_HELP.find((c) => c.id === "mp5c")!;
    expect(l.tagline.toLowerCase()).toContain("recommended default");
    expect(`${c.tagline} ${c.detail}`.toLowerCase()).toMatch(/lab|experimental|hiss/);
    expect(codecExportOptionLabel("mp5l_v4").toLowerCase()).toContain("default");
    expect(MP5_HONEST_LIMIT.toLowerCase()).toContain("does not claim to beat");
  });
});

function countSourceClips(f: Fixture): number {
  let c = 0;
  for (let i = 0; i < f.samples.length; i++) if (Math.abs(f.samples[i]) >= 32767) c++;
  return c;
}
