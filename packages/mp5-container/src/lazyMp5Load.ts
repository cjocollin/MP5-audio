import { crc32, crc32Async } from "./checksum.js";
import { yieldToEventLoop } from "./scheduling.js";
import { CHUNK_FLAG_CRC } from "./constants.js";
import { Mp5ParseError } from "./errors.js";
import { parseAudiFrames } from "./containerParser.js";
import { decodeStdfFragment, type StdfFragmentRecord } from "./stemStdf.js";
import type { AudioFrame, Mp5File, Mp5LazyHandle, StdfFragmentIndex } from "./types.js";

/** CRC yield size — keeps the UI responsive while verifying multi‑MB AUDI/STDF/CORR. */
const AUDI_CRC_YIELD_BYTES = 64 * 1024;
const CRC_YIELD_BYTES = 64 * 1024;

/** CRC a buffer, yielding for large payloads so stem/karaoke prep never freezes. */
async function crcMaybeAsync(bytes: Uint8Array): Promise<number> {
  return bytes.length >= CRC_YIELD_BYTES
    ? crc32Async(bytes, { chunkBytes: CRC_YIELD_BYTES, yieldToMain: yieldToEventLoop })
    : crc32(bytes);
}

const yieldToMain = yieldToEventLoop;

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

/**
 * Peek the first AUDI frame's payload bytes without CRC or full-chunk load.
 * Used for progressive MP5-L version detection before decode.
 */
export async function peekAudiFramePrefix(
  file: Mp5File,
  maxFrameBytes = 16,
): Promise<Uint8Array | null> {
  if (file.audioFrames[0]?.data) {
    return file.audioFrames[0].data.subarray(
      0,
      Math.min(maxFrameBytes, file.audioFrames[0].data.length),
    );
  }
  if (!file.lazy?.audi) return null;
  // Frame header is 10 bytes; magic/version sit at the start of frame data.
  const need = Math.min(file.lazy.audi.payloadLength, 10 + maxFrameBytes);
  const prefix = await file.lazy.readPayload(file.lazy.audi.payloadOffset, need);
  if (prefix.length < 12) return null;
  const byteLength = new DataView(
    prefix.buffer,
    prefix.byteOffset,
    prefix.byteLength,
  ).getUint32(4, true);
  const dataStart = 10;
  const dataEnd = Math.min(prefix.length, dataStart + Math.min(byteLength, maxFrameBytes));
  if (dataEnd <= dataStart) return null;
  return prefix.subarray(dataStart, dataEnd);
}

export async function loadAudiFrames(file: Mp5File): Promise<AudioFrame[]> {
  if (file.audioFrames.length) return file.audioFrames;
  if (!file.lazy) {
    throw new Mp5ParseError("No audio frames");
  }
  // Single-flight: play, prefetch, and integrity verify can all request AUDI
  // concurrently — each racing load used to duplicate the multi‑MB payload
  // into audioFrames and stack decode-sized allocations.
  let inFlight = file.lazy.audiLoadPromise;
  if (!inFlight) {
    const lazy = file.lazy;
    inFlight = (async () => {
      const audiEntry = lazy.chunkIndex.find((c) => c.fourcc === "AUDI");
      const payload = await loadAudiPayload(lazy);
      if (audiEntry && audiEntry.flags & CHUNK_FLAG_CRC) {
        // Never sync-CRC multi‑MB AUDI on the UI thread — that froze "Decoding audio…".
        const computed =
          payload.length >= AUDI_CRC_YIELD_BYTES
            ? await crc32Async(payload, {
                chunkBytes: AUDI_CRC_YIELD_BYTES,
                yieldToMain,
              })
            : crc32(payload);
        if (computed !== audiEntry.storedCrc) {
          throw new Mp5ParseError("CRC mismatch for chunk AUDI");
        }
        await yieldToMain();
      }
      const frames = parseAudiFrames(payload);
      if (!file.audioFrames.length) {
        file.audioFrames.push(...frames);
      }
      return file.audioFrames;
    })();
    lazy.audiLoadPromise = inFlight;
    // A failed load (e.g. CRC mismatch) must not poison later retries.
    inFlight.catch(() => {
      lazy.audiLoadPromise = undefined;
    });
  }
  return inFlight;
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
    // Async CRC: STDF fragments run to 256KB each and were sync-CRC'd here,
    // freezing the UI ~16ms/stem on karaoke prep (the AUDI fix missed this path).
    const computed = await crcMaybeAsync(bytes);
    const stored = lazy.stdfFragmentIndex[index]!.storedCrc;
    if (computed !== stored) {
      throw new Mp5ParseError(
        `CRC mismatch for STDF fragment ${lazy.stdfFragmentIndex[index]!.stemId} part ${lazy.stdfFragmentIndex[index]!.partIndex + 1}`,
      );
    }
  }
  const rec = decodeStdfFragment(bytes);
  if (rec && lazy.stdfFragmentIndex[index]?.flags & CHUNK_FLAG_CRC) {
    const innerCrc = await crcMaybeAsync(rec.payload);
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
    // Breathe between fragments so a many-part stem cannot monopolize the thread.
    await yieldToEventLoop();
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

/**
 * Load + parse the CORR chunk (MP5-H enhancement layer) from a lazy handle.
 * The chunk index skips CORR bodies over the eager cap, so for lazy files
 * (now every file ≥2MB) `file.corr` stays empty and MP5-H decodes base-only.
 * Decode paths call this before reading `file.corr` so enhanced decode works.
 */
export async function loadCorrFrames(file: Mp5File): Promise<void> {
  if (file.corr.length) return;
  if (!file.lazy) return;
  const entry = file.lazy.chunkIndex.find((c) => c.fourcc === "CORR");
  if (!entry) return;
  const payload = await readPayload(file.lazy, entry.payloadOffset, entry.payloadLength);
  if (entry.flags & CHUNK_FLAG_CRC) {
    const computed = await crcMaybeAsync(payload);
    if (computed !== entry.storedCrc) {
      file.warnings.push("CRC mismatch for CORR — MP5-H enhancement skipped");
      return;
    }
  }
  const v = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let o = 0;
  while (o + 8 <= payload.length) {
    const frameIndex = v.getUint32(o, true);
    const len = v.getUint32(o + 4, true);
    o += 8;
    if (o + len > payload.length) break;
    file.corr.push({ frameIndex, data: payload.subarray(o, o + len) });
    o += len;
  }
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
