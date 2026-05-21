import { describe, it, expect } from "vitest";
import { CodecId, type StemDescriptor } from "@mp5/container";
import {
  assessKaraokeAvailability,
  karaokeStemUiPreset,
} from "../apps/web/src/lib/lyrics/karaokeMode";

function fakeStem(type: StemDescriptor["stemType"], id: string): StemDescriptor {
  return {
    stemId: id,
    stemName: id,
    stemType: type,
    codecId: CodecId.MP5L,
    sampleRate: 44100,
    channels: 1,
    durationSamples: 44100,
    byteLength: 100,
    defaultVolume: 1,
    soloMuteCapable: true,
    requiredForPlayback: false,
    dataOffset: 0,
    dataLength: 100,
  };
}

describe("karaoke mode availability", () => {
  const synced = [{ timeMs: 0, text: "Sing" }];

  it("requires synced lyrics", () => {
    const r = assessKaraokeAvailability(undefined, [fakeStem("drums", "d")]);
    expect(r.hasSyncedLyrics).toBe(false);
  });

  it("allows lyrics-only when no stems", () => {
    const r = assessKaraokeAvailability(synced, []);
    expect(r.hasSyncedLyrics).toBe(true);
    expect(r.audioAvailable).toBe(false);
  });

  it("enables audio with instrumental stem", () => {
    const stems = [fakeStem("instrumental", "i"), fakeStem("lead_vocals", "v")];
    const r = assessKaraokeAvailability(synced, stems);
    expect(r.audioAvailable).toBe(true);
    expect(r.instrumentalStemId).toBe("i");
    const preset = karaokeStemUiPreset(stems, r);
    expect(preset.get("i")?.solo).toBe(true);
    expect(preset.get("v")?.muted).toBe(true);
  });

  it("mutes vocal stems when no instrumental", () => {
    const stems = [fakeStem("drums", "d"), fakeStem("lead_vocals", "v")];
    const r = assessKaraokeAvailability(synced, stems);
    expect(r.audioAvailable).toBe(true);
    const preset = karaokeStemUiPreset(stems, r);
    expect(preset.get("v")?.muted).toBe(true);
    expect(preset.get("d")?.muted).toBe(false);
  });
});
