import { describe, it, expect } from "vitest";
import {
  analyzeStemAlignment,
  alignStemDuration,
  normalizeStemToMix,
  padMixToDuration,
  resampleInterleavedPcm,
  STEM_SMALL_MISMATCH_SEC,
} from "../apps/web/src/converter/stemNormalize";
import {
  stemsAreAlignedToMix,
  validateStemsForExport,
  type PendingStemPcm,
} from "../apps/web/src/converter/stemValidation";

function makeStem(opts: {
  rate: number;
  channels: number;
  durationSec: number;
  name?: string;
}): PendingStemPcm {
  const frames = Math.round(opts.durationSec * opts.rate);
  return {
    id: "s1",
    name: opts.name ?? "Drums",
    stemType: "drums",
    fileName: "d.wav",
    samples: new Int16Array(frames * opts.channels),
    sampleRate: opts.rate,
    channels: opts.channels,
    defaultVolume: 0.8,
    explicitContent: false,
    fileSize: 1000,
    originalSamples: new Int16Array(frames * opts.channels),
    sourceSnapshot: {
      sampleRate: opts.rate,
      channels: opts.channels,
      durationSec: opts.durationSec,
      fileName: "d.wav",
    },
  };
}

describe("stem resample", () => {
  it("resamples 48000 Hz to 44100 Hz with expected frame ratio", () => {
    const channels = 2;
    const inFrames = 48000;
    const samples = new Int16Array(inFrames * channels);
    samples.fill(1000);
    const out = resampleInterleavedPcm(samples, channels, 48000, 44100);
    const outFrames = out.length / channels;
    expect(outFrames).toBe(Math.round((inFrames * 44100) / 48000));
  });
});

describe("stem duration alignment", () => {
  it("pads a shorter stem with silence", () => {
    const channels = 2;
    const rate = 44100;
    const samples = new Int16Array(rate * channels);
    const { samples: out, action, padAddedSec } = alignStemDuration(
      samples,
      channels,
      rate,
      2,
      true,
    );
    expect(action).toBe("padded");
    expect(padAddedSec).toBeCloseTo(1, 1);
    expect(out.length / channels / rate).toBeCloseTo(2, 2);
  });

  it("trims small overrun without blocking", () => {
    const channels = 1;
    const rate = 44100;
    const extra = Math.floor(0.2 * rate);
    const samples = new Int16Array(rate + extra);
    const { action, trimRemovedSec, blocked } = alignStemDuration(
      samples,
      channels,
      rate,
      1,
      false,
    );
    expect(blocked).toBeFalsy();
    expect(action).toBe("trimmed");
    expect(trimRemovedSec).toBeCloseTo(0.2, 1);
  });

  it("blocks large trim until allowed", () => {
    const channels = 1;
    const rate = 44100;
    const extra = Math.floor((STEM_SMALL_MISMATCH_SEC + 1) * rate);
    const samples = new Int16Array(rate + extra);
    const blocked = alignStemDuration(samples, channels, rate, 1, false);
    expect(blocked.blocked).toBe(true);
    const allowed = alignStemDuration(samples, channels, rate, 1, true);
    expect(allowed.action).toBe("trimmed");
  });
});

describe("normalize to full mix", () => {
  const mix = {
    samples: new Int16Array(44100 * 2 * 10),
    sampleRate: 44100,
    channels: 2,
  };

  it("detects sample rate mismatch", () => {
    const stems = [makeStem({ rate: 48000, channels: 2, durationSec: 10 })];
    const a = analyzeStemAlignment(mix, stems, 10);
    expect(a.hasSampleRateMismatch).toBe(true);
    expect(a.needsNormalization).toBe(true);
  });

  it("normalizes 48000 to 44100 and preserves metadata", () => {
    const stem = makeStem({ rate: 48000, channels: 2, durationSec: 10 });
    const out = normalizeStemToMix(stem, mix, { allowLargeTrim: true });
    expect(out.sampleRate).toBe(44100);
    expect(out.name).toBe("Drums");
    expect(out.stemType).toBe("drums");
    expect(out.defaultVolume).toBe(0.8);
    expect(out.normalizeMeta?.resampled).toBe(true);
    expect(stemsAreAlignedToMix({ sampleRate: 44100, channels: 2, durationSec: 10 }, [out])).toBe(
      true,
    );
  });

  it("suggests pad mix when all stems are longer", () => {
    const stems = [
      makeStem({ rate: 44100, channels: 2, durationSec: 211.8 }),
      { ...makeStem({ rate: 44100, channels: 2, durationSec: 211.5 }), id: "s2", name: "Bass" },
    ];
    const a = analyzeStemAlignment(mix, stems, 204.1);
    expect(a.suggestPadMix).toBe(true);
    expect(a.suggestedMixDurationSec).toBeCloseTo(211.8, 1);
  });

  it("validation passes after normalization", () => {
    const stem = makeStem({ rate: 48000, channels: 2, durationSec: 10 });
    const normalized = normalizeStemToMix(stem, mix, { allowLargeTrim: true });
    const { canExport, issues } = validateStemsForExport(
      { sampleRate: 44100, channels: 2, durationSec: 10 },
      [normalized],
    );
    expect(canExport).toBe(true);
    expect(issues.some((i) => i.level === "error")).toBe(false);
  });
});

describe("pad full mix", () => {
  it("extends mix duration with silence", () => {
    const mix = {
      samples: new Int16Array(44100 * 2 * 5),
      sampleRate: 44100,
      channels: 2,
    };
    const padded = padMixToDuration(mix, 8);
    expect(padded.samples.length / 2 / 44100).toBeCloseTo(8, 2);
  });
});
