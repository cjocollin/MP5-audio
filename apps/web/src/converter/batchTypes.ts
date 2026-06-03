/** Per-file status in the batch queue UI. */
export type BatchItemStatus =
  | "pending"
  | "decoding"
  | "metadata"
  | "encoding"
  | "validating"
  | "complete"
  | "failed"
  | "skipped"
  | "cancelled";

export const BATCH_ITEM_STATUS_LABELS: Record<BatchItemStatus, string> = {
  pending: "Pending",
  decoding: "Decoding",
  metadata: "Metadata",
  encoding: "Encoding",
  validating: "Validating",
  complete: "Complete",
  failed: "Failed",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

export interface BatchQueueItem {
  id: string;
  sourceName: string;
  sourceSize: number;
  /** Retained for processing; not serialized. */
  file: File;
  detectedTitle?: string;
  detectedArtist?: string;
  status: BatchItemStatus;
  outputFilename?: string;
  outputBytes?: number;
  errorMessage?: string;
  mp5?: Uint8Array;
  librarySaved?: boolean;
  libraryDuplicate?: boolean;
  librarySkipped?: boolean;
}

export interface BatchProgressSummary {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  cancelled: number;
  pending: number;
  inProgress: number;
  totalOutputBytes: number;
  librarySaves: number;
  libraryDuplicates: number;
}

export const BATCH_CODEC = "mp5l" as const;

export const BATCH_LIMITATIONS = [
  "Batch export uses MP5-L v3 only (default/recommended).",
  "Metadata comes from source tags — edit one file at a time in Single mode for full control.",
  "No ZIP download — download files individually or use Download all (separate files).",
  "Stems, karaoke, sections, and advanced metadata are not applied in batch.",
  "Use Batch album export to build manifest or embedded .mp5p packages from a completed queue.",
] as const;
