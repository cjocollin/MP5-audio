import { describe, it, expect } from "vitest";
import { CodecId, metaFieldsFromRecord, parseMp5, writeMp5 } from "@mp5/container";
import {
  buildExportFilename,
  sanitizeFilenamePart,
  suggestDuplicateExportFilename,
} from "../apps/web/src/converter/exportFilename";
import { EXPORT_PHASE_LABELS, LOAD_PHASE_LABELS } from "../apps/web/src/converter/exportPipeline";
import { buildExportSummary, formatBytes } from "../apps/web/src/converter/exportSummary";
import { buildExportMetadataBundle } from "../apps/web/src/converter/buildExportBundles";
import { ingestMp5Files, isMp5FileName } from "../apps/web/src/player/playlistUtils";

describe("export filename", () => {
  it("sanitizes invalid characters", () => {
    expect(sanitizeFilenamePart('bad<>:"/\\|?*name')).toBe("bad_________name");
  });

  it("builds Artist - Title.mp5 for MP5-L", () => {
    expect(buildExportFilename({ artist: "A", title: "B" }, "mp5l")).toBe("A - B.mp5");
  });

  it("falls back to source filename", () => {
    expect(buildExportFilename({}, "mp5l", "my_track.flac")).toBe("my_track.mp5");
  });

  it("adds codec variant suffix for non-default exports", () => {
    expect(buildExportFilename({ title: "T" }, "pcm")).toBe("T (PCM reference).mp5");
    expect(buildExportFilename({ title: "T" }, "mp5c")).toBe("T (MP5-C lab).mp5");
  });

  it("suggests duplicate-friendly MP5-L name", () => {
    expect(suggestDuplicateExportFilename("Song.mp5", "mp5l")).toBe("Song (MP5-L v3).mp5");
  });
});

describe("export status labels", () => {
  it("defines load and export phase labels", () => {
    expect(LOAD_PHASE_LABELS.decoding).toContain("Decoding");
    expect(EXPORT_PHASE_LABELS.validating).toContain("Validating");
    expect(EXPORT_PHASE_LABELS.ready).toContain("download");
  });
});

describe("export summary", () => {
  it("reports embedded metadata flags", () => {
    const samples = new Int16Array(44100);
    const buf = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: BigInt(44100),
        encoderVersion: 1,
      },
      meta: metaFieldsFromRecord({ title: "T", artist: "A" }),
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: samples }],
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    });
    const validated = parseMp5(buf);
    const bundle = buildExportMetadataBundle({ meta: { title: "T", artist: "A" } });
    const summary = buildExportSummary({
      filename: "A - T.mp5",
      exportCodec: "mp5l",
      outputBytes: buf.byteLength,
      sourceBytes: 1_000_000,
      bundle,
      validated,
    });
    expect(summary.hasMetaTags).toBe(true);
    expect(summary.hasCoverArt).toBe(false);
    expect(summary.filename).toBe("A - T.mp5");
    expect(formatBytes(summary.outputBytes)).toMatch(/KB|B|MB/);
  });
});

describe("player drop summary", () => {
  it("skips non-mp5 files without adding them", async () => {
    const wav = new File([new Uint8Array(4)], "song.wav", { type: "audio/wav" });
    const { tracks, addedCount, skippedCount, dropErrors } = await ingestMp5Files([wav]);
    expect(tracks).toHaveLength(0);
    expect(addedCount).toBe(0);
    expect(skippedCount).toBe(1);
    expect(dropErrors[0]?.reason).toBe("not-mp5");
  });

  it("recognizes mp5 extension", () => {
    expect(isMp5FileName("x.MP5")).toBe(true);
    expect(isMp5FileName("x.flac")).toBe(false);
  });
});
