import { LibraryStorageError, isQuotaExceededError } from "./errors";
import type { LocalLibraryEntry, LocalLibraryRecord } from "./types";

const DB_NAME = "mp5-local-library";
const DB_VERSION = 1;
const STORE = "tracks";

export interface StoredTrackRow {
  id: string;
  filename: string;
  importedAt: number;
  fileSize: number;
  summary: LocalLibraryRecord["summary"];
  coverThumbnail?: Uint8Array;
  coverMime?: string;
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
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("importedAt", "importedAt", { unique: false });
        store.createIndex("filename", "filename", { unique: false });
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

export class IndexedDbLibraryStore {
  async listRecords(): Promise<LocalLibraryRecord[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredTrackRow[]) ?? [];
        const records: LocalLibraryRecord[] = rows
          .map((row) => ({
            id: row.id,
            filename: row.filename,
            importedAt: row.importedAt,
            fileSize: row.fileSize,
            summary: row.summary,
            coverThumbnail: row.coverThumbnail,
            coverMime: row.coverMime,
          }))
          .sort((a, b) => b.importedAt - a.importedAt);
        db.close();
        resolve(records);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }

  async getEntry(id: string): Promise<LocalLibraryEntry | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        const row = req.result as StoredTrackRow | undefined;
        db.close();
        if (!row) {
          resolve(null);
          return;
        }
        resolve({
          id: row.id,
          filename: row.filename,
          importedAt: row.importedAt,
          fileSize: row.fileSize,
          summary: row.summary,
          coverThumbnail: row.coverThumbnail,
          coverMime: row.coverMime,
          data: row.data,
        });
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }

  async putEntry(entry: LocalLibraryEntry): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const row: StoredTrackRow = {
      id: entry.id,
      filename: entry.filename,
      importedAt: entry.importedAt,
      fileSize: entry.fileSize,
      summary: entry.summary,
      coverThumbnail: entry.coverThumbnail,
      coverMime: entry.coverMime,
      data: entry.data,
    };
    tx.objectStore(STORE).put(row);
    try {
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async deleteEntry(id: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    try {
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async clearAll(): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    try {
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async totalBytes(): Promise<number> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredTrackRow[]) ?? [];
        db.close();
        resolve(rows.reduce((sum, r) => sum + (r.fileSize ?? 0), 0));
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }
}
