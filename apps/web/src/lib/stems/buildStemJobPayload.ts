import { decodeStdaEntries, type StemDescriptor } from "@mp5/container";
import type { ParsedStemFile } from "./parseStems";
import type { StemDecodeJobRequest, StdfFragmentWire } from "./stemWorkerProtocol";

/** Always copy so postMessage transfer cannot detach parsed-file fragment buffers. */
function ownedBytes(src: Uint8Array): Uint8Array {
  return src.slice();
}

function wireFragments(file: ParsedStemFile, stemId: string): {
  fragments: StdfFragmentWire[];
  transfer: Transferable[];
} {
  const frags = file.stdfGrouped.get(stemId) ?? [];
  const fragments: StdfFragmentWire[] = [];
  const transfer: Transferable[] = [];
  for (const f of frags) {
    const payload = ownedBytes(f.payload);
    fragments.push({
      version: f.version,
      stemId: f.stemId,
      partIndex: f.partIndex,
      partCount: f.partCount,
      payloadLength: f.payloadLength,
      payloadCrc32: f.payloadCrc32,
      payload,
    });
    transfer.push(payload.buffer);
  }
  return { fragments, transfer };
}

function extractStdaFrame(stda: Uint8Array, index: number): Uint8Array {
  const entries = decodeStdaEntries(stda);
  return entries[index] ?? new Uint8Array(0);
}

/** Build a worker job for one stem; returns transferable buffers (no full-file copy). */
export function buildStemDecodeJob(
  file: ParsedStemFile,
  stem: StemDescriptor,
  stemIndex: number,
  jobId: string,
): { job: StemDecodeJobRequest; transfer: Transferable[] } {
  const transfer: Transferable[] = [];
  const base: StemDecodeJobRequest = {
    jobId,
    stemId: stem.stemId,
    stemName: stem.stemName,
    codecId: stem.codecId,
    channels: stem.channels,
    sampleRate: stem.sampleRate,
    dataLength: stem.dataLength || stem.byteLength || 0,
    storageMode: file.storageMode === "stdf-v1" ? "stdf-v1" : "stda-v1",
  };

  if (file.storageMode === "stdf-v1") {
    const { fragments, transfer: t } = wireFragments(file, stem.stemId);
    transfer.push(...t);
    return { job: { ...base, stdfFragments: fragments }, transfer };
  }

  if (file.stda?.length) {
    const stdaPayload = ownedBytes(extractStdaFrame(file.stda, stemIndex));
    transfer.push(stdaPayload.buffer);
    return { job: { ...base, stdaIndex: stemIndex, stdaPayload }, transfer };
  }

  return { job: base, transfer };
}
