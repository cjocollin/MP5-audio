import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALBUM_MANIFEST_FORMAT,
  CodecId,
  writeMp5,
  type AlbmPackageManifest,
} from "@mp5/container";

import {
  uniqueBackupFiles,
  verifyLibrarySnapshot,
  writeLibraryBackupFiles,
  type LibraryBackupDirectory,
} from "../apps/web/src/lib/localLibrary/librarySafety";
import { parseForLibrary } from "../apps/web/src/lib/localLibrary/metadataSummary";
import type { LocalLibraryEntry } from "../apps/web/src/lib/localLibrary/types";

function trackEntry(id: string, filename: string, bytes: Uint8Array): LocalLibraryEntry {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return {
    id,
    filename,
    importedAt: 1,
    fileSize: bytes.byteLength,
    summary: parseForLibrary(data, filename).summary,
    data,
  };
}

function pcmMp5(): Uint8Array {
  return writeMp5({
    head: {
      codecId: CodecId.PCM,
      channels: 1,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: 48000,
      totalSamples: 1n,
      encoderVersion: 1,
    },
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(2) }],
  });
}

describe("library safety", () => {
  it("reports corrupt stored track bytes", async () => {
    const entry = trackEntry("bad", "bad.mp5", new Uint8Array([1, 2, 3]));
    const report = await verifyLibrarySnapshot({
      records: [entry],
      entries: new Map([[entry.id, entry]]),
      manifests: [],
      embedded: [],
    });
    expect(report.checked).toBe(1);
    expect(report.issues[0]?.name).toBe("bad.mp5");
  });

  it("reports missing manifest sidecars", async () => {
    const manifest: AlbmPackageManifest = {
      format: ALBUM_MANIFEST_FORMAT,
      version: 1,
      album: { title: "Album" },
      tracks: [{ trackId: "one", file: "missing.mp5", trackNumber: 1 }],
    };
    const report = await verifyLibrarySnapshot({
      records: [],
      entries: new Map(),
      manifests: [{ id: "album", name: "album.mp5p", importedAt: 1, manifest }],
      embedded: [],
    });
    expect(report.issues[0]?.message).toContain("missing.mp5");
  });

  it("sanitizes names and preserves duplicate files", () => {
    const files = uniqueBackupFiles([
      new File([pcmMp5()], "same?.mp5"),
      new File([pcmMp5()], "same*.mp5"),
    ]);
    expect(files.map((file) => file.name)).toEqual(["same_.mp5", "same_ (2).mp5"]);
  });

  it("writes every backup file into its own folder", async () => {
    const writes = new Map<string, Blob>();
    const destination = {
      getDirectoryHandle: async () => destination,
      getFileHandle: async (name: string) => ({
        createWritable: async () => ({
          write: async (data: Blob) => { writes.set(name, data); },
          close: async () => undefined,
        }),
      }),
    } as LibraryBackupDirectory;
    const count = await writeLibraryBackupFiles(
      destination,
      [new File(["a"], "a.mp5"), new File(["b"], "b.mp5p")],
      "backup",
    );
    expect(count).toBe(2);
    expect([...writes.keys()]).toEqual(["a.mp5", "b.mp5p"]);
    const panel = readFileSync("apps/web/src/components/LocalLibraryPanel.tsx", "utf8");
    expect(panel).toContain("verifySavedLibrary");
    expect(panel).toContain("showDirectoryPicker");
  });
});
