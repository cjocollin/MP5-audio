import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CodecId,
  MAX_CHUNK_PAYLOAD,
  buildStemOptionalChunks,
  parseMp5,
  setStdfFragmentPayloadTargetForTests,
  resetStdfFragmentPayloadTarget,
  writeMp5,
  type StemDescriptor,
} from "@mp5/container";
import { parseStemsFromFile } from "../apps/web/src/lib/stems/parseStems";
import {
  assessSelectedStemsPrepare,
  assessStemFileTier,
  isLargeEmbeddedStemFile,
} from "../apps/web/src/lib/stems/stemLimits";
import { loadStemFrameData } from "../apps/web/src/lib/stems/stemFrameLoader";
import { StemDecodeCache } from "../apps/web/src/lib/stems/stemDecodeCache";
import { stemsForKaraokeAudio } from "../apps/web/src/lib/lyrics/karaokePlan";
import { assessKaraokeAvailability } from "../apps/web/src/lib/lyrics/karaokeMode";
import { currentSyncedLineIndex } from "../apps/web/src/lib/lyrics/lyricPlayback";

function stemBundle(id: string, type: StemDescriptor["stemType"], bytes: number) {
  const frameData = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) frameData[i] = (i * 11) & 0xff;
  return {
    stemId: id,
    stemName: id,
    stemType: type,
    codecId: CodecId.PCM,
    sampleRate: 44100,
    channels: 2,
    durationSamples: Math.floor(bytes / 4),
    frameData,
  };
}

describe("lazy stem parse", () => {
  beforeEach(() => {
    setStdfFragmentPayloadTargetForTests(4096);
  });
  afterEach(() => {
    resetStdfFragmentPayloadTarget();
  });

  it("parseStemsFromFile does not embed all frame bytes upfront", () => {
    const stems = [
      stemBundle("a", "drums", 8000),
      stemBundle("b", "bass", 8000),
      stemBundle("c", "guitar", 8000),
    ];
    const { optional, extraChunks } = buildStemOptionalChunks(stems);
    const mp5 = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 2,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 44100n,
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(200) }],
      optional,
      extraChunks,
    });
    const parsed = parseMp5(mp5);
    const file = parseStemsFromFile(parsed);
    expect(file?.storageMode).toBe("stda-v1");
    expect(file?.stems.length).toBe(3);
    expect(file?.totalEmbeddedBytes).toBeGreaterThan(0);
    const tier = assessStemFileTier(file!.stems, file!.totalEmbeddedBytes);
    expect(tier.large).toBe(false);
  });

  it("large STDF fixture is flagged large without blocking panel tier", () => {
    resetStdfFragmentPayloadTarget();
    const stems = Array.from({ length: 8 }, (_, i) =>
      stemBundle(`stem-${i}`, "drums", 6_500_000),
    );
    const { optional, extraChunks, manifest } = buildStemOptionalChunks(stems);
    expect(manifest.storageMode).toBe("stdf-v1");
    const mp5 = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 2,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 44100n,
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(200) }],
      optional,
      extraChunks,
    });
    let max = 0;
    let o = 12;
    while (o + 16 <= mp5.length) {
      const v = new DataView(mp5.buffer, mp5.byteOffset + o);
      max = Math.max(max, v.getUint32(4, true));
      o += 16 + v.getUint32(4, true);
    }
    expect(max).toBeLessThanOrEqual(MAX_CHUNK_PAYLOAD);

    const file = parseStemsFromFile(parseMp5(mp5));
    expect(isLargeEmbeddedStemFile(file!.totalEmbeddedBytes)).toBe(true);
    expect(assessStemFileTier(file!.stems, file!.totalEmbeddedBytes).large).toBe(true);
    expect(assessSelectedStemsPrepare([file!.stems[0]!]).ok).toBe(true);
  });

  it("loads only one stem frame on demand", async () => {
    const stems = [stemBundle("solo", "lead_vocals", 4000), stemBundle("b", "bass", 4000)];
    const { optional, extraChunks } = buildStemOptionalChunks(stems);
    const mp5 = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 2,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 44100n,
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(100) }],
      optional,
      extraChunks,
    });
    const file = parseStemsFromFile(parseMp5(mp5))!;
    const { frameData } = await loadStemFrameData(file, file.stems[0]!, 0);
    expect(frameData.length).toBe(4000);
    const cache = new StemDecodeCache();
    const decoded = await cache.decodeStem(file, file.stems[0]!, 0);
    expect(decoded.samples.length).toBeGreaterThan(0);
    expect(cache.stats().loadedCount).toBe(1);
  });

  it("karaoke instrumental plan uses one stem id", () => {
    const stems: StemDescriptor[] = [
      {
        stemId: "inst",
        stemName: "Inst",
        stemType: "instrumental",
        codecId: CodecId.PCM,
        sampleRate: 44100,
        channels: 2,
        durationSamples: 1000,
        byteLength: 100,
        defaultVolume: 1,
        soloMuteCapable: true,
        requiredForPlayback: false,
        dataOffset: 0,
        dataLength: 100,
      },
      {
        stemId: "vox",
        stemName: "Vox",
        stemType: "lead_vocals",
        codecId: CodecId.PCM,
        sampleRate: 44100,
        channels: 2,
        durationSamples: 1000,
        byteLength: 100,
        defaultVolume: 1,
        soloMuteCapable: true,
        requiredForPlayback: false,
        dataOffset: 0,
        dataLength: 100,
      },
    ];
    const avail = assessKaraokeAvailability([{ timeMs: 0, text: "hi" }], stems);
    const plan = stemsForKaraokeAudio(stems, avail);
    expect(plan.mode).toBe("instrumental_only");
    expect(plan.stemIds).toEqual(["inst"]);
  });

  it("synced line index uses audio clock seconds", () => {
    const lines = [
      { timeMs: 0, text: "a" },
      { timeMs: 1000, text: "b" },
      { timeMs: 2000, text: "c" },
    ];
    expect(currentSyncedLineIndex(lines, 0.5)).toBe(0);
    expect(currentSyncedLineIndex(lines, 1.5)).toBe(1);
    expect(currentSyncedLineIndex(lines, 2.5)).toBe(2);
  });
});
