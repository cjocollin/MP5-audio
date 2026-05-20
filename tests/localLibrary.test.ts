import { describe, it, expect, beforeEach } from "vitest";
import {
  CodecId,
  encodeExpl,
  encodeMood,
  encodeVibe,
  metaFieldsFromRecord,
  writeMp5,
} from "@mp5/container";
import {
  clearLocalLibrary,
  deleteLibraryEntry,
  listLibraryRecords,
  loadLibraryEntry,
  saveMp5ToLibrary,
} from "../apps/web/src/lib/localLibrary/api";
import { LibraryStorageError } from "../apps/web/src/lib/localLibrary/errors";
import { parseForLibrary } from "../apps/web/src/lib/localLibrary/metadataSummary";
import { filterLibraryRecords, matchesLibrarySearch } from "../apps/web/src/lib/localLibrary/search";
import { MemoryLibraryStore } from "../apps/web/src/lib/localLibrary/memoryStore";
import { resetLibraryStore, setLibraryStoreForTests } from "../apps/web/src/lib/localLibrary/store";
import { decodeMp5ToPcm } from "../apps/web/src/player/decodeMp5";

function minimalMp5(extra?: Parameters<typeof writeMp5>[0]) {
  return writeMp5({
    head: {
      codecId: CodecId.PCM,
      channels: 1,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: 48000,
      totalSamples: 48000n,
      encoderVersion: 1,
    },
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(96000) }],
    ...extra,
  });
}

function fileFromBuffer(name: string, buf: Uint8Array): File {
  return new File([buf], name, { type: "application/octet-stream" });
}

describe("local library metadata summary", () => {
  it("extracts title artist album mood vibe and content guidance", () => {
    const optional = new Map([
      ["EXPL", encodeExpl({ explicit: true, warningSource: "user" })],
      ["MOOD", encodeMood({ tags: ["calm"], source: "user" })],
      ["VIBE", encodeVibe({ tags: ["focus"], source: "user" })],
    ]);
    const buf = minimalMp5({
      meta: metaFieldsFromRecord({
        title: "Tagged",
        artist: "Meta Artist",
        album: "Meta Album",
        genre: "Ambient",
      }),
      optional,
    });
    const parsed = parseForLibrary(buf.buffer, "tagged.mp5");
    expect(parsed.summary.title).toBe("Tagged");
    expect(parsed.summary.artist).toBe("Meta Artist");
    expect(parsed.summary.hasContentGuidance).toBe(true);
    expect(parsed.summary.moodTags).toContain("calm");
    expect(parsed.summary.vibeTags).toContain("focus");
    expect(parsed.summary.codecLabel).toContain("PCM");
  });

  it("marks corrupt files with parse error without throwing", () => {
    const corrupt = new Uint8Array([0, 1, 2, 3]);
    const parsed = parseForLibrary(corrupt.buffer, "bad.mp5");
    expect(parsed.parseError).toBeTruthy();
    expect(parsed.summary.parseError).toBeTruthy();
  });
});

describe("local library storage", () => {
  beforeEach(async () => {
    resetLibraryStore();
    setLibraryStoreForTests(new MemoryLibraryStore());
    await clearLocalLibrary();
  });

  it("saves and loads MP5 file to library", async () => {
    const buf = minimalMp5({
      meta: metaFieldsFromRecord({ title: "Saved Track", artist: "Lib Artist" }),
    });
    const file = fileFromBuffer("saved.mp5", buf);
    const { record, duplicate } = await saveMp5ToLibrary(file, file.name);
    expect(duplicate).toBe(false);
    expect(record.filename).toBe("saved.mp5");
    expect(record.summary.title).toBe("Saved Track");

    const list = await listLibraryRecords();
    expect(list).toHaveLength(1);

    const entry = await loadLibraryEntry(record.id);
    expect(entry?.data.byteLength).toBe(buf.byteLength);
  });

  it("detects duplicate saves by filename and size", async () => {
    const file = fileFromBuffer("dup.mp5", minimalMp5());
    await saveMp5ToLibrary(file, file.name);
    const second = await saveMp5ToLibrary(file, file.name);
    expect(second.duplicate).toBe(true);
    expect((await listLibraryRecords()).length).toBe(1);
  });

  it("deletes a library item", async () => {
    const { record } = await saveMp5ToLibrary(fileFromBuffer("del.mp5", minimalMp5()), "del.mp5");
    await deleteLibraryEntry(record.id);
    expect(await listLibraryRecords()).toHaveLength(0);
    expect(await loadLibraryEntry(record.id)).toBeNull();
  });

  it("clears the library", async () => {
    await saveMp5ToLibrary(fileFromBuffer("a.mp5", minimalMp5()), "a.mp5");
    await saveMp5ToLibrary(fileFromBuffer("b.mp5", minimalMp5()), "b.mp5");
    await clearLocalLibrary();
    expect(await listLibraryRecords()).toHaveLength(0);
  });

  it("filters library by search and codec", async () => {
    const l = await saveMp5ToLibrary(
      fileFromBuffer(
        "lossless.mp5",
        minimalMp5({
          head: {
            codecId: CodecId.MP5L,
            channels: 1,
            bitsPerSample: 16,
            presetId: 0,
            sampleRate: 48000,
            totalSamples: 48000n,
            encoderVersion: 1,
          },
          audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(4) }],
          meta: metaFieldsFromRecord({ title: "Lossless One", artist: "Alpha" }),
        }),
      ),
      "lossless.mp5",
    );
    await saveMp5ToLibrary(
      fileFromBuffer(
        "pcm.mp5",
        minimalMp5({
          meta: metaFieldsFromRecord({ title: "PCM Two", artist: "Beta", genre: "Jazz" }),
        }),
      ),
      "pcm.mp5",
    );

    const records = await listLibraryRecords();
    expect(
      filterLibraryRecords(records, {
        query: "alpha",
        codec: "all",
        contentGuidanceOnly: false,
        hasCoverOnly: false,
        hasLyricsOnly: false,
      }),
    ).toHaveLength(1);
    expect(
      filterLibraryRecords(records, {
        query: "",
        codec: "mp5l",
        contentGuidanceOnly: false,
        hasCoverOnly: false,
        hasLyricsOnly: false,
      }).some((r) => r.id === l.record.id),
    ).toBe(true);
    expect(
      matchesLibrarySearch(records[0]!, {
        query: "jazz",
        codec: "all",
        contentGuidanceOnly: false,
        hasCoverOnly: false,
        hasLyricsOnly: false,
      }),
    ).toBe(true);
  });

  it("rejects unreadable save when allowUnreadable is false", async () => {
    const corrupt = fileFromBuffer("x.mp5", new Uint8Array([1, 2, 3]));
    await expect(saveMp5ToLibrary(corrupt, corrupt.name)).rejects.toBeInstanceOf(LibraryStorageError);
    await expect(
      saveMp5ToLibrary(corrupt, corrupt.name, { allowUnreadable: true }),
    ).resolves.toBeDefined();
  });

  it("saved library entry decodes for PCM playback", async () => {
    const buf = minimalMp5({
      meta: metaFieldsFromRecord({ title: "Playable", artist: "Test" }),
    });
    const { record } = await saveMp5ToLibrary(buf.buffer, "playable.mp5");
    const entry = await loadLibraryEntry(record.id);
    expect(entry).not.toBeNull();
    if (entry) {
      const decoded = await decodeMp5ToPcm(entry.data);
      expect(decoded.sampleRate).toBe(48000);
      expect(record.summary.codecLabel).toContain("PCM");
    }
  });
});
