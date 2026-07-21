/// <reference lib="webworker" />
import { getCodec, isWasmCodecReady } from "../wasm/codec";
import { runExportPipeline } from "./exportPipeline";
import type { ExportWorkerInMessage, ExportWorkerOutMessage } from "./exportWorkerProtocol";

function post(msg: ExportWorkerOutMessage, transfer?: Transferable[]) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []);
}

async function runJob(msg: ExportWorkerInMessage): Promise<void> {
  try {
    await getCodec();
    if (!isWasmCodecReady() && msg.input.codec !== "pcm") {
      post({
        type: "error",
        jobId: msg.jobId,
        message: "WASM codec unavailable in export worker",
        code: "wasm-unavailable",
      });
      return;
    }
    const result = await runExportPipeline(msg.input, (phase, label, percent) => {
      post({ type: "phase", jobId: msg.jobId, phase, label, percent });
    });
    post({ type: "done", jobId: msg.jobId, result }, [result.mp5.buffer]);
  } catch (e) {
    post({
      type: "error",
      jobId: msg.jobId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

self.onmessage = (ev: MessageEvent<ExportWorkerInMessage>) => {
  if (ev.data.type === "run") void runJob(ev.data);
};
