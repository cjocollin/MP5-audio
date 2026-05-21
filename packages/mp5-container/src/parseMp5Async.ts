import {
  CHUNK_FLAG_CRC,
  CHUNK_HEADER_SIZE,
  FILE_HEADER_SIZE,
  HEAD_PAYLOAD_SIZE,
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
import { STEM_FRAGMENT_FOURCC } from "./stemStdf.js";
import { validateChunkPayloadSize, validateFileSize, validateParsedFile } from "./validator.js";
import type { AudioFrame, HeadPayload, Mp5File, SeekEntry } from "./types.js";

export type Mp5ParseStage =
  | "reading"
  | "parsing_chunks"
  | "indexing_stems"
  | "done";

export interface Mp5ParseProgress {
  stage: Mp5ParseStage;
  chunksParsed: number;
  stdfFragmentCount: number;
}

export const LARGE_MP5_PARSE_BYTES = 48 * 1024 * 1024;

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function parseHead(payload: Uint8Array): HeadPayload {
  if (payload.length < HEAD_PAYLOAD_SIZE) {
    throw new Mp5ParseError("HEAD payload too short");
  }
  const v = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    codecId: v.getUint8(0) as HeadPayload["codecId"],
    channels: v.getUint8(1),
    bitsPerSample: v.getUint8(2),
    presetId: v.getUint8(3),
    sampleRate: v.getUint32(4, true),
    totalSamples: v.getBigUint64(8, true),
    encoderVersion: v.getUint16(16, true),
  };
}

function parseAudiFrames(payload: Uint8Array): AudioFrame[] {
  const frames: AudioFrame[] = [];
  const v = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let o = 0;
  while (o + 10 <= payload.length) {
    const frameIndex = v.getUint32(o, true);
    const byteLength = v.getUint32(o + 4, true);
    const blockType = v.getUint8(o + 8);
    const flags = v.getUint8(o + 9);
    o += 10;
    if (o + byteLength > payload.length) break;
    const data = payload.slice(o, o + byteLength);
    o += byteLength;
    frames.push({ frameIndex, blockType, flags, data });
  }
  return frames;
}

function parseSeek(payload: Uint8Array): SeekEntry[] {
  const entries: SeekEntry[] = [];
  const v = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let o = 0;
  while (o + 16 <= payload.length) {
    entries.push({
      sampleOffset: v.getBigUint64(o, true),
      byteOffset: v.getBigUint64(o + 8, true),
    });
    o += 16;
  }
  return entries;
}

function parseWave(payload: Uint8Array): number[] {
  const v = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (payload.length < 4) return [];
  const count = v.getUint32(0, true);
  const peaks: number[] = [];
  for (let i = 0; i < count && 4 + (i + 1) * 4 <= payload.length; i++) {
    peaks.push(v.getFloat32(4 + i * 4, true));
  }
  return peaks;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Same semantics as parseMp5, yielding to the event loop every N chunks for UI responsiveness.
 */
export async function parseMp5Async(
  buffer: ArrayBuffer | Uint8Array,
  opts?: { yieldEveryChunks?: number; onProgress?: (p: Mp5ParseProgress) => void },
): Promise<Mp5File> {
  const yieldEvery = Math.max(1, opts?.yieldEveryChunks ?? 4);
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  validateFileSize(data.length);

  opts?.onProgress?.({ stage: "reading", chunksParsed: 0, stdfFragmentCount: 0 });
  await yieldToMain();

  if (data.length < FILE_HEADER_SIZE) {
    throw new Mp5ParseError("File too short");
  }

  const magic = readFourCC(new DataView(data.buffer, data.byteOffset), 0);
  if (magic !== MAGIC_STR) {
    throw new Mp5ParseError(`Invalid magic: ${magic}`);
  }

  const majorVersion = data[4]!;
  if (majorVersion !== MAJOR_VERSION) {
    throw new Mp5ParseError(`Unsupported version: ${majorVersion}`);
  }

  const fileFlags = new DataView(data.buffer, data.byteOffset).getUint32(8, true);

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

  opts?.onProgress?.({ stage: "parsing_chunks", chunksParsed: 0, stdfFragmentCount: 0 });

  while (offset + CHUNK_HEADER_SIZE <= data.length) {
    chunkCount++;
    const hv = new DataView(data.buffer, data.byteOffset + offset);
    const fourcc = readFourCC(hv, 0);
    const payloadSize = hv.getUint32(4, true);
    const flags = hv.getUint16(8, true);
    const storedCrc = hv.getUint32(12, true);

    validateChunkPayloadSize(payloadSize);

    const payloadStart = offset + CHUNK_HEADER_SIZE;
    const payloadEnd = payloadStart + payloadSize;
    if (payloadEnd > data.length) {
      throw new Mp5ParseError(`Chunk ${fourcc} extends past EOF`);
    }

    const payload = data.slice(payloadStart, payloadEnd);
    offset = payloadEnd;

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

    switch (fourcc) {
      case "HEAD":
        file.head = parseHead(payload);
        break;
      case "META":
        file.meta = decodeMeta(payload);
        break;
      case "COVR": {
        file.cover = payload;
        try {
          const art = decodeCover(payload);
          if (art) file.coverArt = art;
        } catch (e) {
          file.warnings.push(
            `COVR parse warning: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        break;
      }
      case "AUDI":
        file.audioFrames.push(...parseAudiFrames(payload));
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
      case STEM_FRAGMENT_FOURCC:
        file.stdfFragments.push(payload);
        break;
      default:
        if (file.optional.has(fourcc)) {
          file.warnings.push(`Duplicate optional chunk ${fourcc} — keeping first`);
        } else {
          file.optional.set(fourcc, payload);
        }
        break;
    }

    if (chunkCount % yieldEvery === 0) {
      opts?.onProgress?.({
        stage: "parsing_chunks",
        chunksParsed: chunkCount,
        stdfFragmentCount: file.stdfFragments.length,
      });
      await yieldToMain();
    }
  }

  if (offset < data.length) {
    throw new Mp5ParseError("Unexpected trailing data or truncated chunk header");
  }

  opts?.onProgress?.({
    stage: "indexing_stems",
    chunksParsed: chunkCount,
    stdfFragmentCount: file.stdfFragments.length,
  });
  await yieldToMain();

  validateParsedFile(file, chunkCount);

  opts?.onProgress?.({
    stage: "done",
    chunksParsed: chunkCount,
    stdfFragmentCount: file.stdfFragments.length,
  });
  return file;
}
