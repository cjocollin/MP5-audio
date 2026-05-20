import {
  CHUNK_FLAG_CRC,
  CHUNK_HEADER_SIZE,
  FILE_HEADER_SIZE,
  HEAD_PAYLOAD_SIZE,
  MAGIC,
  MAJOR_VERSION,
} from "./constants.js";
import { crc32 } from "./checksum.js";
import { encodeCover, type CoverArt } from "./coverArt.js";
import { encodeMeta } from "./metadata.js";
import type { AudioFrame, HeadPayload, MetaField, SeekEntry } from "./types.js";

export interface WriteMp5Options {
  head: HeadPayload;
  meta?: MetaField[];
  cover?: Uint8Array | CoverArt;
  audioFrames: AudioFrame[];
  seek?: SeekEntry[];
  waveform?: number[];
  info?: MetaField[];
  corr?: { frameIndex: number; data: Uint8Array }[];
  optional?: Map<string, Uint8Array>;
}

function writeChunk(
  parts: Uint8Array[],
  fourcc: string,
  payload: Uint8Array,
  useCrc = true,
): void {
  const header = new Uint8Array(CHUNK_HEADER_SIZE);
  const hv = new DataView(header.buffer);
  for (let i = 0; i < 4; i++) hv.setUint8(i, fourcc.charCodeAt(i));
  hv.setUint32(4, payload.length, true);
  const flags = useCrc ? CHUNK_FLAG_CRC : 0;
  hv.setUint16(8, flags, true);
  hv.setUint16(10, 0, true);
  const c = useCrc ? crc32(payload) : 0;
  hv.setUint32(12, c, true);
  parts.push(header, payload);
}

function encodeHead(head: HeadPayload): Uint8Array {
  const buf = new Uint8Array(HEAD_PAYLOAD_SIZE);
  const v = new DataView(buf.buffer);
  v.setUint8(0, head.codecId);
  v.setUint8(1, head.channels);
  v.setUint8(2, head.bitsPerSample);
  v.setUint8(3, head.presetId);
  v.setUint32(4, head.sampleRate, true);
  v.setBigUint64(8, head.totalSamples, true);
  v.setUint16(16, head.encoderVersion, true);
  return buf;
}

function encodeAudi(frames: AudioFrame[]): Uint8Array {
  let size = 0;
  for (const f of frames) size += 10 + f.data.length;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  let o = 0;
  for (const f of frames) {
    v.setUint32(o, f.frameIndex, true);
    v.setUint32(o + 4, f.data.length, true);
    v.setUint8(o + 8, f.blockType);
    v.setUint8(o + 9, f.flags);
    o += 10;
    out.set(f.data, o);
    o += f.data.length;
  }
  return out;
}

function encodeSeek(entries: SeekEntry[]): Uint8Array {
  const buf = new Uint8Array(entries.length * 16);
  const v = new DataView(buf.buffer);
  entries.forEach((e, i) => {
    const o = i * 16;
    v.setBigUint64(o, e.sampleOffset, true);
    v.setBigUint64(o + 8, e.byteOffset, true);
  });
  return buf;
}

function encodeWave(peaks: number[]): Uint8Array {
  const buf = new Uint8Array(4 + peaks.length * 4);
  const v = new DataView(buf.buffer);
  v.setUint32(0, peaks.length, true);
  peaks.forEach((p, i) => v.setFloat32(4 + i * 4, p, true));
  return buf;
}

function encodeCorr(corr: { frameIndex: number; data: Uint8Array }[]): Uint8Array {
  let size = 0;
  for (const c of corr) size += 8 + c.data.length;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  let o = 0;
  for (const c of corr) {
    v.setUint32(o, c.frameIndex, true);
    v.setUint32(o + 4, c.data.length, true);
    o += 8;
    out.set(c.data, o);
    o += c.data.length;
  }
  return out;
}

export function writeMp5(options: WriteMp5Options): Uint8Array {
  const parts: Uint8Array[] = [];

  const fileHeader = new Uint8Array(FILE_HEADER_SIZE);
  fileHeader.set(MAGIC, 0);
  fileHeader[4] = MAJOR_VERSION;
  const fv = new DataView(fileHeader.buffer);
  fv.setUint32(8, 0, true);
  parts.push(fileHeader);

  writeChunk(parts, "HEAD", encodeHead(options.head));
  if (options.meta?.length) writeChunk(parts, "META", encodeMeta(options.meta));
  if (options.cover) {
    const covPayload =
      options.cover instanceof Uint8Array
        ? options.cover
        : encodeCover(options.cover);
    if (covPayload.length) writeChunk(parts, "COVR", covPayload);
  }
  writeChunk(parts, "AUDI", encodeAudi(options.audioFrames));
  if (options.seek?.length) writeChunk(parts, "SEEK", encodeSeek(options.seek));
  if (options.waveform?.length) writeChunk(parts, "WAVE", encodeWave(options.waveform));
  if (options.info?.length) writeChunk(parts, "INFO", encodeMeta(options.info));
  if (options.corr?.length) writeChunk(parts, "CORR", encodeCorr(options.corr));
  if (options.optional) {
    for (const [fourcc, payload] of options.optional) {
      writeChunk(parts, fourcc, payload);
    }
  }

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
