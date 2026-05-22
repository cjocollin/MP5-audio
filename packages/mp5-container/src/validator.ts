import {
  ChunkFourCC,
  MAX_CHUNKS,
  MAX_CHUNK_PAYLOAD,
  MAX_FILE_SIZE,
  REQUIRED_CHUNKS,
} from "./constants.js";
import { Mp5SecurityError, Mp5ValidationError } from "./errors.js";
import type { Mp5File, SeekEntry } from "./types.js";

export function validateFileSize(size: number): void {
  if (size > MAX_FILE_SIZE) {
    throw new Mp5SecurityError(`File exceeds max size ${MAX_FILE_SIZE}`);
  }
}

export function validateChunkPayloadSize(size: number): void {
  if (size > MAX_CHUNK_PAYLOAD) {
    throw new Mp5SecurityError(`Chunk payload exceeds ${MAX_CHUNK_PAYLOAD}`);
  }
}

export function validateSeekTable(entries: SeekEntry[]): void {
  let lastSample = -1n;
  let lastByte = -1n;
  for (const e of entries) {
    if (e.sampleOffset < lastSample || e.byteOffset < lastByte) {
      throw new Mp5ValidationError("Seek table must be monotonic");
    }
    lastSample = e.sampleOffset;
    lastByte = e.byteOffset;
  }
}

export function validateParsedFile(file: Mp5File, chunkCount: number): void {
  if (chunkCount > MAX_CHUNKS) {
    throw new Mp5SecurityError(`Too many chunks: ${chunkCount}`);
  }
  if (!file.head) {
    throw new Mp5ValidationError("Missing HEAD chunk");
  }
  if (file.audioFrames.length === 0 && !file.lazy?.audi) {
    throw new Mp5ValidationError("Missing AUDI chunk");
  }
  if (file.seek.length > 0) {
    validateSeekTable(file.seek);
  }
}

export function isRequiredChunk(fourcc: string): boolean {
  return REQUIRED_CHUNKS.has(fourcc);
}

export function assertKnownCritical(fourcc: string): boolean {
  return (
    fourcc === ChunkFourCC.HEAD ||
    fourcc === ChunkFourCC.META ||
    fourcc === ChunkFourCC.COVR ||
    fourcc === ChunkFourCC.AUDI ||
    fourcc === ChunkFourCC.SEEK ||
    fourcc === ChunkFourCC.WAVE ||
    fourcc === ChunkFourCC.INFO ||
    fourcc === ChunkFourCC.CORR
  );
}
