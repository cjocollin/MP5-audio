import {
  decodeStdaEntries,
  isStemAlias,
  loadStdfFragmentsForStem,
  reconstructStemFrameFromFragments,
  STDA_VERSION,
  stdaPayloadIndexForStem,
  type StemDescriptor,
  type StdfFragmentRecord,
} from "@mp5/container";
import { recordStdfFragmentLoaded } from "../ingest/ingestDiagnostics";
import type { ParsedStemFile } from "./parseStems";

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function extractStdaFrameByIndex(stda: Uint8Array, index: number): Uint8Array {
  const entries = decodeStdaEntries(stda);
  return entries[index] ?? new Uint8Array(0);
}

export async function loadStemFrameData(
  file: ParsedStemFile,
  stem: StemDescriptor,
  stemIndex: number,
  signal?: AbortSignal,
): Promise<{ frameData: Uint8Array; errors: string[]; warnings: string[] }> {
  if (signal?.aborted) {
    return { frameData: new Uint8Array(0), errors: ["Cancelled."], warnings: [] };
  }

  await yieldToMain();

  if (isStemAlias(stem) || stem.unsupportedCodingMode) {
    return {
      frameData: new Uint8Array(0),
      errors: stem.unsupportedCodingMode
        ? [`Stem "${stem.stemName}" uses an unsupported codingMode.`]
        : [`Stem "${stem.stemName}" is an AUDI alias — resolve via full-mix PCM.`],
      warnings: [],
    };
  }

  if (file.storageMode === "stdf-v1") {
    let frags: StdfFragmentRecord[];
    if (file.lazyFile?.lazy && file.stdfIndexGrouped) {
      frags = await loadStdfFragmentsForStem(file.lazyFile.lazy, stem.stemId);
      for (const f of frags) {
        recordStdfFragmentLoaded();
      }
    } else {
      frags = file.stdfGrouped.get(stem.stemId) ?? [];
    }
    const { frameData, errors, warnings } = reconstructStemFrameFromFragments(
      stem.stemId,
      frags,
      stem.dataLength,
    );
    await yieldToMain();
    return {
      frameData: frameData ?? new Uint8Array(0),
      errors,
      warnings,
    };
  }

  if (file.stda?.length) {
    const v = new DataView(file.stda.buffer, file.stda.byteOffset, file.stda.byteLength);
    if (v.getUint8(0) === STDA_VERSION) {
      const payloadIndex = stdaPayloadIndexForStem(file.manifest, stem.stemId);
      const index = payloadIndex >= 0 ? payloadIndex : stemIndex;
      const frameData = extractStdaFrameByIndex(file.stda, index);
      await yieldToMain();
      return { frameData, errors: [], warnings: [] };
    }
  }

  return {
    frameData: new Uint8Array(0),
    errors: [`Stem audio data is missing for ${stem.stemName}.`],
    warnings: [],
  };
}
