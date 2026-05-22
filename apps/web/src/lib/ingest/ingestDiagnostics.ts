import type { IntegrityCheckStatus } from "@mp5/container";

export type IngestModeLabel = "eager" | "lazy-indexed";

export interface IngestDiagnosticsSnapshot {
  ingestMode: IngestModeLabel;
  fileSizeBytes: number;
  chunkCount: number;
  stdfIndexed: number;
  stdfLoaded: number;
  loadedBinaryMb: number;
  audiLoaded: boolean;
  integrityStatus: IntegrityCheckStatus | "pending" | "—";
  scanMs: number | null;
  readyMixMs: number | null;
}

let snapshot: IngestDiagnosticsSnapshot = {
  ingestMode: "eager",
  fileSizeBytes: 0,
  chunkCount: 0,
  stdfIndexed: 0,
  stdfLoaded: 0,
  loadedBinaryMb: 0,
  audiLoaded: false,
  integrityStatus: "—",
  scanMs: null,
  readyMixMs: null,
};

export function resetIngestDiagnostics(): void {
  snapshot = {
    ingestMode: "eager",
    fileSizeBytes: 0,
    chunkCount: 0,
    stdfIndexed: 0,
    stdfLoaded: 0,
    loadedBinaryMb: 0,
    audiLoaded: false,
    integrityStatus: "—",
    scanMs: null,
    readyMixMs: null,
  };
}

export function updateIngestDiagnostics(partial: Partial<IngestDiagnosticsSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
}

export function recordStdfFragmentLoaded(): void {
  snapshot = { ...snapshot, stdfLoaded: snapshot.stdfLoaded + 1 };
}

export function getIngestDiagnostics(): IngestDiagnosticsSnapshot {
  return { ...snapshot };
}
