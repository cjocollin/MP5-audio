import {
  decodeStdaEntries,
  reconstructStemFrameFromFragments,
  STDA_VERSION,
  type StemDescriptor,
  type StdfFragmentRecord,
} from "@mp5/container";
import type { ParsedStemFile } from "./parseStems";

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Extract one stem frame from STDA without building all entries (uses manifest order). */
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

  if (file.storageMode === "stdf-v1") {
    const frags = file.stdfGrouped.get(stem.stemId) ?? [];
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
      const frameData = extractStdaFrameByIndex(file.stda, stemIndex);
      await yieldToMain();
      return { frameData, errors: [], warnings: [] };
    }
  }

  return {
    frameData: new Uint8Array(0),
    errors: [`No stem audio data for "${stem.stemName}".`],
    warnings: [],
  };
}
