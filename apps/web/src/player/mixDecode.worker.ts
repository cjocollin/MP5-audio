/// <reference lib="webworker" />
import wasmUrl from "../wasm/pkg/mp5_codec_bg.wasm?url";
import init from "../wasm/pkg/mp5_codec.js";
import { decodeFrameDataToPcm, decodeMp5ToPcm } from "./decodeMp5";
import { int16ToPlanarFloat } from "./pcmConvert";
import type { MixWorkerInMessage, MixWorkerOutMessage } from "./mixWorkerProtocol";

let codecReady = false;
let codecInit: Promise<void> | null = null;
let activeJobId: string | null = null;
let cancelledJobId: string | null = null;

function post(msg: MixWorkerOutMessage, transfer?: Transferable[]) {
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
        throw new Error("WASM codec failed to load in mix decode worker");
      });
  }
  try {
    await codecInit;
    return true;
  } catch {
    return false;
  }
}

async function ensureCodecOrError(jobId: string): Promise<boolean> {
  const ok = await ensureCodec();
  if (!ok) {
    post({
      type: "error",
      jobId,
      message: "WASM codec unavailable in mix decode worker",
    });
  }
  return ok;
}

function postDone(
  jobId: string,
  result: {
    samples: Int16Array;
    sampleRate: number;
    channels: number;
    decodePath: import("./decodeMp5").DecodePath;
    mp5h?: import("./decodeMp5").Mp5hDecodeInfo;
    mp5l?: import("./decodeMp5").Mp5lDecodeInfo;
    parsed?: import("@mp5/container").Mp5File;
  },
  wantFloats = true,
): void {
  // Build planar float off the UI thread so main only does copyToChannel.
  // Skipped when the caller won't upload an AudioBuffer (prefetch): the floats
  // are 2x `samples` and would be allocated + transferred only to be dropped.
  const floatChannels = wantFloats
    ? int16ToPlanarFloat(result.samples, result.channels)
    : undefined;
  const transfer: Transferable[] = [result.samples.buffer];
  for (const ch of floatChannels ?? []) {
    transfer.push(ch.buffer);
  }
  post(
    {
      type: "done",
      result: {
        jobId,
        samples: result.samples,
        floatChannels,
        sampleRate: result.sampleRate,
        channels: result.channels,
        decodePath: result.decodePath,
        mp5h: result.mp5h,
        mp5l: result.mp5l,
        parsed: result.parsed,
      },
    },
    transfer,
  );
}

async function runDecodeBuffer(
  jobId: string,
  buffer: ArrayBuffer,
  wantFloats = true,
): Promise<void> {
  activeJobId = jobId;
  cancelledJobId = null;

  post({ type: "progress", jobId, percent: 15 });
  if (cancelledJobId === jobId) {
    post({ type: "cancelled", jobId });
    return;
  }

  if (!(await ensureCodecOrError(jobId))) return;
  if (cancelledJobId === jobId) {
    post({ type: "cancelled", jobId });
    return;
  }

  post({ type: "progress", jobId, percent: 40 });

  try {
    const result = await decodeMp5ToPcm(buffer);
    if (cancelledJobId === jobId) {
      post({ type: "cancelled", jobId });
      return;
    }
    postDone(jobId, result, wantFloats);
  } catch (err) {
    post({
      type: "error",
      jobId,
      message: err instanceof Error ? err.message : "Mix decode failed",
    });
  } finally {
    if (activeJobId === jobId) activeJobId = null;
  }
}

async function runDecodeFrames(
  jobId: string,
  head: { codecId: number; channels: number; sampleRate: number },
  frameData: ArrayBuffer,
  corrData?: ArrayBuffer,
  window?: { windowStartSample?: number; windowEndSample?: number },
  wantFloats = true,
): Promise<void> {
  activeJobId = jobId;
  cancelledJobId = null;

  post({ type: "progress", jobId, percent: 20 });
  if (cancelledJobId === jobId) {
    post({ type: "cancelled", jobId });
    return;
  }

  if (!(await ensureCodecOrError(jobId))) return;
  if (cancelledJobId === jobId) {
    post({ type: "cancelled", jobId });
    return;
  }

  post({ type: "progress", jobId, percent: 45 });

  try {
    const result = await decodeFrameDataToPcm({
      codecId: head.codecId,
      channels: head.channels,
      sampleRate: head.sampleRate,
      frameData: new Uint8Array(frameData),
      corrData: corrData ? new Uint8Array(corrData) : undefined,
      windowStartSample: window?.windowStartSample,
      windowEndSample: window?.windowEndSample,
    });
    if (cancelledJobId === jobId) {
      post({ type: "cancelled", jobId });
      return;
    }
    postDone(jobId, result, wantFloats);
  } catch (err) {
    post({
      type: "error",
      jobId,
      message: err instanceof Error ? err.message : "Mix decode failed",
    });
  } finally {
    if (activeJobId === jobId) activeJobId = null;
  }
}

self.onmessage = (ev: MessageEvent<MixWorkerInMessage>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    void ensureCodec()
      .then((ok) => {
        post({ type: "init-done", ok });
      })
      .catch((e) => {
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
    void runDecodeBuffer(msg.jobId, msg.buffer, msg.wantFloats ?? true);
    return;
  }
  if (msg.type === "decode-frames") {
    void runDecodeFrames(
      msg.jobId,
      msg.head,
      msg.frameData,
      msg.corrData,
      msg.window,
      msg.wantFloats ?? true,
    );
  }
};