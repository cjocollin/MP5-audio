import {
  runExportPipeline,
  type ExportPhase,
  type ExportPipelineInput,
  type ExportPipelineResult,
} from "./exportPipeline";
import type { ExportWorkerOutMessage } from "./exportWorkerProtocol";

export type ExportProgress = (phase: ExportPhase, label: string, percent: number) => void;

let worker: Worker | null = null;
/** Worker script itself failed — stop retrying and run everything on the main thread. */
let workerBroken = false;
let jobCounter = 0;
let queueTail: Promise<unknown> = Promise.resolve();

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./exportPipeline.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      workerBroken = true;
      return null;
    }
  }
  return worker;
}

function abortError(): DOMException {
  return new DOMException("Export cancelled", "AbortError");
}

function runJob(
  input: ExportPipelineInput,
  onPhase: ExportProgress,
  signal?: AbortSignal,
): Promise<ExportPipelineResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  const w = getWorker();
  if (!w) return runExportPipeline(input, onPhase);

  const jobId = ++jobCounter;
  return new Promise<ExportPipelineResult>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      // Terminate mid-encode; a fresh worker spawns on the next export.
      w.terminate();
      if (worker === w) worker = null;
      reject(abortError());
    };
    const onMessage = (ev: MessageEvent<ExportWorkerOutMessage>) => {
      const msg = ev.data;
      if (msg.jobId !== jobId) return;
      if (msg.type === "phase") {
        if (!settled) onPhase(msg.phase, msg.label, msg.percent);
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      if (msg.type === "done") {
        resolve(msg.result);
      } else if (msg.code === "wasm-unavailable") {
        resolve(runExportPipeline(input, onPhase));
      } else {
        reject(new Error(msg.message));
      }
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      workerBroken = true;
      w.terminate();
      if (worker === w) worker = null;
      resolve(runExportPipeline(input, onPhase));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      // Cloned, not transferred — the caller keeps its PCM for replays and re-exports.
      w.postMessage({ type: "run", jobId, input });
    } catch {
      settled = true;
      cleanup();
      workerBroken = true;
      resolve(runExportPipeline(input, onPhase));
    }
  });
}

/**
 * Runs the export pipeline in a background worker so the UI stays responsive,
 * falling back to the main thread when workers or worker WASM are unavailable.
 * Jobs are serialized; aborting terminates the worker and stops the encode.
 */
export function runExportPipelineOffThread(
  input: ExportPipelineInput,
  onPhase: ExportProgress,
  opts?: { signal?: AbortSignal },
): Promise<ExportPipelineResult> {
  const run = () => runJob(input, onPhase, opts?.signal);
  const job = queueTail.then(run, run);
  queueTail = job.catch(() => {});
  return job;
}
