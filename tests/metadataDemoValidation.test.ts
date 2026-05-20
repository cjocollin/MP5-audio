import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import {
  CodecId,
  decodeCover,
  decodeExpl,
  decodeLyrc,
  decodeMood,
  decodeRecv,
  decodeSafe,
  decodeSens,
  decodeVibe,
  getMetaValue,
  parseMp5,
  parseOptionalMetadata,
  writeMp5,
} from "@mp5/container";
import { buildExportMetadataBundle } from "../apps/web/src/converter/buildExportBundles";
import { buildOverridesFromEdits, manualEditsFromSource } from "../apps/web/src/converter/manualMetadata";

const ORIGAMI_FLAC = "C:\\Users\\colli\\OneDrive\\Desktop\\- ORIGAMI!.flac";

describe("metadata demo validation", () => {
  it("rich manual metadata export parses and displays all chunk types", () => {
    const pngCover = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);

    const extracted = {
      meta: {
        title: "Detected Demo Track",
        artist: "Detected Artist",
        album: "Detected Album",
      },
      cover: { mime: "image/png", data: pngCover },
      lyrics: { unsynced: "Detected line", source: "embedded" },
    };

    const edits = manualEditsFromSource(extracted);
    edits.meta.title = "User Demo Title";
    edits.meta.artist = "User Demo Artist";
    edits.lyricsUnsynced = "User demo lyrics\nLine two";
    edits.lyricsSource = "user";
    edits.expl.explicit = true;
    edits.moodTags = "calm, hopeful";
    edits.vibeTags = "focus, grounding";
    edits.safe.griefThemes = true;
    edits.safe.intenseEmotional = true;
    edits.sens.suddenLoudSounds = true;
    edits.specializedProfile = "haven";
    edits.havenProfile.groundingFriendly = true;

    const bundle = buildExportMetadataBundle(extracted, buildOverridesFromEdits(edits), {
      peak: 0.85,
      rms: 0.42,
    });

    const pcm = new Int16Array(480);
    const buf = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 48000,
        totalSamples: BigInt(pcm.length),
        encoderVersion: 1,
      },
      meta: bundle.metaFields,
      cover: bundle.cover,
      optional: bundle.optional,
      waveform: [0, 0.25, 0.5, 0.75],
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(pcm.buffer) }],
    });

    const p = parseMp5(buf);
    const chunks = parseOptionalMetadata(p.optional);

    expect(getMetaValue(p.meta, "title")).toBe("User Demo Title");
    expect(getMetaValue(p.meta, "artist")).toBe("User Demo Artist");
    expect(p.coverArt?.mime).toBe("image/png");
    expect(decodeCover(p.cover)?.data.length).toBeGreaterThan(0);
    expect(decodeLyrc(p.optional.get("LYRC"))?.unsynced).toContain("User demo");
    expect(decodeExpl(p.optional.get("EXPL"))?.explicit).toBe(true);
    expect(decodeExpl(p.optional.get("EXPL"))?.warningSource).toBe("user");
    expect(decodeMood(p.optional.get("MOOD"))?.tags).toContain("hopeful");
    expect(decodeVibe(p.optional.get("VIBE"))?.tags).toContain("grounding");
    expect(chunks.safe?.warningSource).toBe("user");
    expect(chunks.safe?.tags).toContain("intense emotional content");
    expect(chunks.sens?.suddenLoudSounds).toBe(true);
    expect(chunks.recv?.groundingFriendly).toBe(true);
    expect(p.waveform.length).toBeGreaterThan(0);
    expect(p.seek.length).toBeGreaterThan(0);
    expect(p.audioFrames[0]?.data.length).toBeGreaterThan(0);
  });

  it("reports local ORIGAMI FLAC availability for UI demo", () => {
    if (existsSync(ORIGAMI_FLAC)) {
      expect(existsSync(ORIGAMI_FLAC)).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });
});
