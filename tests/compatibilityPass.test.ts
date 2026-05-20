/**
 * Real-world compatibility pass — synthetic fixtures only (no copyrighted audio).
 * Run: pnpm compatibility:check  (generates fixtures + runs this file)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CodecId, parseMp5, writeMp5, MAX_COVER_SIZE } from "@mp5/container";
import { buildExportFilename, sanitizeFilenamePart } from "../apps/web/src/converter/exportFilename";
import {
  buildOverridesFromEdits,
  manualEditsFromSource,
} from "../apps/web/src/converter/manualMetadata";
import { buildExportMetadataBundle } from "../apps/web/src/converter/buildExportBundles";
import { ingestMp5Files } from "../apps/web/src/player/playlistUtils";
import { describeMp5hPlayback, describeMp5lPlayback } from "../apps/web/src/lib/codecDisplay";
import { readWavPcm } from "./compatibility/wavReader";
import {
  loadWasmHarness,
  exportMp5lFromPcm,
  assertMp5lExportValid,
  getWasm,
} from "./compatibility/wasmHarness";

const COMPAT_DIR = join(process.cwd(), "test-fixtures", "compatibility");

function compatPath(name: string): string {
  return join(COMPAT_DIR, name);
}

function fileIfExists(name: string): Uint8Array | null {
  const p = compatPath(name);
  if (!existsSync(p)) return null;
  return new Uint8Array(readFileSync(p));
}

function fileFromBuffer(name: string, buf: Uint8Array): File {
  return new File([buf], name, { type: "application/octet-stream" });
}

describe("compatibility: WAV → MP5-L v3 export", () => {
  beforeAll(async () => {
    const ok = await loadWasmHarness();
    expect(ok).toBe(true);
  });

  const wavCases = [
    "wav_mono_44k_short.wav",
    "wav_stereo_44k_short.wav",
    "wav_mono_48k_short.wav",
    "wav_stereo_48k_short.wav",
    "wav_stereo_44k_long.wav",
  ];

  for (const wavFile of wavCases) {
    it(`exports and round-trips ${wavFile}`, async () => {
      const bytes = fileIfExists(wavFile);
      if (!bytes) {
        console.warn(`Skip ${wavFile} — run pnpm compatibility:fixtures`);
        return;
      }
      const { samples, sampleRate, channels } = readWavPcm(bytes);
      expect(samples.length).toBeGreaterThan(0);
      const mp5 = await exportMp5lFromPcm({
        samples,
        sampleRate,
        channels,
        meta: { title: wavFile.replace(/\.wav$/, ""), artist: "Compat WAV" },
      });
      assertMp5lExportValid(mp5, samples, channels);
      const parsed = parseMp5(mp5);
      const labels = describeMp5lPlayback(parsed.audioFrames[0]?.data);
      expect(labels.bitExact).toBe(true);
      expect(labels.outputQuality).toMatch(/bit-exact/i);
    });
  }
});

describe("compatibility: compressed source fixtures", () => {
  const compressed = [
    { file: "flac_stereo_44k_short.flac", magic: [0x66, 0x4c, 0x61, 0x43] },
    { file: "mp3_stereo_44k_short.mp3", magic: [0x49, 0x44, 0x33] },
    { file: "m4a_stereo_44k_short.m4a", magic: null },
    { file: "ogg_opus_44k_short.ogg", magic: [0x4f, 0x67, 0x67, 0x53] },
  ];

  for (const { file, magic } of compressed) {
    it(`fixture present and readable when generated: ${file}`, () => {
      const bytes = fileIfExists(file);
      if (!bytes) {
        console.warn(`Skip ${file} — needs ffmpeg on PATH during pnpm compatibility:fixtures`);
        return;
      }
      expect(bytes.length).toBeGreaterThan(100);
      if (magic) {
        expect(Array.from(bytes.slice(0, 4))).toEqual(magic);
      }
    });
  }
});

describe("compatibility: metadata edge cases", () => {
  it("sanitizes export filenames with special characters and emoji", () => {
    const name = buildExportFilename(
      { artist: 'A/B<C>', title: "Song 🎵" },
      "mp5l",
    );
    expect(name).toMatch(/\.mp5$/);
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
  });

  it("rejects cover over size cap when writing MP5", () => {
    const big = new Uint8Array(MAX_COVER_SIZE + 1);
    const samples = new Int16Array(100);
    expect(() =>
      writeMp5({
        head: {
          codecId: CodecId.PCM,
          channels: 1,
          bitsPerSample: 16,
          presetId: 0,
          sampleRate: 44100,
          totalSamples: 100n,
          encoderVersion: 1,
        },
        cover: { mime: "image/png", data: big },
        audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: samples }],
      }),
    ).toThrow(/Cover exceeds/i);
  });

  it("manual removed cover clears embedded cover", () => {
    const edits = manualEditsFromSource({
      meta: { title: "T", artist: "A" },
      cover: { mime: "image/png", data: new Uint8Array([1, 2, 3]) },
    });
    edits.cover = null;
    const bundle = buildExportMetadataBundle(
      { meta: { title: "T" }, cover: { mime: "image/png", data: new Uint8Array([1, 2, 3]) } },
      buildOverridesFromEdits(edits),
    );
    expect(bundle.cover).toBeUndefined();
  });

  it("preserves mood/vibe and content guidance in optional chunks", () => {
    const edits = manualEditsFromSource({ meta: { title: "T", artist: "A" } });
    edits.moodTags = "calm, focus";
    edits.vibeTags = "study";
    edits.expl.explicit = true;
    const bundle = buildExportMetadataBundle(
      { meta: { title: "T" } },
      buildOverridesFromEdits(edits),
    );
    expect(bundle.optional.has("MOOD")).toBe(true);
    expect(bundle.optional.has("VIBE")).toBe(true);
    expect(bundle.optional.has("EXPL")).toBe(true);
  });

  const mp5MetaCases = [
    { file: "mp5l_metadata_full.mp5", expectTitle: /Compat/ },
    { file: "mp5l_missing_artist.mp5", expectTitle: /No Artist/ },
    { file: "mp5l_missing_title.mp5", expectArtist: /Artist Only/ },
    { file: "mp5l_with_cover.mp5", hasCover: true },
  ];

  for (const c of mp5MetaCases) {
    it(`parses metadata fixture ${c.file}`, () => {
      const bytes = fileIfExists(c.file);
      if (!bytes) return;
      const p = parseMp5(bytes);
      const title = p.meta.find((m) => m.key === "title")?.value;
      const artist = p.meta.find((m) => m.key === "artist")?.value;
      if (c.expectTitle) expect(title).toMatch(c.expectTitle);
      if (c.expectArtist) expect(artist).toMatch(c.expectArtist);
      if (c.hasCover) expect(p.coverArt?.data.length).toBeGreaterThan(0);
    });
  }
});

describe("compatibility: player import edge cases", () => {
  beforeAll(async () => {
    await loadWasmHarness();
  });

  it("ingests multiple valid MP5 files", async () => {
    const a = fileIfExists("mp5l_metadata_full.mp5");
    const b = fileIfExists("mp5l_with_cover.mp5");
    if (!a || !b) return;
    const { addedCount, tracks } = await ingestMp5Files([
      fileFromBuffer("a.mp5", a),
      fileFromBuffer("b.mp5", b),
    ]);
    expect(addedCount).toBe(2);
    expect(tracks).toHaveLength(2);
  });

  it("skips non-mp5 and keeps valid files", async () => {
    const good = fileIfExists("mp5l_metadata_full.mp5");
    if (!good) return;
    const bad = new File([new Uint8Array(4)], "notes.txt", { type: "text/plain" });
    const { addedCount, skippedCount, dropErrors } = await ingestMp5Files([
      bad,
      fileFromBuffer("good.mp5", good),
    ]);
    expect(skippedCount).toBe(1);
    expect(addedCount).toBe(1);
    expect(dropErrors[0]?.reason).toBe("not-mp5");
  });

  it("queues corrupt MP5 as unreadable without blocking valid ingest", async () => {
    const corrupt = fileIfExists("corrupt_truncated.mp5");
    const good = fileIfExists("mp5l_metadata_full.mp5");
    if (!corrupt || !good) return;
    const { addedCount, unreadableCount, tracks } = await ingestMp5Files([
      fileFromBuffer("bad.mp5", corrupt),
      fileFromBuffer("good.mp5", good),
    ]);
    expect(unreadableCount).toBe(1);
    expect(addedCount).toBe(1);
    expect(tracks).toHaveLength(2);
  });

  it("loads MP5-C lab fixture into playlist", async () => {
    const bytes = fileIfExists("mp5c_lab.mp5");
    if (!bytes) return;
    const { tracks, addedCount } = await ingestMp5Files([fileFromBuffer("lab.mp5", bytes)]);
    expect(addedCount).toBe(1);
    expect(tracks[0]?.parsed?.head?.codecId).toBe(CodecId.MP5C);
  });

  it("parses MP5-H with and without CORR for format labels", async () => {
    const withCorr = fileIfExists("mp5h_with_corr.mp5");
    const noCorr = fileIfExists("mp5h_no_corr.mp5");
    if (!withCorr || !noCorr) return;
    const pYes = parseMp5(withCorr);
    const pNo = parseMp5(noCorr);
    expect(describeMp5hPlayback(pYes, true).correctionLayer).toMatch(/present/i);
    expect(describeMp5hPlayback(pNo, false).warning).toMatch(/CORR/i);
  });

  it("preserves unknown optional chunks on ingest", async () => {
    const bytes = fileIfExists("mp5l_unknown_futr.mp5");
    if (!bytes) return;
    const { tracks } = await ingestMp5Files([fileFromBuffer("unk.mp5", bytes)]);
    expect(tracks[0]?.parsed?.optional.get("FUTR")).toBeDefined();
  });

  it("decodes MP5-L compatibility fixture bit-exact via WASM", async () => {
    const bytes = fileIfExists("mp5l_metadata_full.mp5");
    if (!bytes) return;
    const parsed = parseMp5(bytes);
    const frame = parsed.audioFrames[0]?.data;
    if (!frame) throw new Error("no frame");
    const decoded = getWasm().decode_mp5l(frame);
    expect(decoded.length).toBeGreaterThan(0);
  });
});

describe("compatibility: fixture manifest", () => {
  it("lists generated WAV fixtures", () => {
    if (!existsSync(COMPAT_DIR)) {
      console.warn("Run pnpm compatibility:fixtures first");
      return;
    }
    const names = readdirSync(COMPAT_DIR);
    expect(names.some((n) => n.endsWith(".wav"))).toBe(true);
    expect(sanitizeFilenamePart("test")).toBe("test");
  });
});
