import { parseMp5 } from "@mp5/container";
import { LibraryStorageError } from "./errors";
import { parseForLibrary } from "./metadataSummary";
import { getLibraryStore } from "./store";
import type { LocalLibraryEntry, LocalLibraryRecord, StorageQuotaInfo } from "./types";

export interface SaveToLibraryResult {
  record: LocalLibraryRecord;
  duplicate: boolean;
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

/** Save MP5 bytes to the local library. Returns existing record if same filename+size already saved. */
export async function saveMp5ToLibrary(
  source: File | Blob | ArrayBuffer,
  filename: string,
  opts?: { allowUnreadable?: boolean },
): Promise<SaveToLibraryResult> {
  const data =
    source instanceof ArrayBuffer ? source.slice(0) : await fileToArrayBuffer(source as File | Blob);
  const parsed = parseForLibrary(data, filename);

  if (parsed.parseError && !opts?.allowUnreadable) {
    throw new LibraryStorageError(parsed.parseError);
  }

  const store = getLibraryStore();
  const existing = (await store.listRecords()).find(
    (r) => r.filename === filename && r.fileSize === data.byteLength,
  );
  if (existing) {
    return { record: existing, duplicate: true };
  }

  const id = crypto.randomUUID();
  const entry = buildEntry(id, filename, data, parsed);
  try {
    await store.putEntry(entry);
  } catch (err) {
    if (err instanceof LibraryStorageError) throw err;
    throw new LibraryStorageError(
      err instanceof Error ? err.message : "Could not save to library.",
      "unknown",
    );
  }
  const { data: _d, ...record } = entry;
  return { record, duplicate: false };
}

export async function listLibraryRecords(): Promise<LocalLibraryRecord[]> {
  return getLibraryStore().listRecords();
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
