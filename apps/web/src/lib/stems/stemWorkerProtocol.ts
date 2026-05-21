/** Worker ↔ main thread messages for background stem decode. */

export type StemWorkerTaskPhase =
  | "idle"
  | "init"
  | "loading_fragments"
  | "reconstructing"
  | "decoding"
  | "ready"
  | "error"
  | "cancelled";

export interface StdfFragmentWire {
  version: number;
  stemId: string;
  partIndex: number;
  partCount: number;
  payloadLength: number;
  payloadCrc32: number;
  payload: Uint8Array;
}

export interface StemDecodeJobRequest {
  jobId: string;
  stemId: string;
  stemName: string;
  codecId: number;
  channels: number;
  sampleRate: number;
  dataLength: number;
  storageMode: "stdf-v1" | "stda-v1";
  stdfFragments?: StdfFragmentWire[];
  stdaIndex?: number;
  stdaPayload?: Uint8Array;
}

export interface StemDecodeJobResult {
  jobId: string;
  stemId: string;
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  decodedBytes: number;
  warnings: string[];
}

export type StemWorkerInMessage =
  | { type: "init" }
  | { type: "decode"; job: StemDecodeJobRequest }
  | { type: "cancel"; jobId: string };

export type StemWorkerOutMessage =
  | { type: "init-done"; ok: boolean; error?: string }
  | {
      type: "progress";
      jobId: string;
      phase: StemWorkerTaskPhase;
      stemName: string;
      percent?: number;
    }
  | { type: "done"; result: StemDecodeJobResult }
  | { type: "error"; jobId: string; stemId: string; message: string }
  | { type: "cancelled"; jobId: string };

export interface StemWorkerDiagnostics {
  workerAvailable: boolean;
  fallbackMode: boolean;
  workerStatus: "unavailable" | "initializing" | "ready" | "busy" | "error";
  taskPhase: StemWorkerTaskPhase;
  queuedStemIds: string[];
  lastError: string;
  codecReady: boolean;
}
