import { crc32 } from "./checksum.js";
import { CHUNK_FLAG_CRC } from "./constants.js";
import { Mp5ParseError } from "./errors.js";
import { parseAudiFrames } from "./containerParser.js";
import { decodeStdfFragment, type StdfFragmentRecord } from "./stemStdf.js";
import type { AudioFrame, Mp5File, Mp5LazyHandle, StdfFragmentIndex } from "./types.js";

export function isLazyMp5(file: Mp5File): file is Mp5File & { lazy: Mp5LazyHandle } {
  return !!file.lazy;
}

async function readPayload(lazy: Mp5LazyHandle, offset: number, length: number): Promise<Uint8Array> {
  const bytes = await lazy.readPayload(offset, length);
  lazy.loadedPayloadBytes += bytes.length;
  return bytes;
}

export async function loadAudiPayload(lazy: Mp5LazyHandle): Promise<Uint8Array> {
  const audi = lazy.audi;
  if (!audi) throw new Mp5ParseError("Missing AUDI chunk");
  return readPayload(lazy, audi.payloadOffset, audi.payloadLength);
}

export async function loadAudiFrames(file: Mp5File): Promise<AudioFrame[]> {
  if (file.audioFrames.length) return file.audioFrames;
  if (!file.lazy) {
    throw new Mp5ParseError("No audio frames");
  }
  const payload = await loadAudiPayload(file.lazy);
  const frames = parseAudiFrames(payload);
  file.audioFrames.push(...frames);
  return frames;
}

export async function loadStdfFragmentBytes(
  lazy: Mp5LazyHandle,
  index: number,
): Promise<Uint8Array> {
  const entry = lazy.stdfFragmentIndex[index];
  if (!entry) throw new Mp5ParseError(`STDF index ${index} out of range`);
  return readPayload(lazy, entry.payloadOffset, entry.payloadLength);
}

export async function loadStdfFragmentRecord(
  lazy: Mp5LazyHandle,
  index: number,
): Promise<StdfFragmentRecord | null> {
  const bytes = await loadStdfFragmentBytes(lazy, index);
  if (lazy.stdfFragmentIndex[index]?.flags & CHUNK_FLAG_CRC) {
    const computed = crc32(bytes);
    const stored = lazy.stdfFragmentIndex[index]!.storedCrc;
    if (computed !== stored) {
      throw new Mp5ParseError(
        `CRC mismatch for STDF fragment ${lazy.stdfFragmentIndex[index]!.stemId} part ${lazy.stdfFragmentIndex[index]!.partIndex + 1}`,
      );
    }
  }
  const rec = decodeStdfFragment(bytes);
  if (rec && lazy.stdfFragmentIndex[index]?.flags & CHUNK_FLAG_CRC) {
    const innerCrc = crc32(rec.payload);
    if (innerCrc !== rec.payloadCrc32) {
      throw new Mp5ParseError(
        `CRC mismatch on STDF payload for ${rec.stemId} part ${rec.partIndex + 1}/${rec.partCount}`,
      );
    }
  }
  return rec;
}

export function groupStdfFragmentIndex(
  indices: readonly StdfFragmentIndex[],
): Map<string, StdfFragmentIndex[]> {
  const map = new Map<string, StdfFragmentIndex[]>();
  for (const idx of indices) {
    const list = map.get(idx.stemId) ?? [];
    list.push(idx);
    map.set(idx.stemId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.partIndex - b.partIndex);
  }
  return map;
}

export async function loadStdfFragmentsForStem(
  lazy: Mp5LazyHandle,
  stemId: string,
): Promise<StdfFragmentRecord[]> {
  const grouped = groupStdfFragmentIndex(lazy.stdfFragmentIndex);
  const entries = grouped.get(stemId) ?? [];
  const out: StdfFragmentRecord[] = [];
  for (const entry of entries) {
    const rec = await loadStdfFragmentRecord(lazy, entry.index);
    if (rec) out.push(rec);
  }
  return out;
}

export function lazyChunkEntry(
  lazy: Mp5LazyHandle,
  fourcc: string,
  repeatIndex = 0,
): { payloadOffset: number; payloadLength: number } | undefined {
  const matches = lazy.chunkIndex.filter((c) => c.fourcc === fourcc);
  const entry = matches[repeatIndex];
  if (!entry) return undefined;
  return { payloadOffset: entry.payloadOffset, payloadLength: entry.payloadLength };
}

export async function loadOptionalChunk(
  file: Mp5File,
  fourcc: string,
): Promise<Uint8Array | undefined> {
  const existing = file.optional.get(fourcc);
  if (existing) return existing;
  if (!file.lazy) return undefined;
  const loc = lazyChunkEntry(file.lazy, fourcc);
  if (!loc) return undefined;
  const bytes = await readPayload(file.lazy, loc.payloadOffset, loc.payloadLength);
  file.optional.set(fourcc, bytes);
  return bytes;
}
