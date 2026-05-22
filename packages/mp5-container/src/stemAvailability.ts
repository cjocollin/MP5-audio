import type { StemManifest } from "./stems.js";
import type { StdfFragmentIndex } from "./types.js";
import { groupStdfFragmentIndex } from "./lazyMp5Load.js";
import { decodeStdfFragment } from "./stemStdf.js";

export type StemAvailabilityStatus =
  | "available"
  | "not_loaded_yet"
  | "missing_fragments"
  | "partial_fragments";

export interface StemAvailabilityEntry {
  stemId: string;
  stemName: string;
  status: StemAvailabilityStatus;
  expectedFragmentCount: number;
  indexedFragmentCount: number;
  expectedDataLength: number;
  indexedInnerPayloadBytes: number;
  partIndexes: number[];
  hasCrcMetadata: boolean;
}

export function auditStdfStemIndex(
  manifest: StemManifest,
  stdfIndex: readonly StdfFragmentIndex[],
): StemAvailabilityEntry[] {
  const grouped = groupStdfFragmentIndex(stdfIndex);
  return manifest.stems.map((stem) => {
    const frags = grouped.get(stem.stemId) ?? [];
    const partIndexes = frags.map((f) => f.partIndex).sort((a, b) => a - b);
    const expectedParts = stem.fragmentCount ?? frags.length;
    const indexedInnerPayloadBytes = frags.reduce((s, f) => s + f.innerPayloadLength, 0);
    const hasCrcMetadata = frags.every((f) => f.payloadCrc32 !== 0 || f.innerPayloadLength === 0);

    let status: StemAvailabilityStatus = "available";
    if (!frags.length) {
      status = "missing_fragments";
    } else if (frags.length !== expectedParts) {
      status = "partial_fragments";
    } else {
      const expectedPartsSet = new Set(Array.from({ length: expectedParts }, (_, i) => i));
      for (const p of partIndexes) {
        if (!expectedPartsSet.has(p)) {
          status = "partial_fragments";
          break;
        }
      }
      if (status === "available" && partIndexes.length !== expectedParts) {
        status = "partial_fragments";
      }
    }

    return {
      stemId: stem.stemId,
      stemName: stem.stemName,
      status,
      expectedFragmentCount: expectedParts,
      indexedFragmentCount: frags.length,
      expectedDataLength: stem.dataLength || stem.byteLength || 0,
      indexedInnerPayloadBytes,
      partIndexes,
      hasCrcMetadata,
    };
  });
}

/** Eager-parse inspect: audit STDF chunks already in memory. */
export function auditStdfStemFromChunks(
  manifest: StemManifest,
  stdfChunks: readonly Uint8Array[],
): StemAvailabilityEntry[] {
  const pseudoIndex: StdfFragmentIndex[] = [];
  for (let i = 0; i < stdfChunks.length; i++) {
    const rec = decodeStdfFragment(stdfChunks[i]!);
    if (!rec) continue;
    pseudoIndex.push({
      index: i,
      payloadOffset: 0,
      payloadLength: stdfChunks[i]!.length,
      flags: 0,
      storedCrc: 0,
      version: rec.version,
      stemId: rec.stemId,
      partIndex: rec.partIndex,
      partCount: rec.partCount,
      innerPayloadLength: rec.payloadLength,
      payloadCrc32: rec.payloadCrc32,
    });
  }
  return auditStdfStemIndex(manifest, pseudoIndex);
}
