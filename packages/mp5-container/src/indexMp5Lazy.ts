import {
  CHUNK_FLAG_CRC,
  CHUNK_HEADER_SIZE,
  FILE_HEADER_SIZE,
  MAGIC_STR,
  MAJOR_VERSION,
} from "./constants.js";
import { crc32 } from "./checksum.js";
import { AI_FOURCC_SET } from "./aiChunks.js";
import { isOptionalChunk, isWarningChunk } from "./advancedChunks.js";
import { isMoonshotChunk } from "./moonshotChunks.js";
import { Mp5ParseError } from "./errors.js";
import { decodeCover } from "./coverArt.js";
import { decodeMeta } from "./metadata.js";
import { parseAudiFrames, parseHead, parseSeek, parseWave } from "./containerParser.js";
import {
  decodeStdfFragmentHeader,
  STEM_FRAGMENT_FOURCC,
  STDF_HEADER_PREFIX_MAX,
} from "./stemStdf.js";
import { validateChunkPayloadSize, validateFileSize, validateParsedFile } from "./validator.js";
import type { Mp5ByteSource } from "./byteSource.js";
import { byteSourceFromBlob } from "./byteSource.js";
import type {
  Mp5ChunkIndexEntry,
  Mp5File,
  Mp5LazyHandle,
  StdfFragmentIndex,
} from "./types.js";

export type Mp5IndexStage =
  | "identify"
  | "scanning_chunks"
  | "basic_playback"
  | "optional_metadata"
  | "done";

export interface Mp5IndexProgress {
  stage: Mp5IndexStage;
  chunksScanned: number;
  stdfFragmentCount: number;
}

export const LAZY_INGEST_BYTES = 48 * 1024 * 1024;
export const EAGER_OPTIONAL_PAYLOAD_MAX = 256 * 1024;
export const COVR_EAGER_MAX_BYTES = 1024 * 1024;

let lazyIngestThresholdBytes = LAZY_INGEST_BYTES;

export function getLazyIngestThresholdBytes(): number {
  return lazyIngestThresholdBytes;
}

export function setLazyIngestThresholdForTests(bytes: number): void {
  lazyIngestThresholdBytes = Math.max(1024, bytes);
}

export function resetLazyIngestThresholdForTests(): void {
  lazyIngestThresholdBytes = LAZY_INGEST_BYTES;
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function shouldEagerPayload(fourcc: string, payloadSize: number): boolean {
  if (fourcc === "AUDI" || fourcc === STEM_FRAGMENT_FOURCC) return false;
  if (fourcc === "COVR") return payloadSize <= COVR_EAGER_MAX_BYTES;
  if (fourcc === "HEAD" || fourcc === "SEEK" || fourcc === "WAVE") return true;
  return payloadSize <= EAGER_OPTIONAL_PAYLOAD_MAX;
}

export async function indexMp5FromByteSource(
  source: Mp5ByteSource,
  opts?: {
    yieldEveryChunks?: number;
    onProgress?: (p: Mp5IndexProgress) => void;
  },
): Promise<Mp5File> {
  const yieldEvery = Math.max(1, opts?.yieldEveryChunks ?? 4);
  validateFileSize(source.size);

  opts?.onProgress?.({ stage: "identify", chunksScanned: 0, stdfFragmentCount: 0 });
  await yieldToMain();

  if (source.size < FILE_HEADER_SIZE) {
    throw new Mp5ParseError("File too short");
  }

  const fileHdr = await source.read(0, FILE_HEADER_SIZE);
  const magic = readFourCC(new DataView(fileHdr.buffer, fileHdr.byteOffset), 0);
  if (magic !== MAGIC_STR) {
    throw new Mp5ParseError(`Invalid magic: ${magic}`);
  }
  const majorVersion = fileHdr[4]!;
  if (majorVersion !== MAJOR_VERSION) {
    throw new Mp5ParseError(`Unsupported version: ${majorVersion}`);
  }
  const fileFlags = new DataView(fileHdr.buffer, fileHdr.byteOffset).getUint32(8, true);

  const chunkIndex: Mp5ChunkIndexEntry[] = [];
  const stdfFragmentIndex: StdfFragmentIndex[] = [];
  let loadedPayloadBytes = 0;

  const readPayload = async (offset: number, length: number): Promise<Uint8Array> => {
    const bytes = await source.read(offset, length);
    loadedPayloadBytes += bytes.length;
    return bytes;
  };

  const file: Mp5File = {
    header: { majorVersion, fileFlags },
    meta: [],
    audioFrames: [],
    seek: [],
    waveform: [],
    info: [],
    corr: [],
    optional: new Map(),
    stdfFragments: [],
    warnings: [],
  };

  let offset = FILE_HEADER_SIZE;
  let chunkCount = 0;
  const fourccCounts = new Map<string, number>();
  let audi: Mp5LazyHandle["audi"];

  opts?.onProgress?.({ stage: "scanning_chunks", chunksScanned: 0, stdfFragmentCount: 0 });

  while (offset + CHUNK_HEADER_SIZE <= source.size) {
    chunkCount++;
    const hdr = await source.read(offset, CHUNK_HEADER_SIZE);
    const hv = new DataView(hdr.buffer, hdr.byteOffset, hdr.byteLength);
    const fourcc = readFourCC(hv, 0);
    const payloadSize = hv.getUint32(4, true);
    const flags = hv.getUint16(8, true);
    const storedCrc = hv.getUint32(12, true);

    validateChunkPayloadSize(payloadSize);

    const payloadStart = offset + CHUNK_HEADER_SIZE;
    const payloadEnd = payloadStart + payloadSize;
    if (payloadEnd > source.size) {
      throw new Mp5ParseError(`Chunk ${fourcc} extends past EOF`);
    }

    const repeatIndex = fourccCounts.get(fourcc) ?? 0;
    fourccCounts.set(fourcc, repeatIndex + 1);

    chunkIndex.push({
      fourcc,
      chunkOffset: offset,
      payloadOffset: payloadStart,
      payloadLength: payloadSize,
      flags,
      storedCrc,
      repeatIndex,
    });

    offset = payloadEnd;

    if (chunkCount % yieldEvery === 0) {
      opts?.onProgress?.({
        stage: "scanning_chunks",
        chunksScanned: chunkCount,
        stdfFragmentCount: stdfFragmentIndex.length,
      });
      await yieldToMain();
    }

    if (fourcc === STEM_FRAGMENT_FOURCC) {
      const prefixLen = Math.min(payloadSize, STDF_HEADER_PREFIX_MAX);
      const prefix = await readPayload(payloadStart, prefixLen);
      const header = decodeStdfFragmentHeader(prefix);
      if (header) {
        stdfFragmentIndex.push({
          index: stdfFragmentIndex.length,
          payloadOffset: payloadStart,
          payloadLength: payloadSize,
          flags,
          storedCrc,
          version: header.version,
          stemId: header.stemId,
          partIndex: header.partIndex,
          partCount: header.partCount,
          innerPayloadLength: header.payloadLength,
          payloadCrc32: header.payloadCrc32,
        });
      }
      continue;
    }

    if (fourcc === "AUDI") {
      audi = { payloadOffset: payloadStart, payloadLength: payloadSize };
      if (flags & CHUNK_FLAG_CRC) {
        const payload = await readPayload(payloadStart, payloadSize);
        const computed = crc32(payload);
        if (computed !== storedCrc) {
          throw new Mp5ParseError("CRC mismatch for chunk AUDI");
        }
        file.audioFrames.push(...parseAudiFrames(payload));
      }
      continue;
    }

    const eager = shouldEagerPayload(fourcc, payloadSize);
    if (!eager) continue;

    const payload = await readPayload(payloadStart, payloadSize);

    if (flags & CHUNK_FLAG_CRC) {
      const computed = crc32(payload);
      if (computed !== storedCrc) {
        const optional =
          isOptionalChunk(fourcc) ||
          isWarningChunk(fourcc) ||
          AI_FOURCC_SET.has(fourcc) ||
          isMoonshotChunk(fourcc);
        if (optional) {
          file.warnings.push(`CRC mismatch for optional chunk ${fourcc}, skipped`);
          continue;
        }
        throw new Mp5ParseError(`CRC mismatch for chunk ${fourcc}`);
      }
    }

    await applyEagerChunk(file, fourcc, payload, repeatIndex);
  }

  if (offset < source.size) {
    throw new Mp5ParseError("Unexpected trailing data or truncated chunk header");
  }

  opts?.onProgress?.({
    stage: "basic_playback",
    chunksScanned: chunkCount,
    stdfFragmentCount: stdfFragmentIndex.length,
  });
  await yieldToMain();

  file.lazy = {
    ingestMode: "lazy-indexed",
    fileSize: source.size,
    chunkIndex,
    stdfFragmentIndex,
    audi,
    loadedPayloadBytes,
    readPayload,
  };

  opts?.onProgress?.({
    stage: "optional_metadata",
    chunksScanned: chunkCount,
    stdfFragmentCount: stdfFragmentIndex.length,
  });
  await yieldToMain();

  validateParsedFile(file, chunkCount);

  opts?.onProgress?.({
    stage: "done",
    chunksScanned: chunkCount,
    stdfFragmentCount: stdfFragmentIndex.length,
  });

  return file;
}

async function applyEagerChunk(
  file: Mp5File,
  fourcc: string,
  payload: Uint8Array,
  repeatIndex: number,
): Promise<void> {
  switch (fourcc) {
    case "HEAD":
      file.head = parseHead(payload);
      break;
    case "META":
      if (repeatIndex === 0) file.meta = decodeMeta(payload);
      break;
    case "COVR":
      if (repeatIndex === 0) {
        file.cover = payload;
        try {
          const art = decodeCover(payload);
          if (art) file.coverArt = art;
        } catch (e) {
          file.warnings.push(
            `COVR parse warning: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      break;
    case "SEEK":
      file.seek = parseSeek(payload);
      break;
    case "WAVE":
      file.waveform = parseWave(payload);
      break;
    case "INFO":
      file.info = decodeMeta(payload);
      break;
    case "CORR": {
      const v = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      let o = 0;
      while (o + 8 <= payload.length) {
        const frameIndex = v.getUint32(o, true);
        const len = v.getUint32(o + 4, true);
        o += 8;
        if (o + len > payload.length) break;
        file.corr.push({ frameIndex, data: payload.slice(o, o + len) });
        o += len;
      }
      break;
    }
    default:
      if (file.optional.has(fourcc)) {
        file.warnings.push(`Duplicate optional chunk ${fourcc} — keeping first`);
      } else {
        file.optional.set(fourcc, payload);
      }
      break;
  }
}

export async function indexMp5FromBlob(
  blob: Blob,
  opts?: Parameters<typeof indexMp5FromByteSource>[1],
): Promise<Mp5File> {
  return indexMp5FromByteSource(byteSourceFromBlob(blob), opts);
}
