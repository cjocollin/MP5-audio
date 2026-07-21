import type { ExportPhase, ExportPipelineInput, ExportPipelineResult } from "./exportPipeline";

export interface ExportWorkerRunMessage {
  type: "run";
  jobId: number;
  input: ExportPipelineInput;
}

export type ExportWorkerInMessage = ExportWorkerRunMessage;

export type ExportWorkerOutMessage =
  | { type: "phase"; jobId: number; phase: ExportPhase; label: string; percent: number }
  | { type: "done"; jobId: number; result: ExportPipelineResult }
  | {
      type: "error";
      jobId: number;
      message: string;
      /** "wasm-unavailable" means the worker can't encode but the main thread may — retry there. */
      code?: "wasm-unavailable";
    };
