import { describe, it, expect } from "vitest";
import {
  CodecId,
  encodeCover,
  encodeExpl,
  encodeLyrc,
  encodeMood,
  encodeRecv,
  encodeSafe,
  encodeSens,
  encodeVibe,
  decodeCover,
  decodeExpl,
  decodeLyrc,
  decodeMood,
  decodeVibe,
  getMetaValue,
  metaFieldsFromRecord,
  parseMp5,
  parseOptionalMetadata,
  recordFromMetaFields,
  sanitizeMetadata,
  writeMp5,
  MAX_COVER_SIZE,
  Mp5SecurityError,
} from "@mp5/container";

function minimalMp5(extra?: Parameters<typeof writeMp5>[0]) {
  return writeMp5({
    head: {
      codecId: CodecId.PCM,
      channels: 1,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: 48000,
      totalSamples: 4n,
      encoderVersion: 1,
    },
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(8) }],
    ...extra,
  });
}

describe("metadata MVP", () => {
  it("META roundtrip with standard fields", () => {
    const meta = metaFieldsFromRecord({
      title: "Test Title",
      artist: "Test Artist",
      album: "Test Album",
      albumartist: "Various",
      genre: "Electronic",
      year: "2026",
      tracknumber: "3",
      discnumber: "1",
      composer: "Composer Name",
      comment: "A note",
    });
    const buf = minimalMp5({ meta });
    const p = parseMp5(buf);
    const rec = recordFromMetaFields(p.meta);
    expect(rec.title).toBe("Test Title");
    expect(rec.artist).toBe("Test Artist");
    expect(rec.albumartist).toBe("Various");
    expect(getMetaValue(p.meta, "tracknumber")).toBe("3");
  });

  it("COVR roundtrip with MIME header", () => {
    const cover = {
      mime: "image/png",
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    };
    const buf = minimalMp5({ cover });
    const p = parseMp5(buf);
    expect(p.coverArt?.mime).toBe("image/png");
    expect(p.coverArt?.data).toEqual(cover.data);
    const re = decodeCover(encodeCover(cover));
    expect(re?.mime).toBe("image/png");
  });

  it("rejects oversized cover art", () => {
    expect(() =>
      encodeCover({
        mime: "image/jpeg",
        data: new Uint8Array(MAX_COVER_SIZE + 1),
      }),
    ).toThrow(Mp5SecurityError);
  });

  it("LYRC unsynced lyrics roundtrip", () => {
    const optional = new Map([
      [
        "LYRC",
        encodeLyrc({
          unsynced: "Line one\nLine two",
          source: "embedded",
        }),
      ],
    ]);
    const buf = minimalMp5({ optional });
    const p = parseMp5(buf);
    const ly = decodeLyrc(p.optional.get("LYRC"));
    expect(ly?.unsynced).toContain("Line one");
    expect(ly?.source).toBe("embedded");
  });

  it("EXPL content warning roundtrip", () => {
    const optional = new Map([
      [
        "EXPL",
        encodeExpl({
          explicit: true,
          strongLanguage: true,
          warningSource: "artist",
          aiGenerated: false,
        }),
      ],
    ]);
    const buf = minimalMp5({ optional });
    const p = parseMp5(buf);
    const expl = decodeExpl(p.optional.get("EXPL"));
    expect(expl?.explicit).toBe(true);
    expect(expl?.strongLanguage).toBe(true);
    expect(expl?.warningSource).toBe("artist");
  });

  it("SAFE / SENS / RECV optional chunks roundtrip", () => {
    const optional = new Map([
      ["SAFE", encodeSafe({ tags: ["emotional"], griefThemes: true, warningSource: "user" })],
      ["SENS", encodeSens({ suddenLoudSounds: true, warningSource: "user" })],
      [
        "RECV",
        encodeRecv({
          groundingFriendly: true,
          drugReferences: true,
          warningSource: "user",
        }),
      ],
    ]);
    const buf = minimalMp5({ optional });
    const chunks = parseOptionalMetadata(parseMp5(buf).optional);
    expect(chunks.safe?.tags).toContain("emotional");
    expect(chunks.sens?.suddenLoudSounds).toBe(true);
    expect(chunks.recv?.groundingFriendly).toBe(true);
  });

  it("MOOD and VIBE tags roundtrip", () => {
    const optional = new Map([
      ["MOOD", encodeMood({ tags: ["calm", "hopeful"], source: "user" })],
      ["VIBE", encodeVibe({ tags: ["focus", "sleep"], source: "user" })],
    ]);
    const buf = minimalMp5({ optional });
    const p = parseMp5(buf);
    expect(decodeMood(p.optional.get("MOOD"))?.tags).toEqual(["calm", "hopeful"]);
    expect(decodeVibe(p.optional.get("VIBE"))?.tags).toEqual(["focus", "sleep"]);
  });

  it("WAVE chunk roundtrip with peak/RMS in META", () => {
    const waveform = [0, 0.25, 0.5, 0.75, 1];
    const meta = metaFieldsFromRecord({
      title: "Wave",
      waveform_peak: "0.990000",
      waveform_rms: "0.450000",
    });
    const buf = minimalMp5({ waveform, meta });
    const p = parseMp5(buf);
    expect(p.waveform).toHaveLength(5);
    expect(getMetaValue(p.meta, "waveform_peak")).toBe("0.990000");
    expect(getMetaValue(p.meta, "waveform_rms")).toBe("0.450000");
  });

  it("missing metadata does not break parse/playback structure", () => {
    const buf = minimalMp5();
    const p = parseMp5(buf);
    expect(p.audioFrames.length).toBeGreaterThan(0);
    expect(p.meta).toEqual([]);
    expect(p.coverArt).toBeUndefined();
    expect(p.waveform).toEqual([]);
    expect(p.optional.size).toBe(0);
  });

  it("unknown optional chunks are preserved", () => {
    const optional = new Map([["FUTR", new TextEncoder().encode('{"x":1}')]]);
    const buf = minimalMp5({ optional });
    expect(parseMp5(buf).optional.get("FUTR")).toBeDefined();
  });

  it("malformed EXPL JSON returns null safely", () => {
    const optional = new Map([["EXPL", new TextEncoder().encode("{not json")]]);
    expect(decodeExpl(optional.get("EXPL"))).toBeNull();
    expect(() => parseOptionalMetadata(optional)).not.toThrow();
  });

  it("sanitizes control characters from text metadata", () => {
    const dirty = "Hello\x00\x07World";
    expect(sanitizeMetadata(dirty)).toBe("HelloWorld");
    const fields = metaFieldsFromRecord({ title: dirty });
    expect(fields[0]?.value).toBe("HelloWorld");
  });

  it("parseOptionalMetadata survives corrupt optional map", () => {
    const huge = new Uint8Array(128 * 1024);
    const optional = new Map([["LYRC", huge]]);
    expect(() => parseOptionalMetadata(optional)).not.toThrow();
  });
});
