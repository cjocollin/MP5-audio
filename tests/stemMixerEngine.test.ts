import { describe, expect, it } from "vitest";

/**
 * Unit tests for stem mixer transport helpers (pure logic mirrored from useStemMixerEngine).
 */

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

function onlyMixParamsChanged(a: StemPcmTrack[], b: StemPcmTrack[]): boolean {
  if (!sameTrackBuffers(a, b)) return false;
  const bById = new Map(b.map((t) => [t.id, t]));
  for (const t of a) {
    const o = bById.get(t.id)!;
    if (o.muted !== t.muted || o.solo !== t.solo || o.gain !== t.gain) return true;
  }
  return false;
}

function makeTrack(id: string, muted = false, gain = 1): StemPcmTrack {
  return {
    id,
    samples: new Int16Array(100),
    rate: 44100,
    ch: 2,
    gain,
    muted,
    solo: false,
  };
}

describe("stem mixer engine track diff", () => {
  it("detects mute-only changes without buffer reload", () => {
    const samples = new Int16Array(100);
    const a = [{ ...makeTrack("drums"), samples }];
    const b = [{ ...makeTrack("drums", true), samples }];
    expect(sameTrackBuffers(a, b)).toBe(true);
    expect(onlyMixParamsChanged(a, b)).toBe(true);
  });

  it("detects new stem buffers as not mix-only", () => {
    const a = [makeTrack("drums")];
    const b = [makeTrack("drums"), makeTrack("bass")];
    expect(sameTrackBuffers(a, b)).toBe(false);
    expect(onlyMixParamsChanged(a, b)).toBe(false);
  });

  it("ignores identical track lists", () => {
    const a = [makeTrack("drums")];
    const b = [makeTrack("drums")];
    expect(onlyMixParamsChanged(a, b)).toBe(false);
  });
});
