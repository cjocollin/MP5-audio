export const MAGIC = new Uint8Array([0x4d, 0x50, 0x35, 0x41]); // MP5A
export const MAGIC_STR = "MP5A";
export const MAJOR_VERSION = 1;
export const CHUNK_HEADER_SIZE = 16;
export const FILE_HEADER_SIZE = 12;
export const HEAD_PAYLOAD_SIZE = 32;
export const MAX_CHUNK_PAYLOAD = 64 * 1024 * 1024;
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
export const MAX_CHUNKS = 256;
export const MAX_META_VALUE = 8 * 1024;
export const CHUNK_FLAG_CRC = 1;

export const CodecId = {
  PCM: 0,
  MP5C: 1,
  MP5L: 2,
  MP5H: 3,
  PASSTHROUGH: 4,
  /**
   * MP5-C2 — lossless / bit-exact. Quiet units are MP5-L; loud units take
   * min(signal-relative + lossless CORR, MP5-L). Lab-gated, non-default export.
   */
  MP5C2: 5,
  /**
   * MP5-C — experimental lossy MDCT loud path with bit-exact protect islands.
   * Magic `0x43 0x36`, CRC-framed units. See `docs/MP5C_NEXT_SPEC.md`.
   * Lab-gated, non-default export; the bitstream is not frozen.
   */
  MP5C6: 6,
  PRIVATE: 255,
} as const;

export type CodecIdValue = (typeof CodecId)[keyof typeof CodecId];

export const ChunkFourCC = {
  HEAD: "HEAD",
  META: "META",
  COVR: "COVR",
  AUDI: "AUDI",
  SEEK: "SEEK",
  WAVE: "WAVE",
  INFO: "INFO",
  CORR: "CORR",
  LYRC: "LYRC",
  MOOD: "MOOD",
  VIBE: "VIBE",
  SECT: "SECT",
  STEM: "STEM",
  BEAT: "BEAT",
  SUMM: "SUMM",
  FING: "FING",
  RECS: "RECS",
  VISU: "VISU",
  EXPL: "EXPL",
  SAFE: "SAFE",
  RECV: "RECV",
  SENS: "SENS",
} as const;

export const REQUIRED_CHUNKS = new Set<string>([ChunkFourCC.HEAD, ChunkFourCC.AUDI]);
