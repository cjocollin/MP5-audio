/**
 * MP5-C Hiss Audit + vNext Listening Lab gates (milestone v0.22.0-beta).
 *
 * Covers the new .mp5 comparison tooling and the vNext prototype exposure:
 *   - pipeline self-test (MP5-L container round-trip bit-exact)
 *   - compare-files / compare-set decode generated .mp5 and score vs reference
 *   - hiss rows carry quiet-window + Hiss Risk metrics
 *   - vNext High/Extreme modes exist but are NOT public converter options
 *   - generated listening + local reference outputs are git-ignored
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodecId, writeMp5 } from "@mp5/container";
// @ts-expect-error — .mjs lab modules have no type declarations
import { loadCodec } from "../tools/audio-lab/wasm.mjs";
// @ts-expect-error
import { buildModes, vnextFallbackStats, VNEXT_PARAMS } from "../tools/audio-lab/codecs.mjs";
// @ts-expect-error
import { selfTest } from "../tools/audio-lab/mp5file.mjs";
// @ts-expect-error
import { inspectFiles, compareFiles, buildHissRows } from "../tools/audio-lab/compare.mjs";
// @ts-expect-error
import { allFixtures } from "../tools/audio-lab/fixtures.mjs";
// @ts-expect-error
import { hissRisk, HISS_RISK_THRESHOLDS, hissMetrics, loudPathClearsHissGate } from "../tools/audio-lab/hiss.mjs";
import { codecExportOptionLabel } from "../apps/web/src/lib/codecDisplay";
import { CODEC_MODE_HELP } from "../apps/web/src/lib/codecModesCopy";

let codec: any;
let tmp: string;

function makeFixture(frames: number, ch: number): Int16Array {
  const s = new Int16Array(frames * ch);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin(i * 0.02) * 11000);
    for (let c = 0; c < ch; c++) s[i * ch + c] = c === 0 ? v : Math.round(v * 0.9);
  }
  return s;
}

function writeContainer(path: string, codecId: number, bitstream: Uint8Array, ch: number, frames: number) {
  const buf = writeMp5({
    head: {
      codecId: codecId as 0 | 1 | 2 | 3,
      channels: ch,
      bitsPerSample: 16,
      presetId: codecId === CodecId.MP5C ? 2 : 0,
      sampleRate: 44100,
      totalSamples: BigInt(frames),
      encoderVersion: 1,
    },
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: bitstream }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: [0.1, 0.2, 0.1],
    info: [{ key: "encoder", value: "audio-lab test" }],
  });
  writeFileSync(path, buf);
}

beforeAll(async () => {
  codec = await loadCodec();
  tmp = mkdtempSync(join(tmpdir(), "mp5lab-"));
});

describe("pipeline self-test (decode contract honesty)", () => {
  it("round-trips an MP5-L container bit-exact", () => {
    const r = selfTest(codec);
    expect(r.ok, r.reason).toBe(true);
  });
});

describe("vNext prototype exposure", () => {
  it("exposes vNext High + Extreme lab modes (never written to .mp5, default OFF)", () => {
    const ids = buildModes(codec).map((m: any) => m.id);
    expect(ids).toContain("mp5c2-lab");
    expect(ids).toContain("mp5c2-extreme");
    for (const m of buildModes(codec)) {
      if (m.id.startsWith("mp5c2")) expect(m.prototype).toBe(true);
    }
  });

  it("offers MP5-C2 as non-default converter option (not classic lab MP5-C)", () => {
    expect(codecExportOptionLabel("mp5l").toLowerCase()).toContain("default");
    expect(codecExportOptionLabel("mp5c2").toLowerCase()).toMatch(/mp5-c2|c2/);
    expect(codecExportOptionLabel("mp5c2").toLowerCase()).toContain("not default");
    expect(codecExportOptionLabel("mp5c").toLowerCase()).toMatch(/lab|experimental/);
    expect(CODEC_MODE_HELP.map((c) => c.id)).toContain("mp5c2");
    expect(CODEC_MODE_HELP.find((c) => c.id === "mp5l")!.tagline.toLowerCase()).toMatch(/default/);
  });
});

describe("compare-files / compare-set on generated .mp5", () => {
  it("scores MP5-C and vNext-as-file against an MP5-L reference", () => {
    const ch = 2;
    const frames = 4096 * 3;
    const fx = makeFixture(frames, ch);
    const refPath = join(tmp, "ref_mp5l.mp5");
    const candPath = join(tmp, "cand_mp5c.mp5");
    writeContainer(refPath, CodecId.MP5L, codec.encode_mp5l(fx, ch), ch, frames);
    writeContainer(candPath, CodecId.MP5C, codec.encode_mp5c(fx, ch, 2), ch, frames);

    const result = compareFiles(codec, refPath, [candPath]);
    expect(result.reference.codec).toMatch(/MP5-L/);
    expect(result.candidates).toHaveLength(1);
    const c = result.candidates[0];
    expect(c.error).toBeUndefined();
    expect(c.metrics).toBeTruthy();
    expect(typeof c.metrics.fullSnrDb === "number" || c.metrics.fullSnrDb === "inf").toBe(true);
    expect("quietWindowSnrDb" in c.metrics).toBe(true); // quiet-window metric present
    expect(["low", "medium", "high", "severe", "n/a"]).toContain(c.hissRisk);
  });

  it("compare-set handles multiple candidates", () => {
    const ch = 2;
    const frames = 4096 * 2;
    const fx = makeFixture(frames, ch);
    const refPath = join(tmp, "set_ref.mp5");
    const c1 = join(tmp, "set_high.mp5");
    const c2 = join(tmp, "set_extreme.mp5");
    writeContainer(refPath, CodecId.MP5L, codec.encode_mp5l(fx, ch), ch, frames);
    writeContainer(c1, CodecId.MP5C, codec.encode_mp5c(fx, ch, 2), ch, frames);
    writeContainer(c2, CodecId.MP5C, codec.encode_mp5c(fx, ch, 3), ch, frames);
    const result = compareFiles(codec, refPath, [c1, c2]);
    expect(result.candidates).toHaveLength(2);
    expect(result.thresholds).toEqual(HISS_RISK_THRESHOLDS);
  });

  it("inspect reports codec/preset structurally", () => {
    const ch = 2;
    const frames = 4096;
    const fx = makeFixture(frames, ch);
    const p = join(tmp, "insp_mp5c.mp5");
    writeContainer(p, CodecId.MP5C, codec.encode_mp5c(fx, ch, 2), ch, frames);
    const [entry] = inspectFiles(codec, [p]);
    expect(entry.codecName).toMatch(/MP5-C/);
    expect(entry.decodeOk).toBe(true);
    expect(entry.channels).toBe(ch);
  });
});

describe("hiss matrix rows", () => {
  it(
    "include quiet-window + tail SNR + Hiss Risk for reverb_tail",
    () => {
      const reverb = allFixtures().filter((f: any) => f.name === "reverb_tail");
      const modes = buildModes(codec).filter((m: any) =>
        ["mp5c-high", "mp5c2-lab", "mp5c2-extreme"].includes(m.id),
      );
      const rows = buildHissRows(reverb, modes);
      expect(rows.length).toBe(3);
      for (const r of rows) {
        expect("quietWindowSnrDb" in r).toBe(true);
        expect("tailSnrDb" in r).toBe(true);
        expect(["low", "medium", "high", "severe", "n/a"]).toContain(r.hissRisk);
      }
      // vNext should not be worse than current MP5-C on reverb-tail quiet SNR
      const cur = rows.find((r: any) => r.mode === "mp5c-high");
      const v = rows.find((r: any) => r.mode === "mp5c2-extreme");
      const q = (x: any) => (x === "inf" ? Infinity : typeof x === "number" ? x : -Infinity);
      expect(q(v.quietWindowSnrDb)).toBeGreaterThanOrEqual(q(cur.quietWindowSnrDb));
    },
    60_000,
  );
});

describe("vNext sub-block / per-band quiet detection (v0.23)", () => {
  function loudThenQuiet(): Int16Array {
    // One 8192-frame block: first half loud (≈0.5), second half quiet (≈0.001).
    const ch = 2, frames = 8192;
    const s = new Int16Array(frames * ch);
    for (let i = 0; i < frames; i++) {
      const amp = i < frames / 2 ? 0.5 : 0.001;
      const v = Math.round(Math.sin(i * 0.05) * amp * 32767);
      s[i * ch] = v;
      s[i * ch + 1] = v;
    }
    return s;
  }

  it("exposes the new sub-block / per-band modes", () => {
    const ids = buildModes(codec).map((m: any) => m.id);
    for (const id of ["mp5c2-subblock", "mp5c2-bandquiet", "mp5c2-bandquiet-extreme"]) {
      expect(ids).toContain(id);
    }
  });

  it("sub-block protects a quiet moment inside a loud block (block-level does not)", () => {
    const s = loudThenQuiet();
    const block = buildModes(codec).find((m: any) => m.id === "mp5c2-lab");
    const sub = buildModes(codec).find((m: any) => m.id === "mp5c2-subblock");
    const blockStats = vnextFallbackStats(block.encode(s, 2));
    const subStats = vnextFallbackStats(sub.encode(s, 2));
    expect(blockStats.protectedSamplePct).toBe(0); // whole 8192 block is loud → all lossy
    expect(subStats.protectedSamplePct).toBeGreaterThan(0); // quiet sub-blocks → lossless
    // decode stays duration-exact
    expect(sub.decode(sub.encode(s, 2)).length).toBe(s.length);
  });

  it("per-band escalation triggers on fragile HF tails (reverb_tail) — sub-block alone does not", () => {
    const reverb = allFixtures().find((f: any) => f.name === "reverb_tail");
    const sub = buildModes(codec).find((m: any) => m.id === "mp5c2-subblock");
    const band = buildModes(codec).find((m: any) => m.id === "mp5c2-bandquiet");
    const subStats = vnextFallbackStats(sub.encode(reverb.samples, reverb.channels));
    const bandStats = vnextFallbackStats(band.encode(reverb.samples, reverb.channels));
    expect(subStats.bandQuietSamplePct).toBe(0); // sub-block-only never uses the 'B' tag
    expect(bandStats.bandQuietSamplePct).toBeGreaterThan(0); // per-band escalation fired
    expect(bandStats.protectedSamplePct).toBeGreaterThan(subStats.protectedSamplePct);
  });

  it("hiss rows expose fallback usage (protected %) for vNext modes", () => {
    const reverb = allFixtures().filter((f: any) => f.name === "reverb_tail");
    const modes = buildModes(codec).filter((m: any) => ["mp5c-high", "mp5c2-bandquiet"].includes(m.id));
    const rows = buildHissRows(reverb, modes);
    const band = rows.find((r: any) => r.mode === "mp5c2-bandquiet");
    const cur = rows.find((r: any) => r.mode === "mp5c-high");
    expect(typeof band.protectedSamplePct).toBe("number");
    expect(band.protectedSamplePct).toBeGreaterThan(0);
    expect(cur.protectedSamplePct).toBeNull(); // not a vNext mode
  });

  it("does not regress reverb_tail quiet SNR below the previous vNext baseline", () => {
    const reverb = allFixtures().filter((f: any) => f.name === "reverb_tail");
    const modes = buildModes(codec).filter((m: any) =>
      ["mp5c2-extreme", "mp5c2-bandquiet-extreme"].includes(m.id),
    );
    const rows = buildHissRows(reverb, modes);
    const q = (x: any) => (x === "inf" ? Infinity : typeof x === "number" ? x : -Infinity);
    const prev = rows.find((r: any) => r.mode === "mp5c2-extreme");
    const next = rows.find((r: any) => r.mode === "mp5c2-bandquiet-extreme");
    expect(q(next.quietWindowSnrDb)).toBeGreaterThanOrEqual(q(prev.quietWindowSnrDb));
  });

  it("keeps silence/quiet bit-exact and never wastes fallback on loud material", () => {
    const band = buildModes(codec).find((m: any) => m.id === "mp5c2-bandquiet-extreme");
    const silence = allFixtures().find((f: any) => f.name === "silence");
    const dense = allFixtures().find((f: any) => f.name === "dense_music");
    expect(vnextFallbackStats(band.encode(silence.samples, silence.channels)).protectedSamplePct).toBe(100);
    expect(vnextFallbackStats(band.encode(dense.samples, dense.channels)).protectedSamplePct).toBe(0);
    expect(VNEXT_PARAMS.subBlockFrames).toBeLessThan(8192); // genuinely finer than a block
  });
});

describe("vNext hysteresis/lookahead + noise-shaping experiment (v0.24)", () => {
  const q = (x: any) => (x === "inf" ? Infinity : typeof x === "number" ? x : -Infinity);

  it("exposes smooth + shaped modes (lab-only, default OFF)", () => {
    const ids = buildModes(codec).map((m: any) => m.id);
    for (const id of ["mp5c2-smooth", "mp5c2-smooth-extreme", "mp5c2-shaped-extreme"]) {
      expect(ids).toContain(id);
    }
    for (const m of buildModes(codec)) if (m.id.startsWith("mp5c2")) expect(m.prototype).toBe(true);
  });

  it("hysteresis/lookahead takes reverb_tail quiet+tail bit-exact (JS smooth)", () => {
    const qLoc = (x: any) => (x === "inf" ? Infinity : typeof x === "number" ? x : -Infinity);
    const reverb = allFixtures().filter((f: any) => f.name === "reverb_tail");
    const modes = buildModes(codec).filter((m: any) =>
      ["mp5c2-bandquiet-extreme", "mp5c2-smooth-extreme"].includes(m.id),
    );
    const rows = buildHissRows(reverb, modes);
    const smooth = rows.find((r: any) => r.mode === "mp5c2-smooth-extreme");
    const prev = rows.find((r: any) => r.mode === "mp5c2-bandquiet-extreme");
    // Quiet/tail stay bit-exact. Overall hissRisk may be medium: mid/loud SNR now
    // counts and JS smooth still uses legacy TAG_LOSSY on loud material.
    expect(qLoc(smooth.quietWindowSnrDb)).toBe(Infinity);
    expect(qLoc(smooth.tailSnrDb)).toBe(Infinity);
    expect(["low", "medium"]).toContain(smooth.hissRisk);
    expect(qLoc(smooth.quietWindowSnrDb)).toBeGreaterThanOrEqual(qLoc(prev.quietWindowSnrDb));
    expect(smooth.protectedSamplePct).toBeGreaterThanOrEqual(prev.protectedSamplePct);
  });

  it("noise shaping round-trips, marks shaped sub-blocks, and is honestly NOT better than smooth", () => {
    // shaped sub-blocks appear on loud-but-not-hot material
    const reverb = allFixtures().find((f: any) => f.name === "reverb_tail");
    const shaped = buildModes(codec).find((m: any) => m.id === "mp5c2-shaped-extreme");
    const enc = shaped.encode(reverb.samples, reverb.channels);
    const stats = vnextFallbackStats(enc);
    expect(stats.shapedSamplePct).toBeGreaterThan(0); // 'S' tag used
    expect(shaped.decode(enc).length).toBe(reverb.samples.length); // duration-exact

    const rows = buildHissRows(
      reverb ? [reverb] : [],
      buildModes(codec).filter((m: any) => ["mp5c2-smooth-extreme", "mp5c2-shaped-extreme"].includes(m.id)),
    );
    const smooth = rows.find((r: any) => r.mode === "mp5c2-smooth-extreme");
    const sh = rows.find((r: any) => r.mode === "mp5c2-shaped-extreme");
    // honest negative result: shaping does not beat the lossless-fallback approach on tail SNR
    expect(q(sh.tailSnrDb)).toBeLessThanOrEqual(q(smooth.tailSnrDb));
  });

  it("Hiss Risk distinguishes 'all quiet windows clean' (low) from 'no quiet windows' (n/a)", () => {
    expect(hissRisk({ bitExact: false, quietWindowSnrDb: "inf", tailSnrDb: "inf", worstQuiet1sSnrDb: "inf" })).toBe("low");
    expect(hissRisk({ bitExact: false, quietWindowSnrDb: null, tailSnrDb: null, worstQuiet1sSnrDb: null })).toBe("n/a");
    expect(hissRisk({ bitExact: false, quietWindowSnrDb: "inf", tailSnrDb: 30, worstQuiet1sSnrDb: null })).toBe("medium");
  });
});

describe("native Rust vNext (encode_mp5c_vnext) — parity with JS, MP5-C untouched (v0.25)", () => {
  const q = (x: any) => (x === "inf" ? Infinity : typeof x === "number" ? x : -Infinity);
  const hasNative = () => buildModes(codec).some((m: any) => m.id === "mp5c2-native-extreme");

  it("exposes the native mode when the rebuilt WASM provides it", () => {
    // skip cleanly if the WASM predates the native export
    if (!hasNative()) return;
    const native = buildModes(codec).find((m: any) => m.id === "mp5c2-native-extreme");
    expect(native.native).toBe(true);
    expect(native.prototype).toBe(true);
  });

  it("keeps silence/quiet bit-exact; loud path uses TAG_SR (0x46) not legacy TAG_LOSSY", () => {
    if (!hasNative()) return;
    const native = buildModes(codec).find((m: any) => m.id === "mp5c2-native-extreme");
    for (const name of ["silence", "quiet_sine"]) {
      const f = allFixtures().find((x: any) => x.name === name);
      const enc = native.encode(f.samples, f.channels);
      const nd = native.decode(enc);
      expect(Array.from(nd)).toEqual(Array.from(f.samples));
    }
    const dense = allFixtures().find((x: any) => x.name === "dense_music");
    const enc = native.encode(dense.samples, dense.channels);
    expect(enc[0]).toBe(0x43);
    expect(enc[1]).toBe(0x34);
    // Loud units are TAG_SR ('F'=0x46) or TAG_LOSSLESS ('L'=0x4c) via min(); never legacy 'C'=0x43
    let sawF = false;
    let sawL = false;
    let sawLegacyC = false;
    let pos = 10;
    const view = new DataView(enc.buffer, enc.byteOffset, enc.byteLength);
    while (pos + 9 <= enc.length) {
      const tag = enc[pos];
      const len = view.getUint32(pos + 5, true);
      if (tag === 0x46) sawF = true;
      if (tag === 0x4c) sawL = true;
      if (tag === 0x43) sawLegacyC = true;
      pos += 9 + len;
    }
    expect(sawLegacyC).toBe(false);
    expect(sawF || sawL).toBe(true);
  });

  it("reaches reverb_tail hiss risk low and keeps silence/quiet bit-exact", () => {
    if (!hasNative()) return;
    const reverb = allFixtures().filter((f: any) => f.name === "reverb_tail");
    const native = buildModes(codec).filter((m: any) => m.id === "mp5c2-native-extreme");
    const rows = buildHissRows(reverb, native);
    expect(rows[0].hissRisk).toBe("low");
    const silence = allFixtures().find((f: any) => f.name === "silence");
    const n = native[0];
    const dec = n.decode(n.encode(silence.samples, silence.channels));
    expect(Array.from(dec)).toEqual(Array.from(silence.samples)); // bit-exact silence
  });

  it("native vNext stream is NOT a public MP5-C stream (does not change MP5-C)", () => {
    if (!hasNative()) return;
    const native = buildModes(codec).find((m: any) => m.id === "mp5c2-native-extreme");
    const f = allFixtures().find((x: any) => x.name === "reverb_tail");
    const enc = native.encode(f.samples, f.channels);
    expect(enc[0]).toBe(0x43);
    expect(enc[1]).toBe(0x34); // distinct magic; MP5-C is 0x43 0x06
    expect(() => codec.decode_mp5c(enc)).toThrow(); // MP5-C decoder rejects it
  });
});

describe("vNext loud-path High preferred for size (protect 1.5)", () => {
  it("keeps reverb_tail quiet/tail clean; High is smaller than Extreme on dense_music", () => {
    const modes = buildModes(codec).filter((m: any) =>
      ["mp5c2-smooth", "mp5c2-smooth-extreme"].includes(m.id),
    );
    expect(modes).toHaveLength(2);
    const reverb = allFixtures().filter((f: any) => f.name === "reverb_tail");
    const dense = allFixtures().find((f: any) => f.name === "dense_music");
    const rows = buildHissRows(reverb, modes);
    for (const r of rows) {
      expect(q(r.quietWindowSnrDb)).toBe(Infinity);
      expect(q(r.tailSnrDb)).toBe(Infinity);
    }
    const high = modes.find((m: any) => m.id === "mp5c2-smooth")!;
    const extreme = modes.find((m: any) => m.id === "mp5c2-smooth-extreme")!;
    const highBytes = high.encode(dense.samples, dense.channels).length;
    const extremeBytes = extreme.encode(dense.samples, dense.channels).length;
    expect(highBytes).toBeLessThan(extremeBytes);
    expect(highBytes / (dense.samples.length * 2)).toBeLessThan(0.96);
  });
});

function q(x: any) {
  return x === "inf" ? Infinity : typeof x === "number" ? x : -Infinity;
}

describe("Hiss Risk thresholds are committed and sane", () => {
  it("uses fixed dB cutoffs and rates bit-exact as low", () => {
    expect(HISS_RISK_THRESHOLDS).toEqual({ lowMinDb: 40, mediumMinDb: 25, highMinDb: 12 });
    expect(hissRisk({ bitExact: true, quietWindowSnrDb: 5 })).toBe("low");
    expect(hissRisk({ bitExact: false, quietWindowSnrDb: 5, tailSnrDb: 5, worstQuiet1sSnrDb: 5 })).toBe("severe");
    expect(hissRisk({ bitExact: false, quietWindowSnrDb: 45, tailSnrDb: 45, worstQuiet1sSnrDb: 45 })).toBe("low");
  });

  it("mid/loud SNR can pull risk below low even when quiet/tail are clean", () => {
    expect(
      hissRisk({
        bitExact: false,
        quietWindowSnrDb: "inf",
        tailSnrDb: "inf",
        worstQuiet1sSnrDb: "inf",
        worstLoudWindowSnrDb: 28,
      }),
    ).toBe("medium");
  });
});

describe("MP5-C2 loud-path metrics (ear-honest)", () => {
  it("legacy TAG_LOSSY loud path fails mid/loud gate; shipping SR path clears it", () => {
    if (typeof codec.encode_mp5c_vnext_legacy_loud !== "function") return;
    if (typeof codec.encode_mp5c_vnext !== "function") return;
    const dense = allFixtures().find((f: any) => f.name === "dense_music");
    const legacy = codec.encode_mp5c_vnext_legacy_loud(dense.samples, dense.channels, 2);
    const modern = codec.encode_mp5c_vnext(dense.samples, dense.channels, 2);
    const legDec = codec.decode_mp5c_vnext(legacy);
    const modDec = codec.decode_mp5c_vnext(modern);
    const legH = hissMetrics(dense.samples, legDec, dense.channels, dense.sampleRate);
    const modH = hissMetrics(dense.samples, modDec, dense.channels, dense.sampleRate);
    expect(loudPathClearsHissGate(legH)).toBe(false);
    expect(loudPathClearsHissGate(modH)).toBe(true);
    expect(
      hissRisk({
        quietWindowSnrDb: null,
        tailSnrDb: legH.tailSnrDb,
        worstQuiet1sSnrDb: legH.worstQuiet1sSnrDb,
        worstLoudWindowSnrDb: legH.worstLoudWindowSnrDb,
        bitExact: false,
      }),
    ).not.toBe("low");
    expect(
      hissRisk({
        quietWindowSnrDb: null,
        tailSnrDb: modH.tailSnrDb,
        worstQuiet1sSnrDb: modH.worstQuiet1sSnrDb,
        worstLoudWindowSnrDb: modH.worstLoudWindowSnrDb,
        bitExact: false,
      }),
    ).toBe("low");
  });
});

describe("git-ignore safety", () => {
  it("ignores generated reports, listening dirs, and local reference outputs", () => {
    const gi = readFileSync("benchmarks/audio-quality/.gitignore", "utf8");
    for (const p of ["listening/", "local-listening/", "local/", "MP5C_HISS_REPORT.md", "compare-report.md", "*.wav"]) {
      expect(gi, `benchmarks gitignore should contain ${p}`).toContain(p);
    }
    const labGi = readFileSync("tools/audio-lab/.gitignore", "utf8");
    expect(labGi).toContain("lab.config.json");
  });
});

// best-effort temp cleanup
import { afterAll } from "vitest";
afterAll(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
});
