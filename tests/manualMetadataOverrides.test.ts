import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CodecId,
  decodeCover,
  decodeExpl,
  decodeLyrc,
  decodeMood,
  decodeVibe,
  getMetaValue,
  parseMp5,
  parseOptionalMetadata,
} from "@mp5/container";
import { buildExportMetadataBundle } from "../apps/web/src/converter/buildExportBundles";
import {
  buildOverridesFromEdits,
  manualEditsFromSource,
  type ManualMetadataEdits,
} from "../apps/web/src/converter/manualMetadata";
import { convertToMp5 } from "../apps/web/src/converter/convertToMp5";

vi.mock("../apps/web/src/wasm/codec", () => ({
  getCodec: vi.fn(async () => ({})),
  isWasmCodecReady: vi.fn(() => false),
  CodecPreset: { Low: 0, Standard: 1, High: 2, Extreme: 3 },
}));

import { isWasmCodecReady } from "../apps/web/src/wasm/codec";

const samples = new Int16Array([0, 1000, -1000, 500, 200, -200]);

const extractedBase = {
  meta: {
    title: "Detected Title",
    artist: "Detected Artist",
    album: "Detected Album",
  },
  cover: {
    mime: "image/jpeg",
    data: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]),
  },
  lyrics: { unsynced: "Detected lyrics", source: "embedded" },
};

function editsWith(partial: Partial<ManualMetadataEdits>): ManualMetadataEdits {
  const base = manualEditsFromSource(extractedBase);
  return { ...base, ...partial, meta: { ...base.meta, ...partial.meta } };
}

describe("manual metadata overrides", () => {
  beforeEach(() => {
    vi.mocked(isWasmCodecReady).mockReturnValue(false);
  });

  it("manual META override roundtrip", async () => {
    const edits = editsWith({
      meta: {
        ...manualEditsFromSource(extractedBase).meta,
        title: "User Title",
        artist: "User Artist",
        album: "",
        albumartist: "",
        genre: "Jazz",
        year: "2024",
        date: "",
        tracknumber: "7",
        discnumber: "",
        composer: "",
        comment: "",
      },
    });
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits));
    const buf = await convertToMp5({
      samples,
      sampleRate: 48000,
      channels: 1,
      codec: "pcm",
      metaFields: bundle.metaFields,
      cover: bundle.cover,
      optional: bundle.optional,
    });
    const p = parseMp5(buf);
    expect(getMetaValue(p.meta, "title")).toBe("User Title");
    expect(getMetaValue(p.meta, "artist")).toBe("User Artist");
    expect(getMetaValue(p.meta, "genre")).toBe("Jazz");
    expect(getMetaValue(p.meta, "album")).toBeUndefined();
    expect(p.audioFrames.length).toBeGreaterThan(0);
  });

  it("manual COVR replace and remove", async () => {
    const replacement = {
      mime: "image/png",
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    };
    const replaceEdits = editsWith({ cover: replacement });
    const replaced = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(replaceEdits));
    expect(replaced.cover?.mime).toBe("image/png");

    const removeEdits = editsWith({ cover: null });
    const removed = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(removeEdits));
    expect(removed.cover).toBeUndefined();

    const buf = await convertToMp5({
      samples,
      sampleRate: 48000,
      channels: 1,
      codec: "pcm",
      cover: removed.cover,
    });
    const p = parseMp5(buf);
    expect(p.coverArt).toBeUndefined();
    expect(decodeCover(p.cover ?? new Uint8Array(0))).toBeNull();
  });

  it("manual LYRC roundtrip", async () => {
    const edits = editsWith({
      lyricsUnsynced: "User written lyrics\nLine 2",
      lyricsSource: "user",
    });
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits));
    const buf = await convertToMp5({
      samples,
      sampleRate: 48000,
      channels: 1,
      codec: "pcm",
      optional: bundle.optional,
    });
    const ly = decodeLyrc(parseMp5(buf).optional.get("LYRC"));
    expect(ly?.unsynced).toContain("User written");
    expect(ly?.source).toBe("user");
  });

  it("manual EXPL warning roundtrip with user source", async () => {
    const edits = editsWith({
      expl: {
        explicit: true,
        cleanVersionAvailable: false,
        strongLanguage: true,
        sexualContent: false,
        violence: false,
        drugReferences: false,
        alcoholReferences: false,
        selfHarmThemes: false,
        traumaThemes: false,
        matureThemes: false,
      },
    });
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits));
    const buf = await convertToMp5({
      samples,
      sampleRate: 48000,
      channels: 1,
      codec: "pcm",
      optional: bundle.optional,
    });
    const expl = decodeExpl(parseMp5(buf).optional.get("EXPL"));
    expect(expl?.explicit).toBe(true);
    expect(expl?.warningSource).toBe("user");
    expect(expl?.aiGenerated).toBe(false);
  });

  it("manual MOOD/VIBE tag roundtrip", async () => {
    const edits = editsWith({ moodTags: "calm, hopeful", vibeTags: "focus, sleep" });
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits));
    const parsed = parseOptionalMetadata(bundle.optional);
    expect(parsed.mood?.tags).toEqual(["calm", "hopeful"]);
    expect(parsed.vibe?.tags).toEqual(["focus", "sleep"]);

    const buf = await convertToMp5({
      samples,
      sampleRate: 48000,
      channels: 1,
      codec: "pcm",
      optional: bundle.optional,
    });
    const p = parseMp5(buf);
    expect(decodeMood(p.optional.get("MOOD"))?.source).toBe("user");
    expect(decodeVibe(p.optional.get("VIBE"))?.tags).toContain("sleep");
  });

  it("export works when all manual fields are empty", async () => {
    const empty = manualEditsFromSource({ meta: { title: "" } });
    empty.meta = {
      title: "",
      artist: "",
      album: "",
      albumartist: "",
      genre: "",
      year: "",
      date: "",
      tracknumber: "",
      discnumber: "",
      composer: "",
      comment: "",
    };
    empty.cover = null;
    const bundle = buildExportMetadataBundle({ meta: {} }, buildOverridesFromEdits(empty));
    const buf = await convertToMp5({
      samples,
      sampleRate: 48000,
      channels: 1,
      codec: "pcm",
      metaFields: bundle.metaFields,
      optional: bundle.optional,
    });
    const p = parseMp5(buf);
    expect(p.head?.codecId).toBe(CodecId.PCM);
    expect(p.meta.length).toBe(0);
    expect(p.optional.size).toBe(0);
    expect(p.audioFrames[0]?.data.length).toBeGreaterThan(0);
  });

  it("manual SAFE/SENS/RECV roundtrip with user source", async () => {
    const base = manualEditsFromSource(extractedBase);
    const edits = {
      ...base,
      safe: {
        griefThemes: true,
        traumaThemes: false,
        intenseEmotional: true,
        distressingThemes: false,
      },
      sens: {
        suddenLoudSounds: true,
        harshFrequencies: false,
        intenseBass: false,
        sensoryOverloadRisk: false,
      },
      specializedProfile: "haven" as const,
      havenProfile: {
        recoverySensitive: false,
        relapseThemes: false,
        cravingTriggers: false,
        groundingFriendly: true,
        panicFriendly: true,
      },
    };
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits));
    expect(bundle.optional.has("SAFE")).toBe(true);
    expect(bundle.optional.has("SENS")).toBe(true);
    expect(bundle.optional.has("RECV")).toBe(true);
    const chunks = parseOptionalMetadata(bundle.optional);
    expect(chunks.safe?.warningSource).toBe("user");
    expect(chunks.safe?.tags).toContain("intense emotional content");
    expect(chunks.sens?.suddenLoudSounds).toBe(true);
    expect(chunks.recv?.groundingFriendly).toBe(true);
  });

  it("metadata editing does not break MP5-L container path structure", async () => {
    const edits = editsWith({
      meta: { ...manualEditsFromSource(extractedBase).meta, title: "Playback Test" },
      moodTags: "energetic",
    });
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits), {
      peak: 0.9,
      rms: 0.4,
    });
    const buf = await convertToMp5({
      samples,
      sampleRate: 48000,
      channels: 1,
      codec: "pcm",
      metaFields: bundle.metaFields,
      cover: bundle.cover,
      optional: bundle.optional,
    });
    const p = parseMp5(buf);
    expect(p.waveform.length).toBeGreaterThan(0);
    expect(getMetaValue(p.meta, "waveform_peak")).toBeDefined();
    expect(p.seek.length).toBeGreaterThan(0);
  });
});
