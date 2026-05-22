import {
  decodeStdaEntries,
  loadStdfFragmentsForStem,
  type StemDescriptor,
  type StdfFragmentRecord,
} from "@mp5/container";
import type { ParsedStemFile } from "./parseStems";
import type { StemDecodeJobRequest, StdfFragmentWire } from "./stemWorkerProtocol";

/** Always copy so postMessage transfer cannot detach parsed-file fragment buffers. */
function ownedBytes(src: Uint8Array): Uint8Array {
  return src.slice();
}

function wireFragmentRecords(frags: StdfFragmentRecord[]): {
  fragments: StdfFragmentWire[];
  transfer: Transferable[];
} {
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

async function resolveStdfFragments(
  file: ParsedStemFile,
  stemId: string,
): Promise<StdfFragmentRecord[]> {
  if (file.lazyFile?.lazy) {
    return loadStdfFragmentsForStem(file.lazyFile.lazy, stemId);
  }
  return file.stdfGrouped.get(stemId) ?? [];
}

function extractStdaFrame(stda: Uint8Array, index: number): Uint8Array {
  const entries = decodeStdaEntries(stda);
  return entries[index] ?? new Uint8Array(0);
}

/** Build a worker job for one stem; returns transferable buffers (no full-file copy). */
export async function buildStemDecodeJob(
  file: ParsedStemFile,
  stem: StemDescriptor,
  stemIndex: number,
  jobId: string,
): Promise<{ job: StemDecodeJobRequest; transfer: Transferable[] }> {
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
    const frags = await resolveStdfFragments(file, stem.stemId);
    const { fragments, transfer: t } = wireFragmentRecords(frags);
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
