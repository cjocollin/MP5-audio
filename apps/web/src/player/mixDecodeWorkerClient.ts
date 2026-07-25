import { CodecId, loadAudiFrames, loadCorrFrames, type Mp5File } from "@mp5/container";
import {
  decodeMp5ToPcm,
  type DecodeMp5Options,
  type DecodeResult,
} from "./decodeMp5";
import type { MixWorkerOutMessage } from "./mixWorkerProtocol";
import { updateIngestDiagnostics } from "../lib/ingest/ingestDiagnostics";
import { copyToArrayBufferAsync } from "./pcmConvert";
import { DecodeScheduler, type DecodePriority } from "./engine/decodeScheduler";

export type { DecodePriority };

let jobCounter = 0;

function nextJobId(): string {
  jobCounter += 1;
  return `mix-job-${jobCounter}`;
}

/**
 * Offloads mix WASM decode to a module worker when available.
 * Prefers HEAD+AUDI frame transfer (no full-file re-parse / slice).
 * Falls back to the main thread when Worker is missing or init fails.
 */
export class MixDecodeWorkerClient {
  private worker: Worker | null = null;
  private initPromise: Promise<boolean> | null = null;
  private fallbackMode = false;
  /**
   * Owns priority + single-flight cancellation: interactive decodes supersede,
   * background decodes (upgrade / prefetch) wait rather than cancel. See
   * DecodeScheduler for the full contract (and its unit tests).
   */
  private scheduler = new DecodeScheduler();
  private pendingJob: {
    jobId: string;
    resolve: (v: DecodeResult) => void;
    reject: (e: Error) => void;
    /** Frames path: keep main-thread ingest parse instead of worker stub. */
    parsed?: Mp5File;
  } | null = null;

  isUsingFallback(): boolean {
    return this.fallbackMode;
  }

  isBusy(): boolean {
    return this.scheduler.isBusy() || this.pendingJob !== null;
  }

  private createWorker(): Worker | null {
    if (typeof Worker === "undefined") return null;
    try {
      return new Worker(new URL("./mixDecode.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      return null;
    }
  }

  private handleMessage(msg: MixWorkerOutMessage): void {
    if (msg.type === "init-done") {
      if (!msg.ok) this.fallbackMode = true;
      return;
    }
    if (msg.type === "cancelled") {
      const pending = this.pendingJob;
      if (pending && pending.jobId === msg.jobId) {
        this.pendingJob = null;
        pending.reject(new DOMException("Mix decode cancelled", "AbortError"));
      }
      return;
    }
    if (msg.type === "error") {
      const pending = this.pendingJob;
      if (pending && pending.jobId === msg.jobId) {
        this.pendingJob = null;
        pending.reject(new Error(msg.message));
      }
      return;
    }
    if (msg.type === "done") {
      const pending = this.pendingJob;
      if (!pending || pending.jobId !== msg.result.jobId) return;
      this.pendingJob = null;
      const parsed = pending.parsed ?? msg.result.parsed;
      if (!parsed) {
        pending.reject(new Error("Mix decode missing parsed container"));
        return;
      }
      pending.resolve({
        samples: msg.result.samples,
        sampleRate: msg.result.sampleRate,
        channels: msg.result.channels,
        decodePath: msg.result.decodePath,
        mp5h: msg.result.mp5h,
        mp5l: msg.result.mp5l,
        floatChannels: msg.result.floatChannels,
        parsed,
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
        return false;
      }
      this.worker = w;
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          this.fallbackMode = true;
          this.worker?.terminate();
          this.worker = null;
          resolve(false);
        }, 30_000);

        w.onmessage = (ev: MessageEvent<MixWorkerOutMessage>) => {
          this.handleMessage(ev.data);
          if (ev.data.type === "init-done") {
            clearTimeout(timeout);
            if (!ev.data.ok) {
              this.fallbackMode = true;
              w.terminate();
              this.worker = null;
              resolve(false);
            } else {
              resolve(true);
            }
          }
        };
        w.onerror = () => {
          clearTimeout(timeout);
          this.fallbackMode = true;
          w.terminate();
          this.worker = null;
          resolve(false);
        };
        w.postMessage({ type: "init" });
      });
    })();

    return this.initPromise;
  }

  /** Supersede any in-flight/queued decode and kill the worker's active job. */
  cancelActive(): void {
    this.scheduler.supersede();
    this.abortActiveWorkerJob();
  }

  /**
   * Reject the worker's in-flight job and terminate the worker so the cancelled
   * decode's CPU/WASM memory are truly released — a decode_* call is one
   * synchronous WASM invocation the worker can't abort cooperatively, and
   * overlapping full decodes on a track switch crashed the renderer. Only
   * terminates when a job was actually posted (a warm-but-idle worker is kept).
   */
  private abortActiveWorkerJob(): void {
    if (!this.pendingJob) return;
    this.pendingJob.reject(new DOMException("Mix decode cancelled", "AbortError"));
    this.pendingJob = null;
    if (this.worker && !this.fallbackMode) {
      this.worker.terminate();
      this.worker = null;
      this.initPromise = null;
    }
  }

  private assertCurrent(isCurrent: () => boolean): void {
    if (!isCurrent()) {
      throw new DOMException("Mix decode cancelled", "AbortError");
    }
  }

  private enterFallback(): void {
    this.fallbackMode = true;
    this.worker?.terminate();
    this.worker = null;
    this.initPromise = null;
  }

  private async decodeFramesOnWorker(
    preParsed: Mp5File,
    opts: DecodeMp5Options | undefined,
    isCurrent: () => boolean,
  ): Promise<DecodeResult> {
    if (!preParsed.head) throw new Error("Missing HEAD chunk");

    // Warm WASM while AUDI loads/CRC yields — overlap cold start with I/O.
    const readyPromise = this.ensureReady();
    const audioFrames = await loadAudiFrames(preParsed);
    this.assertCurrent(isCurrent);
    const frameData = audioFrames[0]?.data;
    if (!frameData) throw new Error("No audio frames");

    // Enhanced MP5-H needs its CORR layer, which the lazy index skips over the
    // eager cap — load it before we read preParsed.corr below.
    if (
      preParsed.head.codecId === CodecId.MP5H &&
      preParsed.lazy &&
      !preParsed.corr.length
    ) {
      await loadCorrFrames(preParsed);
      this.assertCurrent(isCurrent);
    }

    if (preParsed.lazy) {
      updateIngestDiagnostics({
        audiLoaded: true,
        loadedBinaryMb:
          preParsed.lazy.loadedPayloadBytes / (1024 * 1024) +
          frameData.byteLength / (1024 * 1024),
      });
    }

    const ready = await readyPromise;
    this.assertCurrent(isCurrent);
    if (!ready || !this.worker || this.fallbackMode) {
      return decodeMp5ToPcm(undefined, preParsed, opts);
    }

    const jobId = nextJobId();
    // Chunked copy keeps the UI responsive for large AUDI bitstreams.
    const frameBuf = await copyToArrayBufferAsync(frameData);
    this.assertCurrent(isCurrent);
    const corrBytes = preParsed.corr[0]?.data;
    const corrBuf = corrBytes ? await copyToArrayBufferAsync(corrBytes) : undefined;
    this.assertCurrent(isCurrent);
    const head = {
      codecId: preParsed.head.codecId,
      channels: preParsed.head.channels,
      sampleRate: preParsed.head.sampleRate,
    };
    const window =
      opts?.windowStartSample != null ||
      opts?.windowStartFrame != null ||
      opts?.windowEndSample != null
        ? {
            windowStartSample: opts.windowStartSample ?? opts.windowStartFrame,
            windowEndSample: opts.windowEndSample,
          }
        : undefined;

    // Drop any waiter that snuck in during awaits (should be none after epoch checks).
    if (this.pendingJob) {
      this.pendingJob.reject(new DOMException("Mix decode cancelled", "AbortError"));
      this.pendingJob = null;
    }

    return new Promise<DecodeResult>((resolve, reject) => {
      if (!isCurrent()) {
        reject(new DOMException("Mix decode cancelled", "AbortError"));
        return;
      }
      this.pendingJob = { jobId, resolve, reject, parsed: preParsed };
      try {
        const transfer: Transferable[] = [frameBuf];
        if (corrBuf) transfer.push(corrBuf);
        this.worker!.postMessage(
          {
            type: "decode-frames",
            jobId,
            head,
            frameData: frameBuf,
            corrData: corrBuf,
            window,
            wantFloats: opts?.wantFloats ?? true,
          },
          transfer,
        );
      } catch {
        this.pendingJob = null;
        this.enterFallback();
        void decodeMp5ToPcm(undefined, preParsed, opts).then(resolve, reject);
      }
    });
  }

  async decode(
    buffer: ArrayBuffer | undefined,
    preParsed?: Mp5File,
    opts?: DecodeMp5Options,
    priority: DecodePriority = "interactive",
  ): Promise<DecodeResult> {
    if (priority === "interactive") {
      // A track change genuinely supersedes any in-flight work — unblock the
      // worker's parked job (rejecting it) and free its memory before re-decode.
      this.abortActiveWorkerJob();
    }
    // The scheduler enforces the priority + single-flight contract: interactive
    // supersedes (bumps epoch), background waits for the current job to settle.
    return this.scheduler.schedule(priority, ({ isCurrent }) =>
      this.runDecode(buffer, preParsed, opts, isCurrent),
    );
  }

  private async runDecode(
    buffer: ArrayBuffer | undefined,
    preParsed: Mp5File | undefined,
    opts: DecodeMp5Options | undefined,
    isCurrent: () => boolean,
  ): Promise<DecodeResult> {
    // Preferred: AUDI on main (lazy-safe) -> worker WASM without re-parse.
    if (preParsed?.head) {
      return this.decodeFramesOnWorker(preParsed, opts, isCurrent);
    }

    if (!buffer) {
      return decodeMp5ToPcm(undefined, preParsed, opts);
    }

    // Full-file buffer path cannot apply progressive windows — fall back.
    if (opts?.windowEndSample != null || opts?.windowStartSample != null) {
      return decodeMp5ToPcm(buffer, preParsed, opts);
    }

    const ready = await this.ensureReady();
    this.assertCurrent(isCurrent);
    if (!ready || !this.worker || this.fallbackMode) {
      return decodeMp5ToPcm(buffer, preParsed, opts);
    }

    const jobId = nextJobId();
    const transferBuf = buffer.slice(0);

    if (this.pendingJob) {
      this.pendingJob.reject(new DOMException("Mix decode cancelled", "AbortError"));
      this.pendingJob = null;
    }

    return new Promise<DecodeResult>((resolve, reject) => {
      if (!isCurrent()) {
        reject(new DOMException("Mix decode cancelled", "AbortError"));
        return;
      }
      this.pendingJob = { jobId, resolve, reject };
      try {
        this.worker!.postMessage(
          {
            type: "decode",
            jobId,
            buffer: transferBuf,
            wantFloats: opts?.wantFloats ?? true,
          },
          [transferBuf],
        );
      } catch {
        this.pendingJob = null;
        this.enterFallback();
        void decodeMp5ToPcm(buffer, preParsed, opts).then(resolve, reject);
      }
    });
  }
}

let sharedClient: MixDecodeWorkerClient | null = null;

export function getMixDecodeWorkerClient(): MixDecodeWorkerClient {
  if (!sharedClient) sharedClient = new MixDecodeWorkerClient();
  return sharedClient;
}

export function resetMixDecodeWorkerClientForTests(): void {
  sharedClient = null;
}

/** Prefetch mix-worker WASM so the first song skips cold init. */
export function warmMixDecodePipeline(): void {
  void getMixDecodeWorkerClient().ensureReady();
}

/** Convenience: worker when available, else sync decodeMp5ToPcm. */
export async function decodeMp5ToPcmOffthread(
  buffer: ArrayBuffer | undefined,
  preParsed?: Mp5File,
  opts?: DecodeMp5Options,
  priority: DecodePriority = "interactive",
): Promise<DecodeResult> {
  return getMixDecodeWorkerClient().decode(buffer, preParsed, opts, priority);
}