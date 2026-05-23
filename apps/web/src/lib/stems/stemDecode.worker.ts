/// <reference lib="webworker" />
import {
  reconstructStemFrameFromFragments,
  type StdfFragmentRecord,
} from "@mp5/container";
import wasmUrl from "../../wasm/pkg/mp5_codec_bg.wasm?url";
import init, { decode_mp5l } from "../../wasm/pkg/mp5_codec.js";
import { decodeStemFrameCore } from "./stemDecodeCore";
import type {
  StemDecodeJobRequest,
  StemDecodeJobResult,
  StemWorkerInMessage,
  StemWorkerOutMessage,
} from "./stemWorkerProtocol";

let codecReady = false;
let codecInit: Promise<void> | null = null;
let activeJobId: string | null = null;
let cancelledJobId: string | null = null;

function post(msg: StemWorkerOutMessage, transfer?: Transferable[]) {
  self.postMessage(msg, transfer ?? []);
}

async function ensureCodec(): Promise<boolean> {
  if (codecReady) return true;
  if (!codecInit) {
    codecInit = init({ module_or_path: wasmUrl })
      .then(() => {
        codecReady = true;
      })
      .catch(() => {
        codecInit = null;
        throw new Error("WASM codec failed to load in stem worker");
      });
  }
  try {
    await codecInit;
    return true;
  } catch {
    return false;
  }
}

function loadFrame(job: StemDecodeJobRequest): {
  frameData: Uint8Array;
  errors: string[];
  warnings: string[];
} {
  if (job.storageMode === "stdf-v1" && job.stdfFragments?.length) {
    const frags = job.stdfFragments as StdfFragmentRecord[];
    const { frameData, errors, warnings } = reconstructStemFrameFromFragments(
      job.stemId,
      frags,
      job.dataLength,
    );
    return {
      frameData: frameData ?? new Uint8Array(0),
      errors,
      warnings,
    };
  }
  if (job.stdaPayload?.length) {
    return { frameData: job.stdaPayload, errors: [], warnings: [] };
  }
  return {
    frameData: new Uint8Array(0),
    errors: [`Stem audio data is missing for ${job.stemName}.`],
    warnings: [],
  };
}

async function runDecode(job: StemDecodeJobRequest): Promise<void> {
  activeJobId = job.jobId;
  cancelledJobId = null;

  post({
    type: "progress",
    jobId: job.jobId,
    phase: "loading_fragments",
    stemName: job.stemName,
    percent: 10,
  });

  if (cancelledJobId === job.jobId) {
    post({ type: "cancelled", jobId: job.jobId });
    return;
  }

  post({
    type: "progress",
    jobId: job.jobId,
    phase: "reconstructing",
    stemName: job.stemName,
    percent: 35,
  });

  const { frameData, errors, warnings } = loadFrame(job);
  if (cancelledJobId === job.jobId) {
    post({ type: "cancelled", jobId: job.jobId });
    return;
  }
  if (errors.length || !frameData.length) {
    post({
      type: "error",
      jobId: job.jobId,
      stemId: job.stemId,
      message: errors[0] ?? `Could not load stem "${job.stemName}".`,
    });
    return;
  }

  post({
    type: "progress",
    jobId: job.jobId,
    phase: "decoding",
    stemName: job.stemName,
    percent: 70,
  });

  const ok = await ensureCodec();
  if (cancelledJobId === job.jobId) {
    post({ type: "cancelled", jobId: job.jobId });
    return;
  }

  try {
    const codec = ok ? { decode_mp5l } : null;
    const { samples, sampleRate, channels } = decodeStemFrameCore(
      frameData,
      job.codecId,
      job.channels,
      job.sampleRate,
      codec,
    );
    if (cancelledJobId === job.jobId) {
      post({ type: "cancelled", jobId: job.jobId });
      return;
    }

    const result: StemDecodeJobResult = {
      jobId: job.jobId,
      stemId: job.stemId,
      samples,
      sampleRate,
      channels,
      decodedBytes: samples.byteLength,
      warnings,
    };

    post(
      {
        type: "done",
        result,
      },
      [samples.buffer],
    );
  } catch (err) {
    post({
      type: "error",
      jobId: job.jobId,
      stemId: job.stemId,
      message: err instanceof Error ? err.message : "Stem decode failed",
    });
  } finally {
    if (activeJobId === job.jobId) activeJobId = null;
  }
}

self.onmessage = (ev: MessageEvent<StemWorkerInMessage>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    void ensureCodec().then((ok) => {
      post({ type: "init-done", ok });
    }).catch((e) => {
      post({ type: "init-done", ok: false, error: String(e) });
    });
    return;
  }
  if (msg.type === "cancel") {
    cancelledJobId = msg.jobId;
    if (activeJobId === msg.jobId) activeJobId = null;
    post({ type: "cancelled", jobId: msg.jobId });
    return;
  }
  if (msg.type === "decode") {
    void runDecode(msg.job);
  }
};
