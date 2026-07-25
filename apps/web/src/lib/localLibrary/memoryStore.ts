import type { LocalLibraryEntry, LocalLibraryRecord } from "./types";

/** In-memory library store for unit tests and environments without IndexedDB. */
export class MemoryLibraryStore {
  private meta = new Map<string, LocalLibraryRecord>();
  private blobs = new Map<string, ArrayBuffer>();

  async listMeta(): Promise<LocalLibraryRecord[]> {
    return [...this.meta.values()].sort((a, b) => b.importedAt - a.importedAt);
  }

  async listRecords(): Promise<LocalLibraryRecord[]> {
    return this.listMeta();
  }

  async getEntry(id: string): Promise<LocalLibraryEntry | null> {
    const record = this.meta.get(id);
    const data = this.blobs.get(id);
    if (!record || !data) return null;
    return { ...record, data };
  }

  async putEntry(entry: LocalLibraryEntry): Promise<void> {
    const { data, ...record } = entry;
    this.meta.set(entry.id, record);
    this.blobs.set(entry.id, data);
  }

  async deleteEntry(id: string): Promise<void> {
    this.meta.delete(id);
    this.blobs.delete(id);
  }

  async clearAll(): Promise<void> {
    this.meta.clear();
    this.blobs.clear();
  }

  async totalBytes(): Promise<number> {
    let sum = 0;
    for (const e of this.meta.values()) {
      sum += e.fileSize;
    }
    return sum;
  }
}
