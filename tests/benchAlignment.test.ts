/**
 * Encoder/decoder delay alignment proofs for the LAME-matched harness.
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — .mjs lab modules have no type declarations
import { findBestLag, alignDecoded } from "../tools/audio-lab/align.mjs";

function tone(frames: number, channels: number, freq = 440, sr = 44100): Int16Array {
  const out = new Int16Array(frames * channels);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * 12000);
    for (let c = 0; c < channels; c++) out[i * channels + c] = v;
  }
  return out;
}

describe("PCM delay alignment", () => {
  it("null comparison of a signal against itself finds lag 0", () => {
    const ref = tone(8000, 2);
    const { lagFrames, correlation } = findBestLag(ref, ref, 2, 512);
    expect(lagFrames).toBe(0);
    expect(correlation).toBeGreaterThan(0.99);
  });

  it("recovers a known positive lag (candidate delayed)", () => {
    const ref = tone(12000, 2);
    const lag = 317;
    const cand = new Int16Array(ref.length + lag * 2);
    cand.set(ref, lag * 2);
    const { lagFrames, correlation } = findBestLag(ref, cand, 2, 576);
    expect(lagFrames).toBe(lag);
    expect(correlation).toBeGreaterThan(0.99);
  });

  it("alignDecoded yields equal-length overlap after lag correction", () => {
    const ref = tone(10000, 2);
    const lag = 200;
    const cand = new Int16Array(ref.length + lag * 2);
    cand.set(ref, lag * 2);
    const aligned = alignDecoded(ref, cand, 2, 576);
    expect(aligned.lagFrames).toBe(lag);
    expect(aligned.reference.length).toBe(aligned.candidate.length);
    expect(aligned.frames).toBeGreaterThan(1000);
    let mismatches = 0;
    for (let i = 0; i < aligned.reference.length; i++) {
      if (aligned.reference[i] !== aligned.candidate[i]) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});