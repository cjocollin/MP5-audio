import { describe, it, expect, beforeEach } from "vitest";
import {
  DECODE_CACHE_MAX_ENTRIES,
  DecodeCache,
} from "../apps/web/src/player/decodeCache";

const emptyParsed = () => ({
  meta: [],
  audioFrames: [],
  seek: [],
  waveform: [],
  info: [],
  corr: [],
  optional: new Map(),
  stdfFragments: [],
  warnings: [],
  header: { majorVersion: 1, fileFlags: 0 },
});

/** `samples` length drives the byte estimate (2 bytes each). */
const stub = (sampleCount = 1) => ({
  samples: new Int16Array(sampleCount),
  sampleRate: 48000,
  channels: 1,
  parsed: emptyParsed(),
  decodePath: "PCM",
  duration: 1,
});

describe("DecodeCache", () => {
  let cache: DecodeCache;

  beforeEach(() => {
    cache = new DecodeCache();
  });

  it("stores and retrieves entries", () => {
    cache.set("a", stub(4));
    expect(cache.get("a")?.duration).toBe(1);
  });

  it("evicts oldest once past the entry cap", () => {
    for (let i = 0; i <= DECODE_CACHE_MAX_ENTRIES; i++) {
      cache.set(String(i), stub());
    }
    // One more than the cap was inserted, so the least-recently-used is gone.
    expect(cache.size()).toBe(DECODE_CACHE_MAX_ENTRIES);
    expect(cache.get("0")).toBeUndefined();
    expect(cache.get(String(DECODE_CACHE_MAX_ENTRIES))).toBeDefined();
  });

  it("repeated set for same id does not grow entry count or double-count bytes", () => {
    for (let i = 0; i < 5; i++) cache.set("same", stub(10));
    expect(cache.size()).toBe(1);
    expect(cache.getStats().estimatedBytes).toBe(20);
    expect(cache.nonProtectedBytes()).toBe(20);
  });

  it("clear removes all entries and zeroes the byte total", () => {
    cache.set("a", stub(8));
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.nonProtectedBytes()).toBe(0);
  });

  it("evicts by BYTE budget, not just entry count", () => {
    cache.setBudgetBytes(100); // 50 samples' worth
    cache.set("a", stub(30)); // 60 B
    cache.set("b", stub(30)); // 60 B -> 120 B total, over budget
    // "a" is the LRU non-protected entry, so it goes.
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeDefined();
    expect(cache.nonProtectedBytes()).toBeLessThanOrEqual(100);
  });

  it("refuses an over-budget entry instead of insert-then-evict", () => {
    cache.setBudgetBytes(100);
    expect(cache.canAdmit(200)).toBe(false);
    expect(cache.set("huge", stub(500))).toBe(false);
    // Nothing stored — otherwise a caller would re-decode it on every pass.
    expect(cache.get("huge")).toBeUndefined();
    expect(cache.nonProtectedBytes()).toBe(0);
  });

  it("never evicts the protected track and excludes it from the budget", () => {
    cache.setBudgetBytes(100);
    cache.setProtected("current");
    cache.set("current", stub(500)); // 1000 B, way over budget
    expect(cache.get("current")).toBeDefined();
    // The protected entry costs no budget, so a neighbour still fits.
    expect(cache.nonProtectedBytes()).toBe(0);
    expect(cache.set("neighbour", stub(40))).toBe(true);
    expect(cache.get("current")).toBeDefined();
    expect(cache.get("neighbour")).toBeDefined();
  });

  it("reports container bytes pinned by an entry separately from evictable PCM", () => {
    const entry = stub(10);
    entry.parsed.audioFrames = [
      { data: new Uint8Array(1024) },
    ] as unknown as typeof entry.parsed.audioFrames;
    cache.set("a", entry);
    const stats = cache.getStats();
    // Evictable PCM only; the shared container bytes are reported apart from it.
    expect(stats.estimatedBytes).toBe(20);
    expect(stats.pinnedContainerBytes).toBe(1024);
  });
});
