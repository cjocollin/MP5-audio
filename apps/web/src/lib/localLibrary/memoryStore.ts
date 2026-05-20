import type { LocalLibraryEntry, LocalLibraryRecord } from "./types";

/** In-memory library store for unit tests and environments without IndexedDB. */
export class MemoryLibraryStore {
  private records = new Map<string, LocalLibraryEntry>();

  async listRecords(): Promise<LocalLibraryRecord[]> {
    return [...this.records.values()]
      .map(({ data: _d, ...rec }) => rec)
      .sort((a, b) => b.importedAt - a.importedAt);
  }

  async getEntry(id: string): Promise<LocalLibraryEntry | null> {
    return this.records.get(id) ?? null;
  }

  async putEntry(entry: LocalLibraryEntry): Promise<void> {
    this.records.set(entry.id, entry);
  }

  async deleteEntry(id: string): Promise<void> {
    this.records.delete(id);
  }

  async clearAll(): Promise<void> {
    this.records.clear();
  }

  async totalBytes(): Promise<number> {
    let sum = 0;
    for (const e of this.records.values()) {
      sum += e.fileSize;
    }
    return sum;
  }
}
