import type { StemDescriptor } from "@mp5/container";
import { buildStemDecodeJob } from "./buildStemJobPayload";
import { decodeStemFrame } from "../../player/decodeStemFrame";
import { loadStemFrameData, yieldToMain } from "./stemFrameLoader";
import type { ParsedStemFile } from "./parseStems";
import type { DecodedStemPcm } from "./stemDecodeCache";
import type {
  StemWorkerDiagnostics,
  StemWorkerOutMessage,
  StemWorkerTaskPhase,
} from "./stemWorkerProtocol";

export const STEM_WORKER_FALLBACK_WARNING =
  "Stem decoding is running on the main thread (background worker unavailable). Large stems may take longer during prep.";

/** User-visible note with optional technical detail from diagnostics. */
export function stemWorkerFallbackMessage(lastError?: string): string {
  const detail = lastError?.trim();
  if (!detail) return STEM_WORKER_FALLBACK_WARNING;
  return `${STEM_WORKER_FALLBACK_WARNING} (${detail})`;
}

let jobCounter = 0;

function nextJobId(): string {
  jobCounter += 1;
  return `stem-job-${jobCounter}`;
}

export interface StemDecodeProgress {
  phase: StemWorkerTaskPhase;
  stemName?: string;
  currentIndex?: number;
  total?: number;
  percent?: number;
}

export class StemWorkerClient {
  private worker: Worker | null = null;
  private initPromise: Promise<boolean> | null = null;
  private fallbackMode = false;
  private workerStatus: StemWorkerDiagnostics["workerStatus"] = "unavailable";
  private taskPhase: StemWorkerTaskPhase = "idle";
  private queuedStemIds: string[] = [];
  private lastError = "";
  private codecReady = false;
  private pendingJob: {
    jobId: string;
    resolve: (v: DecodedStemPcm) => void;
    reject: (e: Error) => void;
    onProgress?: (p: StemDecodeProgress) => void;
  } | null = null;

  get diagnostics(): StemWorkerDiagnostics {
    return {
      workerAvailable: typeof Worker !== "undefined" && !this.fallbackMode,
      fallbackMode: this.fallbackMode,
      workerStatus: this.workerStatus,
      taskPhase: this.taskPhase,
      queuedStemIds: [...this.queuedStemIds],
      lastError: this.lastError,
      codecReady: this.codecReady,
    };
  }

  isUsingFallback(): boolean {
    return this.fallbackMode;
  }

  private createWorker(): Worker | null {
    if (typeof Worker === "undefined") return null;
    try {
      return new Worker(new URL("./stemDecode.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : "Worker constructor failed";
      return null;
    }
  }

  private handleMessage(msg: StemWorkerOutMessage): void {
    if (msg.type === "init-done") {
      this.codecReady = msg.ok;
      if (!msg.ok) this.lastError = msg.error ?? "Worker WASM init failed";
      return;
    }
    if (msg.type === "progress") {
      this.taskPhase = msg.phase;
      this.pendingJob?.onProgress?.({
        phase: msg.phase,
        stemName: msg.stemName,
        percent: msg.percent,
      });
      return;
    }
    if (msg.type === "cancelled") {
      this.taskPhase = "cancelled";
      const pending = this.pendingJob;
      if (pending && pending.jobId === msg.jobId) {
        this.pendingJob = null;
        this.workerStatus = "ready";
        pending.reject(new DOMException("Stem preparation cancelled", "AbortError"));
      }
      return;
    }
    if (msg.type === "error") {
      this.taskPhase = "error";
      this.lastError = msg.message;
      const pending = this.pendingJob;
      if (pending && pending.jobId === msg.jobId) {
        this.pendingJob = null;
        this.workerStatus = "ready";
        pending.reject(new Error(msg.message));
      }
      return;
    }
    if (msg.type === "done") {
      this.taskPhase = "ready";
      const pending = this.pendingJob;
      if (!pending || pending.jobId !== msg.result.jobId) return;
      this.pendingJob = null;
      this.workerStatus = "ready";
      pending.resolve({
        stemId: msg.result.stemId,
        samples: msg.result.samples,
        sampleRate: msg.result.sampleRate,
        channels: msg.result.channels,
        decodedBytes: msg.result.decodedBytes,
      });
    }
  }

  async ensureReady(): Promise<boolean> {
    if (this.fallbackMode) return false;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const w = this.createWorker();
      if (!w) {
        this.fallbackMode = true;
        this.workerStatus = "unavailable";
        return false;
      }
      this.worker = w;
      this.workerStatus = "initializing";
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          this.fallbackMode = true;
          this.workerStatus = "unavailable";
          this.worker?.terminate();
          this.worker = null;
          resolve(false);
        }, 30_000);

        w.onmessage = (ev: MessageEvent<StemWorkerOutMessage>) => {
          this.handleMessage(ev.data);
          if (ev.data.type === "init-done") {
            clearTimeout(timeout);
            if (!ev.data.ok) {
              this.fallbackMode = true;
              this.workerStatus = "unavailable";
              w.terminate();
              this.worker = null;
              resolve(false);
            } else {
              this.workerStatus = "ready";
              resolve(true);
            }
          }
        };
        // stable handler for decode progress + results
        w.onerror = () => {
          clearTimeout(timeout);
          this.fallbackMode = true;
          this.lastError = "Stem worker runtime error";
          this.workerStatus = "error";
          w.terminate();
          this.worker = null;
          resolve(false);
        };
        w.postMessage({ type: "init" });
      });
    })();

    return this.initPromise;
  }

  cancelJob(jobId: string): void {
    this.worker?.postMessage({ type: "cancel", jobId });
    if (this.pendingJob?.jobId === jobId) {
      this.pendingJob.reject(new DOMException("Stem preparation cancelled", "AbortError"));
      this.pendingJob = null;
    }
    this.workerStatus = "ready";
    this.taskPhase = "cancelled";
  }

  cancelActive(): void {
    if (this.pendingJob) this.cancelJob(this.pendingJob.jobId);
  }

  private async decodeOnMainThread(
    file: ParsedStemFile,
    stem: StemDescriptor,
    stemIndex: number,
    signal?: AbortSignal,
    onProgress?: (p: StemDecodeProgress) => void,
  ): Promise<DecodedStemPcm> {
    onProgress?.({ phase: "loading_fragments", stemName: stem.stemName, percent: 15 });
    const { frameData, errors } = await loadStemFrameData(file, stem, stemIndex, signal);
    if (signal?.aborted) throw new DOMException("Stem preparation cancelled", "AbortError");
    if (errors.length || !frameData.length) {
      throw new Error(errors[0] ?? `Could not load stem "${stem.stemName}".`);
    }
    onProgress?.({ phase: "reconstructing", stemName: stem.stemName, percent: 40 });
    await yieldToMain();
    onProgress?.({ phase: "decoding", stemName: stem.stemName, percent: 75 });
    const { samples, sampleRate, channels } = await decodeStemFrame(
      frameData,
      stem.codecId,
      stem.channels,
      stem.sampleRate,
    );
    if (signal?.aborted) throw new DOMException("Stem preparation cancelled", "AbortError");
    onProgress?.({ phase: "ready", stemName: stem.stemName, percent: 100 });
    return {
      stemId: stem.stemId,
      samples,
      sampleRate,
      channels,
      decodedBytes: samples.byteLength,
    };
  }

  async decodeStem(
    file: ParsedStemFile,
    stem: StemDescriptor,
    stemIndex: number,
    opts?: {
      signal?: AbortSignal;
      onProgress?: (p: StemDecodeProgress) => void;
      currentIndex?: number;
      total?: number;
    },
  ): Promise<DecodedStemPcm> {
    const { signal, onProgress, currentIndex, total } = opts ?? {};
    const ready = await this.ensureReady();

    const wrapProgress = (phase: StemWorkerTaskPhase, percent?: number) => {
      onProgress?.({
        phase,
        stemName: stem.stemName,
        currentIndex,
        total,
        percent,
      });
    };

    if (!ready || !this.worker || this.fallbackMode) {
      wrapProgress("loading_fragments", 10);
      return this.decodeOnMainThread(file, stem, stemIndex, signal, onProgress);
    }

    const jobId = nextJobId();
    this.queuedStemIds = [stem.stemId];
    this.workerStatus = "busy";
    this.taskPhase = "loading_fragments";
    wrapProgress("loading_fragments", 10);

    const { job, transfer } = await buildStemDecodeJob(file, stem, stemIndex, jobId);

    return new Promise<DecodedStemPcm>((resolve, reject) => {
      const onAbort = () => {
        this.cancelJob(jobId);
        reject(new DOMException("Stem preparation cancelled", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      this.pendingJob = {
        jobId,
        resolve: (v) => {
          this.queuedStemIds = [];
          signal?.removeEventListener("abort", onAbort);
          resolve(v);
        },
        reject: (e) => {
          this.queuedStemIds = [];
          signal?.removeEventListener("abort", onAbort);
          reject(e);
        },
        onProgress: (p) => wrapProgress(p.phase, p.percent),
      };

      try {
        this.worker!.postMessage({ type: "decode", job }, transfer);
      } catch {
        this.pendingJob = null;
        this.fallbackMode = true;
        this.worker?.terminate();
        this.worker = null;
        this.initPromise = null;
        signal?.removeEventListener("abort", onAbort);
        void this.decodeOnMainThread(file, stem, stemIndex, signal, onProgress).then(resolve, reject);
      }
    });
  }
}

let sharedClient: StemWorkerClient | null = null;

export function getStemWorkerClient(): StemWorkerClient {
  if (!sharedClient) sharedClient = new StemWorkerClient();
  return sharedClient;
}

export function resetStemWorkerClientForTests(): void {
  sharedClient = null;
}
