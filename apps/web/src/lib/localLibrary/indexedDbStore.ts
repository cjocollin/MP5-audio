import { LibraryStorageError, isQuotaExceededError } from "./errors";
import type { LocalLibraryEntry, LocalLibraryRecord } from "./types";

const DB_NAME = "mp5-local-library";
const DB_VERSION = 2;
const STORE_V1 = "tracks";
const STORE_META = "tracks_meta";
const STORE_BLOB = "tracks_blob";

/** Meta-only row — list/stats never load ArrayBuffer payloads. */
export interface StoredTrackMetaRow {
  id: string;
  filename: string;
  importedAt: number;
  fileSize: number;
  summary: LocalLibraryRecord["summary"];
  coverThumbnail?: Uint8Array;
  coverMime?: string;
}

export interface StoredTrackBlobRow {
  id: string;
  data: ArrayBuffer;
}

/** Legacy v1 combined row (migration only). */
interface StoredTrackRowV1 extends StoredTrackMetaRow {
  data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new LibraryStorageError("IndexedDB is not available in this environment.", "unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new LibraryStorageError("Could not open library database."));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction!;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(STORE_META)) {
        const meta = db.createObjectStore(STORE_META, { keyPath: "id" });
        meta.createIndex("importedAt", "importedAt", { unique: false });
        meta.createIndex("filename", "filename", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BLOB)) {
        db.createObjectStore(STORE_BLOB, { keyPath: "id" });
      }

      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_V1)) {
        const legacy = tx.objectStore(STORE_V1);
        const metaStore = tx.objectStore(STORE_META);
        const blobStore = tx.objectStore(STORE_BLOB);
        const getAllReq = legacy.getAll();
        getAllReq.onsuccess = () => {
          const rows = (getAllReq.result as StoredTrackRowV1[]) ?? [];
          for (const row of rows) {
            const meta: StoredTrackMetaRow = {
              id: row.id,
              filename: row.filename,
              importedAt: row.importedAt,
              fileSize: row.fileSize,
              summary: row.summary,
              coverThumbnail: row.coverThumbnail,
              coverMime: row.coverMime,
            };
            metaStore.put(meta);
            blobStore.put({ id: row.id, data: row.data } satisfies StoredTrackBlobRow);
          }
          db.deleteObjectStore(STORE_V1);
        };
      }
    };
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      const err = tx.error;
      if (isQuotaExceededError(err)) {
        reject(
          new LibraryStorageError(
            "Not enough browser storage to save. Remove older library items or free disk space in your browser settings.",
            "quota",
          ),
        );
      } else {
        reject(err ?? new LibraryStorageError("Library storage transaction failed."));
      }
    };
    tx.onabort = () => reject(tx.error ?? new LibraryStorageError("Library storage transaction aborted."));
  });
}

function metaToRecord(row: StoredTrackMetaRow): LocalLibraryRecord {
  return {
    id: row.id,
    filename: row.filename,
    importedAt: row.importedAt,
    fileSize: row.fileSize,
    summary: row.summary,
    coverThumbnail: row.coverThumbnail,
    coverMime: row.coverMime,
  };
}

export class IndexedDbLibraryStore {
  /** List meta only — does not deserialize track ArrayBuffers. */
  async listMeta(): Promise<LocalLibraryRecord[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_META, "readonly");
      const req = tx.objectStore(STORE_META).getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredTrackMetaRow[]) ?? [];
        const records = rows.map(metaToRecord).sort((a, b) => b.importedAt - a.importedAt);
        db.close();
        resolve(records);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }

  async listRecords(): Promise<LocalLibraryRecord[]> {
    return this.listMeta();
  }

  async getEntry(id: string): Promise<LocalLibraryEntry | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_META, STORE_BLOB], "readonly");
      const metaReq = tx.objectStore(STORE_META).get(id);
      const blobReq = tx.objectStore(STORE_BLOB).get(id);
      let meta: StoredTrackMetaRow | undefined;
      let blob: StoredTrackBlobRow | undefined;
      let pending = 2;
      const finish = () => {
        pending -= 1;
        if (pending > 0) return;
        db.close();
        if (!meta || !blob) {
          resolve(null);
          return;
        }
        resolve({
          ...metaToRecord(meta),
          data: blob.data,
        });
      };
      metaReq.onsuccess = () => {
        meta = metaReq.result as StoredTrackMetaRow | undefined;
        finish();
      };
      blobReq.onsuccess = () => {
        blob = blobReq.result as StoredTrackBlobRow | undefined;
        finish();
      };
      metaReq.onerror = () => {
        db.close();
        reject(metaReq.error);
      };
      blobReq.onerror = () => {
        db.close();
        reject(blobReq.error);
      };
    });
  }

  /** Atomic meta + blob write in a single transaction. */
  async putEntry(entry: LocalLibraryEntry): Promise<void> {
    const db = await openDb();
    const tx = db.transaction([STORE_META, STORE_BLOB], "readwrite");
    const meta: StoredTrackMetaRow = {
      id: entry.id,
      filename: entry.filename,
      importedAt: entry.importedAt,
      fileSize: entry.fileSize,
      summary: entry.summary,
      coverThumbnail: entry.coverThumbnail,
      coverMime: entry.coverMime,
    };
    tx.objectStore(STORE_META).put(meta);
    tx.objectStore(STORE_BLOB).put({ id: entry.id, data: entry.data } satisfies StoredTrackBlobRow);
    try {
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async deleteEntry(id: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction([STORE_META, STORE_BLOB], "readwrite");
    tx.objectStore(STORE_META).delete(id);
    tx.objectStore(STORE_BLOB).delete(id);
    try {
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async clearAll(): Promise<void> {
    const db = await openDb();
    const tx = db.transaction([STORE_META, STORE_BLOB], "readwrite");
    tx.objectStore(STORE_META).clear();
    tx.objectStore(STORE_BLOB).clear();
    try {
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async totalBytes(): Promise<number> {
    const records = await this.listMeta();
    return records.reduce((sum, r) => sum + (r.fileSize ?? 0), 0);
  }
}
