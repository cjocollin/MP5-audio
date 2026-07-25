/** Module-level MP5 output bytes - not held in React queue item state. */
const cache = new Map<string, Uint8Array>();

export function setBatchOutput(id: string, bytes: Uint8Array): void {
  cache.set(id, bytes);
}

export function getBatchOutput(id: string): Uint8Array | undefined {
  return cache.get(id);
}

export function hasBatchOutput(id: string): boolean {
  return cache.has(id);
}

export function deleteBatchOutput(id: string): void {
  cache.delete(id);
}

export function deleteBatchOutputs(ids: Iterable<string>): void {
  for (const id of ids) cache.delete(id);
}

/** Test helper - clears all retained batch outputs. */
export function clearBatchOutputCache(): void {
  cache.clear();
}

export function batchOutputCacheSize(): number {
  return cache.size;
}
