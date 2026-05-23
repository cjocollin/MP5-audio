import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CodecId,
  buildStemOptionalChunks,
  parseMp5,
  writeMp5,
} from "@mp5/container";
import { buildStemDecodeJob } from "../apps/web/src/lib/stems/buildStemJobPayload";
import { parseStemsFromFile } from "../apps/web/src/lib/stems/parseStems";
import {
  getStemWorkerClient,
  resetStemWorkerClientForTests,
  STEM_WORKER_FALLBACK_WARNING,
} from "../apps/web/src/lib/stems/stemWorkerClient";
import { stemsForKaraokeAudio } from "../apps/web/src/lib/lyrics/karaokePlan";
import { assessKaraokeAvailability } from "../apps/web/src/lib/lyrics/karaokeMode";
import { currentSyncedLineIndex } from "../apps/web/src/lib/lyrics/lyricPlayback";
import type { StemDecodeJobRequest } from "../apps/web/src/lib/stems/stemWorkerProtocol";

function pcmStem(id: string, bytes: number) {
  const frameData = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) frameData[i] = i & 0xff;
  return {
    stemId: id,
    stemName: id,
    stemType: "drums" as const,
    codecId: CodecId.PCM,
    sampleRate: 44100,
    channels: 2,
    durationSamples: Math.floor(bytes / 4),
    frameData,
  };
}

describe("stem worker protocol", () => {
  it("buildStemDecodeJob transfers only one stem payload", async () => {
    const stems = [pcmStem("a", 2000), pcmStem("b", 3000)];
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
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(80) }],
      optional,
      extraChunks,
    });
    const file = parseStemsFromFile(parseMp5(mp5))!;
    const { job, transfer } = await buildStemDecodeJob(file, file.stems[0]!, 0, "j1");
    expect(job.stemId).toBe("a");
    expect(job.stdaPayload?.length).toBe(2000);
    expect(transfer.length).toBe(1);
    expect(job.stdfFragments).toBeUndefined();
    if (job.stdfFragments?.[0]) {
      expect(job.stdfFragments[0].payloadCrc32).toBeDefined();
      expect(job.stdfFragments[0].payloadLength).toBeGreaterThan(0);
    }
  });

  it("karaoke instrumental still requests one stem", () => {
    const stems = [
      {
        stemId: "inst",
        stemName: "Inst",
        stemType: "instrumental" as const,
        codecId: CodecId.PCM,
        sampleRate: 44100,
        channels: 2,
        durationSamples: 100,
        byteLength: 100,
        defaultVolume: 1,
        soloMuteCapable: true,
        requiredForPlayback: false,
        dataOffset: 0,
        dataLength: 100,
      },
    ];
    const plan = stemsForKaraokeAudio(stems, assessKaraokeAvailability([{ timeMs: 0, text: "x" }], stems));
    expect(plan.stemIds).toHaveLength(1);
  });

  it("synced lyrics index uses playback clock", () => {
    const lines = [
      { timeMs: 0, text: "a" },
      { timeMs: 1000, text: "b" },
    ];
    expect(currentSyncedLineIndex(lines, 0.9)).toBe(0);
    expect(currentSyncedLineIndex(lines, 1.1)).toBe(1);
  });
});

describe("stem worker client fallback", () => {
  const origWorker = globalThis.Worker;

  beforeEach(() => {
    resetStemWorkerClientForTests();
  });

  afterEach(() => {
    globalThis.Worker = origWorker;
    resetStemWorkerClientForTests();
  });

  it("falls back when Worker is unavailable", async () => {
    // @ts-expect-error test shim
    globalThis.Worker = undefined;
    const stems = [pcmStem("x", 800)];
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
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(80) }],
      optional,
      extraChunks,
    });
    const file = parseStemsFromFile(parseMp5(mp5))!;
    const client = getStemWorkerClient();
    const decoded = await client.decodeStem(file, file.stems[0]!, 0);
    expect(decoded.samples.length).toBeGreaterThan(0);
    expect(client.diagnostics.fallbackMode).toBe(true);
    expect(STEM_WORKER_FALLBACK_WARNING).toContain("main thread");
  });
});
