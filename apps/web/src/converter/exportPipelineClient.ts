import {
  runExportPipeline,
  type ExportPhase,
  type ExportPipelineInput,
  type ExportPipelineResult,
} from "./exportPipeline";
import type { ExportWorkerOutMessage } from "./exportWorkerProtocol";

export type ExportProgress = (phase: ExportPhase, label: string, percent: number) => void;

const MAX_POOL = Math.max(
  1,
  Math.min(4, typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2),
);

type PooledWorker = {
  worker: Worker;
  busy: boolean;
};

const pool: PooledWorker[] = [];
/** Worker script itself failed — stop retrying and run everything on the main thread. */
let workerBroken = false;
let jobCounter = 0;
/** Serial queue used only when pool size is 1 (legacy abort semantics). */
let queueTail: Promise<unknown> = Promise.resolve();
let activeJobs = 0;
const waiters: Array<() => void> = [];

function createWorker(): Worker | null {
  if (workerBroken || typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./exportPipeline.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    workerBroken = true;
    return null;
  }
}

function acquireWorker(): Promise<PooledWorker | null> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (workerBroken) {
        resolve(null);
        return;
      }
      let slot = pool.find((p) => !p.busy);
      if (!slot && pool.length < MAX_POOL) {
        const w = createWorker();
        if (!w) {
          resolve(null);
          return;
        }
        slot = { worker: w, busy: false };
        pool.push(slot);
      }
      if (slot && !slot.busy) {
        slot.busy = true;
        activeJobs++;
        resolve(slot);
        return;
      }
      waiters.push(tryAcquire);
    };
    tryAcquire();
  });
}

function releaseWorker(slot: PooledWorker | null) {
  if (!slot) return;
  slot.busy = false;
  activeJobs = Math.max(0, activeJobs - 1);
  const next = waiters.shift();
  if (next) next();
}

function abortError(): DOMException {
  return new DOMException("Export cancelled", "AbortError");
}

/** Clone PCM so Transferable postMessage does not detach the caller's buffers. */
function clonePipelineInput(input: ExportPipelineInput): {
  input: ExportPipelineInput;
  transfer: Transferable[];
} {
  const pcmCopy = new Int16Array(input.pcm.samples);
  const transfer: Transferable[] = [pcmCopy.buffer];
  const stems = input.stems?.map((stem) => {
    const samples = new Int16Array(stem.samples);
    transfer.push(samples.buffer);
    return { ...stem, samples };
  });
  return {
    input: {
      ...input,
      pcm: { ...input.pcm, samples: pcmCopy },
      stems,
    },
    transfer,
  };
}

function runJobOnWorker(
  slot: PooledWorker,
  input: ExportPipelineInput,
  onPhase: ExportProgress,
  signal?: AbortSignal,
): Promise<ExportPipelineResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  const w = slot.worker;
  const jobId = ++jobCounter;
  const { input: payload, transfer } = clonePipelineInput(input);

  return new Promise<ExportPipelineResult>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      releaseWorker(slot);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      w.terminate();
      const idx = pool.indexOf(slot);
      if (idx >= 0) pool.splice(idx, 1);
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
      const idx = pool.indexOf(slot);
      if (idx >= 0) pool.splice(idx, 1);
      resolve(runExportPipeline(input, onPhase));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      w.postMessage({ type: "run", jobId, input: payload }, transfer);
    } catch {
      settled = true;
      cleanup();
      workerBroken = true;
      resolve(runExportPipeline(input, onPhase));
    }
  });
}

async function runJob(
  input: ExportPipelineInput,
  onPhase: ExportProgress,
  signal?: AbortSignal,
): Promise<ExportPipelineResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  const slot = await acquireWorker();
  if (!slot) return runExportPipeline(input, onPhase);
  return runJobOnWorker(slot, input, onPhase, signal);
}

/**
 * Runs the export pipeline in a background worker so the UI stays responsive,
 * falling back to the main thread when workers or worker WASM are unavailable.
 *
 * PCM is cloned then transferred into the worker (caller keeps original).
 * Multiple jobs may run concurrently up to `navigator.hardwareConcurrency` (capped at 4).
 */
export function runExportPipelineOffThread(
  input: ExportPipelineInput,
  onPhase: ExportProgress,
  opts?: { signal?: AbortSignal },
): Promise<ExportPipelineResult> {
  if (MAX_POOL <= 1) {
    const run = () => runJob(input, onPhase, opts?.signal);
    const job = queueTail.then(run, run);
    queueTail = job.catch(() => {});
    return job;
  }
  return runJob(input, onPhase, opts?.signal);
}

/** Exposed for batch UI / diagnostics. */
export function exportWorkerPoolStats(): { size: number; active: number; max: number } {
  return { size: pool.length, active: activeJobs, max: MAX_POOL };
}
