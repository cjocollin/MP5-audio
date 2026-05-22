import type { CodecIdValue } from "./constants.js";
import type { CoverArt } from "./coverArt.js";

export interface FileHeader {
  majorVersion: number;
  fileFlags: number;
}

export interface HeadPayload {
  codecId: CodecIdValue;
  channels: number;
  bitsPerSample: number;
  presetId: number;
  sampleRate: number;
  totalSamples: bigint;
  encoderVersion: number;
}

export interface AudioFrame {
  frameIndex: number;
  blockType: number;
  flags: number;
  data: Uint8Array;
}

export interface SeekEntry {
  sampleOffset: bigint;
  byteOffset: bigint;
}

export interface MetaField {
  key: string;
  value: string;
}

export interface ParsedChunk {
  fourcc: string;
  flags: number;
  payload: Uint8Array;
  crc32: number;
  skipped?: boolean;
  invalid?: boolean;
}

/** Indexed STDF fragment (payload not loaded until requested). */
export interface StdfFragmentIndex {
  /** Index in lazy.stdfFragmentIndex (same as array index). */
  index: number;
  payloadOffset: number;
  payloadLength: number;
  flags: number;
  storedCrc: number;
  version: number;
  stemId: string;
  partIndex: number;
  partCount: number;
  innerPayloadLength: number;
  payloadCrc32: number;
}

export interface Mp5ChunkIndexEntry {
  fourcc: string;
  chunkOffset: number;
  payloadOffset: number;
  payloadLength: number;
  flags: number;
  storedCrc: number;
  repeatIndex: number;
}

export interface Mp5LazyHandle {
  ingestMode: "lazy-indexed";
  fileSize: number;
  chunkIndex: Mp5ChunkIndexEntry[];
  stdfFragmentIndex: StdfFragmentIndex[];
  audi?: { payloadOffset: number; payloadLength: number };
  /** Bytes copied from blob via slice (diagnostics). */
  loadedPayloadBytes: number;
  readPayload: (offset: number, length: number) => Promise<Uint8Array>;
}

export interface Mp5File {
  header: FileHeader;
  /** Present when file was indexed without eager payload copies. */
  lazy?: Mp5LazyHandle;
  head?: HeadPayload;
  meta: MetaField[];
  /** Raw COVR payload bytes */
  cover?: Uint8Array;
  /** Parsed cover when COVR present */
  coverArt?: CoverArt;
  audioFrames: AudioFrame[];
  seek: SeekEntry[];
  waveform: number[];
  info: MetaField[];
  corr: { frameIndex: number; data: Uint8Array }[];
  optional: Map<string, Uint8Array>;
  /** STDF v1 segmented stem payloads (one file chunk per fragment). */
  stdfFragments: Uint8Array[];
  warnings: string[];
}
