import { describe, it, expect, beforeEach } from "vitest";
import { DecodeCache } from "../apps/web/src/player/decodeCache";

describe("DecodeCache", () => {
  let cache: DecodeCache;

  beforeEach(() => {
    cache = new DecodeCache();
  });

  it("stores and retrieves entries", () => {
    cache.set("a", {
      samples: new Int16Array(4),
      sampleRate: 48000,
      channels: 1,
      parsed: { meta: [], audioFrames: [], seek: [], waveform: [], info: [], corr: [], optional: new Map(), stdfFragments: [], warnings: [], header: { majorVersion: 1, fileFlags: 0 } },
      decodePath: "PCM",
      duration: 1,
    });
    expect(cache.get("a")?.duration).toBe(1);
  });

  it("evicts oldest when over max entries", () => {
    const stub = (id: string) => ({
      samples: new Int16Array(1),
      sampleRate: 48000,
      channels: 1,
      parsed: { meta: [], audioFrames: [], seek: [], waveform: [], info: [], corr: [], optional: new Map(), stdfFragments: [], warnings: [], header: { majorVersion: 1, fileFlags: 0 } },
      decodePath: "PCM",
      duration: 1,
    });
    cache.set("1", stub("1"));
    cache.set("2", stub("2"));
    cache.set("3", stub("3"));
    cache.set("4", stub("4"));
    expect(cache.get("1")).toBeUndefined();
    expect(cache.get("4")).toBeDefined();
  });

  it("repeated set for same id does not grow entry count", () => {
    const stub = {
      samples: new Int16Array(1),
      sampleRate: 48000,
      channels: 1,
      parsed: { meta: [], audioFrames: [], seek: [], waveform: [], info: [], corr: [], optional: new Map(), stdfFragments: [], warnings: [], header: { majorVersion: 1, fileFlags: 0 } },
      decodePath: "PCM",
      duration: 1,
    };
    for (let i = 0; i < 5; i++) cache.set("same", stub);
    expect(cache.size()).toBe(1);
  });

  it("clear removes all entries", () => {
    cache.set("a", {
      samples: new Int16Array(1),
      sampleRate: 48000,
      channels: 1,
      parsed: { meta: [], audioFrames: [], seek: [], waveform: [], info: [], corr: [], optional: new Map(), stdfFragments: [], warnings: [], header: { majorVersion: 1, fileFlags: 0 } },
      decodePath: "PCM",
      duration: 1,
    });
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
  });
});
