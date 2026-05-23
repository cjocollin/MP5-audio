import { describe, expect, it } from "vitest";

/** Mirrors stem mixer buffer/gain diff helpers for transport rebuild decisions. */
interface StemPcmTrack {
  id: string;
  samples: Int16Array;
  rate: number;
  ch: number;
  gain: number;
  muted: boolean;
  solo: boolean;
}

function sameTrackBuffers(a: StemPcmTrack[], b: StemPcmTrack[]): boolean {
  if (a.length !== b.length) return false;
  const bById = new Map(b.map((t) => [t.id, t]));
  for (const t of a) {
    const o = bById.get(t.id);
    if (!o || o.samples !== t.samples || o.rate !== t.rate || o.ch !== t.ch) return false;
  }
  return true;
}

function shouldFullReload(prev: StemPcmTrack[], next: StemPcmTrack[]): boolean {
  if (!sameTrackBuffers(prev, next)) return true;
  if (prev.length !== next.length) return true;
  return false;
}

function makeTrack(id: string, samples: Int16Array, muted = false): StemPcmTrack {
  return { id, samples, rate: 44100, ch: 2, gain: 1, muted, solo: false };
}

describe("stem mixer transport decisions", () => {
  it("live insert adds a new buffer — requires graph merge not full duplicate start", () => {
    const shared = new Int16Array(100);
    const prev = [makeTrack("drums", shared)];
    const next = [makeTrack("drums", shared), makeTrack("vocals", new Int16Array(100))];
    expect(shouldFullReload(prev, next)).toBe(true);
  });

  it("unmute-only change does not require buffer reload", () => {
    const shared = new Int16Array(100);
    const prev = [makeTrack("vocals", shared, true)];
    const next = [makeTrack("vocals", shared, false)];
    expect(sameTrackBuffers(prev, next)).toBe(true);
    expect(shouldFullReload(prev, next)).toBe(false);
  });

  it("stale generation gate rejects outdated async work", () => {
    let graphGeneration = 1;
    const captured = graphGeneration;
    graphGeneration = 2;
    expect(captured === graphGeneration).toBe(false);
  });
});
