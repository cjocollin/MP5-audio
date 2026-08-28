import {
  parseMp5,
  verifyEmbeddedPackageIntegrityAsync,
} from "@mp5/container";

import { listLibraryRecords, loadLibraryEntry } from "./api";
import { listSavedAlbums, savedAlbumToFile, type SavedAlbumPackage } from "./albumLibrary";
import {
  listSavedEmbeddedAlbums,
  type SavedEmbeddedAlbumPackage,
} from "./embeddedAlbumLibrary";
import type { LocalLibraryEntry, LocalLibraryRecord } from "./types";
import { computeManifestMissingRefs } from "./unifiedLibrary";

export interface LibraryVerificationIssue {
  kind: "track" | "manifest" | "embedded";
  name: string;
  message: string;
}

export interface LibraryVerificationReport {
  checked: number;
  healthy: number;
  issues: LibraryVerificationIssue[];
}

interface LibrarySnapshot {
  records: LocalLibraryRecord[];
  entries: Map<string, LocalLibraryEntry | null>;
  manifests: SavedAlbumPackage[];
  embedded: SavedEmbeddedAlbumPackage[];
}

export interface LibraryBackupWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

export interface LibraryBackupFileHandle {
  createWritable(): Promise<LibraryBackupWritable>;
}

export interface LibraryBackupDirectory {
  getDirectoryHandle(name: string, options: { create: true }): Promise<LibraryBackupDirectory>;
  getFileHandle(name: string, options: { create: true }): Promise<LibraryBackupFileHandle>;
}

async function loadLibrarySnapshot(): Promise<LibrarySnapshot> {
  const records = await listLibraryRecords();
  const loaded = await Promise.all(records.map(async (record) => [
    record.id,
    await loadLibraryEntry(record.id),
  ] as const));
  return {
    records,
    entries: new Map(loaded),
    manifests: listSavedAlbums(),
    embedded: listSavedEmbeddedAlbums(),
  };
}

function issue(
  issues: LibraryVerificationIssue[],
  kind: LibraryVerificationIssue["kind"],
  name: string,
  cause: unknown,
) {
  issues.push({
    kind,
    name,
    message: cause instanceof Error ? cause.message : String(cause),
  });
}

export async function verifyLibrarySnapshot(snapshot: LibrarySnapshot): Promise<LibraryVerificationReport> {
  const issues: LibraryVerificationIssue[] = [];
  const embeddedBlobIds = new Set(snapshot.embedded.map((album) => album.blobEntryId));
  const verifiedRecords: LocalLibraryRecord[] = [];
  let checked = 0;
  let healthy = 0;

  for (const record of snapshot.records) {
    if (embeddedBlobIds.has(record.id)) continue;
    checked += 1;
    const entry = snapshot.entries.get(record.id);
    if (!entry) {
      issue(issues, "track", record.filename, "Stored file bytes are missing.");
      verifiedRecords.push({ ...record, summary: { ...record.summary, parseError: "Missing bytes" } });
      continue;
    }
    try {
      if (record.summary.codecLabel === "embedded .mp5p") {
        const report = await verifyEmbeddedPackageIntegrityAsync(new Uint8Array(entry.data), {
          verifyTrackHashes: true,
        });
        if (!report.valid) throw new Error(report.issues[0]?.message ?? "Package integrity failed.");
      } else {
        parseMp5(entry.data);
        verifiedRecords.push(record);
      }
      healthy += 1;
    } catch (cause) {
      issue(
        issues,
        record.summary.codecLabel === "embedded .mp5p" ? "embedded" : "track",
        record.filename,
        cause,
      );
      verifiedRecords.push({ ...record, summary: { ...record.summary, parseError: "Integrity failed" } });
    }
  }

  for (const album of snapshot.manifests) {
    checked += 1;
    try {
      const missing = computeManifestMissingRefs(album, verifiedRecords);
      if (missing.length) throw new Error(`Missing or unreadable sidecars: ${missing.join(", ")}`);
      healthy += 1;
    } catch (cause) {
      issue(issues, "manifest", album.name, cause);
    }
  }

  for (const album of snapshot.embedded) {
    checked += 1;
    const entry = snapshot.entries.get(album.blobEntryId);
    if (!entry) {
      issue(issues, "embedded", album.name, "Stored package bytes are missing.");
      continue;
    }
    const report = await verifyEmbeddedPackageIntegrityAsync(new Uint8Array(entry.data), {
      verifyTrackHashes: true,
    });
    if (report.valid) healthy += 1;
    else issue(issues, "embedded", album.name, report.issues[0]?.message ?? "Package integrity failed.");
  }

  return { checked, healthy, issues };
}

export async function verifySavedLibrary(): Promise<LibraryVerificationReport> {
  return verifyLibrarySnapshot(await loadLibrarySnapshot());
}

export function uniqueBackupFiles(files: File[]): File[] {
  const used = new Set<string>();
  return files.map((file) => {
    const cleaned = file.name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "") || "MP5 file";
    const dot = cleaned.lastIndexOf(".");
    const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
    const extension = dot > 0 ? cleaned.slice(dot) : "";
    let name = cleaned;
    for (let copy = 2; used.has(name.toLowerCase()); copy += 1) {
      name = `${stem} (${copy})${extension}`;
    }
    used.add(name.toLowerCase());
    return name === file.name
      ? file
      : new File([file], name, { type: file.type, lastModified: file.lastModified });
  });
}

export async function collectLibraryBackupFiles(): Promise<File[]> {
  const snapshot = await loadLibrarySnapshot();
  const embeddedBlobIds = new Set(snapshot.embedded.map((album) => album.blobEntryId));
  const files: File[] = [];
  for (const record of snapshot.records) {
    if (embeddedBlobIds.has(record.id)) continue;
    const entry = snapshot.entries.get(record.id);
    if (!entry) throw new Error(`Cannot back up ${record.filename}: stored bytes are missing.`);
    files.push(new File([entry.data], entry.filename, { type: "audio/mp5" }));
  }
  files.push(...snapshot.manifests.map(savedAlbumToFile));
  for (const album of snapshot.embedded) {
    const entry = snapshot.entries.get(album.blobEntryId);
    if (!entry) throw new Error(`Cannot back up ${album.name}: stored package bytes are missing.`);
    files.push(new File([entry.data], album.name, { type: "application/octet-stream" }));
  }
  return uniqueBackupFiles(files);
}

export async function writeLibraryBackupFiles(
  root: LibraryBackupDirectory,
  files: File[],
  folderName: string,
): Promise<number> {
  const destination = await root.getDirectoryHandle(folderName, { create: true });
  for (const file of files) {
    const handle = await destination.getFileHandle(file.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  }
  return files.length;
}

export async function backupSavedLibrary(root: LibraryBackupDirectory): Promise<number> {
  const files = await collectLibraryBackupFiles();
  if (!files.length) return 0;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return writeLibraryBackupFiles(root, files, `MP5 Library Backup ${timestamp}`);
}
