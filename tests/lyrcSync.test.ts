import { describe, it, expect } from "vitest";
import {
  encodeLyrc,
  decodeLyrc,
  parseMp5,
  writeMp5,
  CodecId,
} from "@mp5/container";
import {
  parseSyncedLyricsText,
  formatSyncedLyricsText,
} from "../apps/web/src/lib/lyrics/lyrcTimestampParser";
import {
  currentSyncedLineIndex,
  seekTimeSecForLine,
} from "../apps/web/src/lib/lyrics/lyricPlayback";

function minimalMp5(optional: Map<string, Uint8Array>): Uint8Array {
  return writeMp5({
    head: {
      codecId: CodecId.PCM,
      channels: 1,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: 44100,
      totalSamples: 1000n,
      encoderVersion: 1,
    },
    meta: [{ key: "title", value: "t" }],
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(2000) }],
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    optional,
  });
}

describe("LYRC synced lyrics", () => {
  it("roundtrips timeMs synced lines with section", () => {
    const payload = {
      unsynced: "Plain fallback",
      source: "user",
      synced: [
        { timeMs: 0, text: "Start", section: "Intro" },
        { timeMs: 12500, text: "Example lyric line" },
      ],
    };
    const ly = decodeLyrc(encodeLyrc(payload));
    expect(ly?.synced).toHaveLength(2);
    expect(ly?.synced?.[1]?.timeMs).toBe(12500);
    expect(ly?.synced?.[0]?.section).toBe("Intro");
  });

  it("decodes legacy time seconds as timeMs", () => {
    const raw = new TextEncoder().encode(
      JSON.stringify({
        synced: [{ time: 12.5, text: "Legacy line" }],
        source: "test",
      }),
    );
    const ly = decodeLyrc(raw);
    expect(ly?.synced?.[0]?.timeMs).toBe(12500);
  });

  it("parses [mm:ss.xx] timestamp lines", () => {
    const { lines, errors } = parseSyncedLyricsText(
      "[00:00.00] MP5 demo starts\n[00:12.50] next line\n[00:15.20|Chorus] hook",
    );
    expect(errors).toHaveLength(0);
    expect(lines).toHaveLength(3);
    expect(lines[1]?.timeMs).toBe(12500);
    expect(lines[2]?.section).toBe("Chorus");
  });

  it("reports invalid timestamp lines calmly", () => {
    const { lines, errors } = parseSyncedLyricsText("not a timestamp\n[99:99.00] bad");
    expect(lines.length).toBeLessThan(2);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("formats synced text for editor roundtrip", () => {
    const lines = [{ timeMs: 500, text: "Half second" }];
    const text = formatSyncedLyricsText(lines);
    const again = parseSyncedLyricsText(text);
    expect(again.errors).toHaveLength(0);
    expect(again.lines[0]?.timeMs).toBe(500);
  });

  it("unsynced-only LYRC still roundtrips", () => {
    const buf = minimalMp5(
      new Map([["LYRC", encodeLyrc({ unsynced: "Only plain", source: "user" })]]),
    );
    const ly = decodeLyrc(parseMp5(buf).optional.get("LYRC"));
    expect(ly?.unsynced).toBe("Only plain");
    expect(ly?.synced).toBeUndefined();
  });

  it("selects current synced line from playback time", () => {
    const lines = [
      { timeMs: 0, text: "a" },
      { timeMs: 1000, text: "b" },
      { timeMs: 2000, text: "c" },
    ];
    expect(currentSyncedLineIndex(lines, 0.5)).toBe(0);
    expect(currentSyncedLineIndex(lines, 1.5)).toBe(1);
    expect(seekTimeSecForLine(lines[2]!)).toBe(2);
  });

  it("rejects invalid synced entries in container decode", () => {
    const raw = new TextEncoder().encode(
      JSON.stringify({
        synced: [{ timeMs: -1, text: "" }, { timeMs: 100, text: "ok" }],
      }),
    );
    const ly = decodeLyrc(raw);
    expect(ly?.synced?.length).toBe(1);
  });
});
