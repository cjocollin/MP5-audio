import { decodeFing, fingIdentityKey, parseMp5 } from "@mp5/container";
import { LibraryStorageError } from "./errors";
import { findLibraryDuplicate } from "../fingerprint/duplicates";
import { parseForLibrary } from "./metadataSummary";
import { getLibraryStore } from "./store";
import { deleteSavedAlbum, listSavedAlbums } from "./albumLibrary";
import { deleteSavedEmbeddedAlbum, listSavedEmbeddedAlbums } from "./embeddedAlbumLibrary";
import { clearRecentLibrary } from "./recentLibrary";
import type { LocalLibraryEntry, LocalLibraryRecord, StorageQuotaInfo } from "./types";
import { createRandomId } from "../randomId";

/** Structured save outcome — ok / duplicate / failed (quota still uses LibraryStorageError codes). */
export type LibraryPersistResult =
  | {
      status: "ok";
      ok: true;
      record: LocalLibraryRecord;
      duplicate: false;
    }
  | {
      status: "duplicate";
      ok: true;
      record: LocalLibraryRecord;
      duplicate: true;
      duplicateReason: "fingerprint" | "filename-size";
      skipped?: boolean;
    }
  | {
      status: "failed";
      ok: false;
      message: string;
      errorCode?: LibraryStorageError["code"];
    };

/** @deprecated Use LibraryPersistResult */
export type SaveToLibraryResult = LibraryPersistResult;

export interface SaveToLibraryOptions {
  allowUnreadable?: boolean;
  /** When true, do not write if a duplicate is detected (returns duplicate: true, skipped: true). */
  skipIfDuplicate?: boolean;
}

async function fileToArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

function buildEntry(
  id: string,
  filename: string,
  data: ArrayBuffer,
  parsed: ReturnType<typeof parseForLibrary>,
): LocalLibraryEntry {
  return {
    id,
    filename,
    importedAt: Date.now(),
    fileSize: data.byteLength,
    summary: parsed.summary,
    coverThumbnail: parsed.coverThumbnail,
    coverMime: parsed.coverMime,
    data,
  };
}

function failedFromError(err: unknown): LibraryPersistResult {
  if (err instanceof LibraryStorageError) {
    return { status: "failed", ok: false, message: err.message, errorCode: err.code };
  }
  return {
    status: "failed",
    ok: false,
    message: err instanceof Error ? err.message : "Could not save to library.",
    errorCode: "unknown",
  };
}

/** Save MP5 bytes to the local library. Returns existing record if same filename+size already saved. */
export async function saveMp5ToLibrary(
  source: File | Blob | ArrayBuffer,
  filename: string,
  opts?: SaveToLibraryOptions,
): Promise<LibraryPersistResult> {
  let data: ArrayBuffer;
  try {
    data =
      source instanceof ArrayBuffer ? source.slice(0) : await fileToArrayBuffer(source as File | Blob);
  } catch (err) {
    return failedFromError(err);
  }

  const parsed = parseForLibrary(data, filename);
  if (parsed.parseError && !opts?.allowUnreadable) {
    throw new LibraryStorageError(parsed.parseError);
  }

  const store = getLibraryStore();
  let records: LocalLibraryRecord[];
  try {
    records = await store.listMeta();
  } catch (err) {
    if (err instanceof LibraryStorageError) throw err;
    return failedFromError(err);
  }

  let identityKey = parsed.summary.fingerprintKey;
  if (!identityKey && parsed.parsed) {
    try {
      identityKey = fingIdentityKey(decodeFing(parsed.parsed.optional.get("FING"))) ?? undefined;
    } catch {
      /* optional */
    }
  }
  const dup = findLibraryDuplicate(records, {
    filename,
    fileSize: data.byteLength,
    identityKey,
  });
  if (dup) {
    if (opts?.skipIfDuplicate) {
      return {
        status: "duplicate",
        ok: true,
        record: dup.record,
        duplicate: true,
        duplicateReason: dup.reason,
        skipped: true,
      };
    }
    return {
      status: "duplicate",
      ok: true,
      record: dup.record,
      duplicate: true,
      duplicateReason: dup.reason,
    };
  }

  const id = createRandomId();
  const entry = buildEntry(id, filename, data, parsed);
  try {
    await store.putEntry(entry);
  } catch (err) {
    /* Quota / unavailable keep throwing for existing UI catch patterns. */
    if (err instanceof LibraryStorageError) throw err;
    return failedFromError(err);
  }
  const { data: _d, ...record } = entry;
  return { status: "ok", ok: true, record, duplicate: false };
}

export async function listLibraryRecords(): Promise<LocalLibraryRecord[]> {
  return getLibraryStore().listMeta();
}

export async function loadLibraryEntry(id: string): Promise<LocalLibraryEntry | null> {
  return getLibraryStore().getEntry(id);
}

export async function libraryEntryToFile(entry: LocalLibraryEntry): Promise<File> {
  return new File([entry.data], entry.filename, { type: "audio/mp5" });
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  await getLibraryStore().deleteEntry(id);
}

export async function clearLocalLibrary(): Promise<void> {
  await getLibraryStore().clearAll();
}

/** Clear saved tracks, album manifests, embedded packages, and recents. */
export async function clearAllLibraryData(): Promise<void> {
  await clearLocalLibrary();
  for (const album of listSavedAlbums()) {
    deleteSavedAlbum(album.id);
  }
  for (const album of listSavedEmbeddedAlbums()) {
    deleteSavedEmbeddedAlbum(album.id);
  }
  clearRecentLibrary();
}

export async function getLibraryStorageInfo(): Promise<StorageQuotaInfo> {
  const store = getLibraryStore();
  const usedBytes = await store.totalBytes();

  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      return {
        usedBytes: est.usage ?? usedBytes,
        quotaBytes: est.quota ?? null,
        usageSupported: true,
      };
    } catch {
      /* fall through */
    }
  }

  return { usedBytes, quotaBytes: null, usageSupported: false };
}

/** Re-parse summary for an existing entry (e.g. after container updates). */
export async function refreshLibrarySummary(id: string): Promise<LocalLibraryRecord | null> {
  const entry = await loadLibraryEntry(id);
  if (!entry) return null;
  const parsed = parseForLibrary(entry.data, entry.filename);
  const updated: LocalLibraryEntry = {
    ...entry,
    summary: parsed.summary,
    coverThumbnail: parsed.coverThumbnail,
    coverMime: parsed.coverMime,
  };
  await getLibraryStore().putEntry(updated);
  const { data: _d, ...record } = updated;
  return record;
}

/** Validate stored bytes still parse (for integrity checks). */
export async function validateLibraryEntry(id: string): Promise<boolean> {
  const entry = await loadLibraryEntry(id);
  if (!entry) return false;
  try {
    parseMp5(entry.data);
    return true;
  } catch {
    return false;
  }
}
