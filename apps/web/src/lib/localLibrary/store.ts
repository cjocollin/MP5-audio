import { IndexedDbLibraryStore } from "./indexedDbStore";
import { MemoryLibraryStore } from "./memoryStore";
import type { LocalLibraryEntry, LocalLibraryRecord } from "./types";

export interface LibraryStore {
  listRecords(): Promise<LocalLibraryRecord[]>;
  getEntry(id: string): Promise<LocalLibraryEntry | null>;
  putEntry(entry: LocalLibraryEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  clearAll(): Promise<void>;
  totalBytes(): Promise<number>;
}

let activeStore: LibraryStore | null = null;
let testOverride: LibraryStore | null = null;

export function getLibraryStore(): LibraryStore {
  if (testOverride) return testOverride;
  if (!activeStore) {
    activeStore =
      typeof indexedDB !== "undefined" ? new IndexedDbLibraryStore() : new MemoryLibraryStore();
  }
  return activeStore;
}

/** Reset store singleton (e.g. after tests). */
export function resetLibraryStore(): void {
  activeStore = null;
  testOverride = null;
}

export function setLibraryStoreForTests(store: LibraryStore | null): void {
  testOverride = store;
}
