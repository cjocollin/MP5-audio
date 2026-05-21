import { describe, it, expect } from "vitest";
import {
  partitionStemFiles,
  buildBatchStemImportSummary,
  assessBatchStemImport,
  estimateStemFileDecodedBytes,
  isSupportedStemFile,
  createPendingStemFromPcm,
} from "../apps/web/src/converter/batchStemImport";
import { STEM_MIX_LIMITS } from "../apps/web/src/lib/stems/stemLimits";
import { guessStemTypeFromFilename } from "../apps/web/src/converter/stemTypeGuess";
import {
  normalizeAllStemsToMix,
  analyzeStemAlignment,
} from "../apps/web/src/converter/stemNormalize";
import {
  validateStemsForExport,
  type PendingStemPcm,
} from "../apps/web/src/converter/stemValidation";

function fakeFile(name: string, size = 1000): File {
  return new File([new Uint8Array(size)], name, { type: "audio/wav" });
}

function makeStem(opts: {
  rate: number;
  channels: number;
  durationSec: number;
  name?: string;
  fileName?: string;
}): PendingStemPcm {
  const frames = Math.round(opts.durationSec * opts.rate);
  return {
    id: "s1",
    name: opts.name ?? "Stem",
    stemType: "custom",
    fileName: opts.fileName ?? "stem.wav",
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
      fileName: opts.fileName ?? "stem.wav",
    },
  };
}

describe("batch stem file partition", () => {
  it("accepts multiple supported files", () => {
    const files = [fakeFile("drums.wav"), fakeFile("bass.flac"), fakeFile("vocal.mp3")];
    const p = partitionStemFiles(files, []);
    expect(p.toImport).toHaveLength(3);
    expect(p.unsupported).toHaveLength(0);
  });

  it("skips unsupported extensions", () => {
    const p = partitionStemFiles([fakeFile("notes.txt"), fakeFile("drums.wav")], []);
    expect(p.toImport).toHaveLength(1);
    expect(p.unsupported).toEqual(["notes.txt"]);
  });

  it("reports duplicate filenames against existing and within batch", () => {
    const p = partitionStemFiles(
      [fakeFile("drums.wav"), fakeFile("drums.wav"), fakeFile("bass.wav")],
      ["drums.wav"],
    );
    expect(p.toImport).toHaveLength(1);
    expect(p.toImport[0]?.name).toBe("bass.wav");
    expect(p.duplicates).toContain("drums.wav");
  });
});

describe("filename stem type guessing", () => {
  it("maps vocal and drum patterns", () => {
    expect(guessStemTypeFromFilename("Lead_Vocal.wav")).toBe("lead_vocals");
    expect(guessStemTypeFromFilename("bg-vox.wav")).toBe("background_vocals");
    expect(guessStemTypeFromFilename("808_bass.wav")).toBe("bass");
    expect(guessStemTypeFromFilename("kick.wav")).toBe("percussion");
    expect(guessStemTypeFromFilename("snares_and_claps.wav")).toBe("percussion");
    expect(guessStemTypeFromFilename("Drums.wav")).toBe("drums");
    expect(guessStemTypeFromFilename("synth_pad.wav")).toBe("synths");
    expect(guessStemTypeFromFilename("unknown_track.wav")).toBe("custom");
  });
});

describe("batch validation and normalization", () => {
  const mix = {
    samples: new Int16Array(44100 * 2 * 10),
    sampleRate: 44100,
    channels: 2,
  };

  it("detects sample rate mismatch across batch", () => {
    const stems = [
      makeStem({ rate: 48000, channels: 2, durationSec: 10, fileName: "a.wav" }),
      { ...makeStem({ rate: 48000, channels: 2, durationSec: 10, fileName: "b.wav" }), id: "s2" },
    ];
    const a = analyzeStemAlignment(mix, stems, 10);
    expect(a.hasSampleRateMismatch).toBe(true);
    const summary = buildBatchStemImportSummary({
      imported: 2,
      skipped: 0,
      failed: [],
      partition: { toImport: [], unsupported: [], duplicates: [] },
      guessedTypes: [],
      mix: { sampleRate: 44100, channels: 2, durationSec: 10 },
      stems,
    });
    expect(summary.alignment?.needsNormalization).toBe(true);
  });

  it("batch normalization fixes 48000 to 44100 for all stems", () => {
    const stems = [
      makeStem({ rate: 48000, channels: 2, durationSec: 10, name: "Drums" }),
      {
        ...makeStem({ rate: 48000, channels: 2, durationSec: 9.5, name: "Bass" }),
        id: "s2",
      },
    ];
    const normalized = normalizeAllStemsToMix(mix, stems, true);
    expect(normalized.every((s) => s.sampleRate === 44100)).toBe(true);
    expect(normalized[0]?.name).toBe("Drums");
    expect(normalized[0]?.defaultVolume).toBe(0.8);
    const { canExport } = validateStemsForExport(
      { sampleRate: 44100, channels: 2, durationSec: 10 },
      normalized,
    );
    expect(canExport).toBe(true);
  });

  it("createPendingStemFromPcm preserves guessed type and name", () => {
    const file = fakeFile("lead_vocal_take1.wav");
    const pcm = {
      samples: new Int16Array(44100 * 2),
      sampleRate: 44100,
      channels: 2,
    };
    const stem = createPendingStemFromPcm(file, pcm);
    expect(stem.stemType).toBe("lead_vocals");
    expect(stem.name).toBe("lead_vocal_take1");
    expect(stem.originalSamples?.length).toBe(pcm.samples.length);
  });
});

describe("batch import guardrails", () => {
  it("blocks when stem count would exceed limit", () => {
    const files = Array.from({ length: 40 }, (_, i) => fakeFile(`s${i}.wav`));
    const msgs = assessBatchStemImport(0, files, 0);
    expect(msgs.some((m) => m.level === "block")).toBe(true);
  });

  it("allows typical multi-stem WAV batch without blocking", () => {
    const files = [
      fakeFile("drums.wav", 28 * 1024 * 1024),
      fakeFile("bass.wav", 28 * 1024 * 1024),
      fakeFile("vocals.wav", 28 * 1024 * 1024),
      fakeFile("guitar.wav", 28 * 1024 * 1024),
    ];
    const msgs = assessBatchStemImport(0, files, 0);
    expect(msgs.some((m) => m.level === "block")).toBe(false);
    expect(msgs.some((m) => m.level === "warn")).toBe(true);
  });

  it("allows ten ~35 MB WAV stems with warnings only (no hard block)", () => {
    const files = Array.from({ length: 10 }, (_, i) =>
      fakeFile(`stem-${i}.wav`, 36 * 1024 * 1024),
    );
    const msgs = assessBatchStemImport(0, files, 0);
    expect(msgs.some((m) => m.level === "block")).toBe(false);
    expect(msgs.some((m) => m.message.includes("memory limits"))).toBe(false);
    expect(msgs.some((m) => m.level === "warn")).toBe(true);
  });

  it("estimateStemFileDecodedBytes uses file size for WAV", () => {
    const f = fakeFile("stem.wav", 12_000_000);
    expect(estimateStemFileDecodedBytes(f)).toBe(12_000_000);
  });

  it("warns when total decoded estimate is high but does not block import", () => {
    const files = Array.from({ length: 6 }, (_, i) =>
      fakeFile(`long-${i}.wav`, 70 * 1024 * 1024),
    );
    const msgs = assessBatchStemImport(0, files, 0);
    expect(msgs.some((m) => m.level === "block")).toBe(false);
    expect(msgs.some((m) => m.message.includes("you can still import"))).toBe(true);
  });
});

describe("supported stem formats", () => {
  it("includes converter decode extensions", () => {
    expect(isSupportedStemFile("a.flac")).toBe(true);
    expect(isSupportedStemFile("a.m4a")).toBe(true);
    expect(isSupportedStemFile("a.xyz")).toBe(false);
  });
});
