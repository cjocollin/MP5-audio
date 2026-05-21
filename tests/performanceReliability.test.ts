import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DecodeCache } from "../apps/web/src/player/decodeCache";
import {
  assessBatchQueue,
  assessLibraryStorage,
  assessSourceFile,
} from "../apps/web/src/lib/performance/guardrails";
import { PERF_THRESHOLDS } from "../apps/web/src/lib/performance/thresholds";
import { downloadBlob } from "../apps/web/src/lib/performance/downloadBlob";
import { useConversionStore } from "../apps/web/src/store/conversionStore";
import { assessStemMixSafety } from "../apps/web/src/lib/stems/stemLimits";
import type { StemDescriptor } from "@mp5/container";
import { CodecId } from "@mp5/container";

const stubParsed = {
  meta: [],
  audioFrames: [],
  seek: [],
  waveform: [],
  info: [],
  corr: [],
  optional: new Map(),
  warnings: [],
  header: { majorVersion: 1, fileFlags: 0 },
};

function stubCacheEntry(id: string) {
  return {
    samples: new Int16Array(44100),
    sampleRate: 44100,
    channels: 1,
    parsed: stubParsed,
    decodePath: "PCM",
    duration: 1,
  };
}

describe("guardrails", () => {
  it("warns on large source files", () => {
    const file = new File([new Uint8Array(1)], "big.flac");
    Object.defineProperty(file, "size", { value: PERF_THRESHOLDS.warnSourceFileBytes + 1 });
    const msgs = assessSourceFile(file);
    expect(msgs.some((m) => m.level === "warn")).toBe(true);
  });

  it("blocks extreme source files", () => {
    const file = new File([new Uint8Array(1)], "huge.flac");
    Object.defineProperty(file, "size", { value: PERF_THRESHOLDS.blockSourceFileBytes + 1 });
    expect(assessSourceFile(file).some((m) => m.level === "block")).toBe(true);
  });

  it("warns on large batch queues", () => {
    const msgs = assessBatchQueue(10, PERF_THRESHOLDS.warnBatchQueueCount + 2);
    expect(msgs.some((m) => m.level === "warn")).toBe(true);
  });

  it("blocks extreme batch queues", () => {
    const msgs = assessBatchQueue(40, PERF_THRESHOLDS.blockBatchQueueCount + 1);
    expect(msgs.some((m) => m.level === "block")).toBe(true);
  });

  it("warns when library storage is nearly full", () => {
    const msgs = assessLibraryStorage(900, 1000);
    expect(msgs.some((m) => m.level === "warn")).toBe(true);
  });
});

describe("decode cache", () => {
  let cache: DecodeCache;

  beforeEach(() => {
    cache = new DecodeCache();
  });

  it("does not grow beyond max when same track is replayed", () => {
    for (let i = 0; i < 10; i++) {
      cache.set("track-a", stubCacheEntry("track-a"));
    }
    expect(cache.size()).toBe(1);
  });

  it("reports memory stats", () => {
    cache.set("a", stubCacheEntry("a"));
    const stats = cache.getStats("a");
    expect(stats.entryCount).toBe(1);
    expect(stats.estimatedBytes).toBeGreaterThan(0);
    expect(stats.currentTrackBytes).toBe(stats.estimatedBytes);
  });
});

describe("downloadBlob", () => {
  it("revokes object URL after click", () => {
    const revoke = vi.fn();
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revoke);
    const click = vi.fn();
    vi.stubGlobal("document", {
      createElement: () => ({
        href: "",
        download: "",
        click,
      }),
    });

    downloadBlob(new Blob(["x"]), "test.mp5");
    expect(create).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:test");
    expect(click).toHaveBeenCalled();
    create.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("conversion cancel generation", () => {
  beforeEach(() => {
    useConversionStore.setState({
      singlePhase: "idle",
      singleFileName: null,
      batchRunning: false,
      batchCurrentName: null,
      batchPendingCount: 0,
      cancelGeneration: 0,
    });
  });

  it("bumps generation so stale exports can be ignored", () => {
    const before = useConversionStore.getState().cancelGeneration;
    const after = useConversionStore.getState().bumpCancelGeneration();
    expect(after).toBe(before + 1);
  });
});

describe("stem memory guardrails", () => {
  it("blocks when total decoded bytes exceed MVP cap", () => {
    const stems: StemDescriptor[] = [
      {
        stemId: "1",
        stemName: "Big",
        stemType: "drums",
        codecId: CodecId.PCM,
        channels: 2,
        sampleRate: 44100,
        durationSamples: 60_000_000,
        byteLength: 120_000_000,
        defaultVolume: 1,
        soloMuteCapable: true,
        requiredForPlayback: false,
        dataOffset: 0,
        dataLength: 120_000_000,
      },
    ];
    const result = assessStemMixSafety(stems);
    expect(result.ok).toBe(false);
    expect(result.block).toBeTruthy();
  });
});
