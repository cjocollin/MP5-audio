import {
  decodeJsonChunk,
  encodeJsonChunk,
  sanitizeJsonString,
} from "./chunkJson.js";
import { normalizeSha256Hex } from "./sha256Hex.js";

export const HASH_VERSION = 1;
export const MAX_CHUNK_HASH_ENTRIES = 48;

export interface ChunkHashEntry {
  fourcc: string;
  sha256: string;
  size?: number;
}

export interface HashPayload {
  version?: number;
  algorithm?: "sha256";
  chunks?: ChunkHashEntry[];
  fileSha256?: string;
}

const ALLOWED_INTEGRITY_FOURCC = new Set([
  "HEAD",
  "META",
  "AUDI",
  "COVR",
  "LYRC",
  "SEEK",
  "WAVE",
  "INFO",
  "CORR",
  "STEM",
  "STDA",
  "SECT",
  "HOOK",
  "HILT",
  "VISU",
  "CRDT",
  "LICN",
  "IDEN",
  "EXPL",
  "SAFE",
  "SENS",
  "RECV",
  "MOOD",
  "VIBE",
  "FING",
]);

function parseFourcc(s: unknown): string | undefined {
  const v = sanitizeJsonString(s, 4);
  if (!v || v.length !== 4 || !/^[A-Za-z0-9]{4}$/.test(v)) return undefined;
  return v.toUpperCase();
}

function parseChunkEntry(raw: unknown): ChunkHashEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const fourcc = parseFourcc(o.fourcc);
  const sha256 = normalizeSha256Hex(o.sha256);
  if (!fourcc || !sha256 || !ALLOWED_INTEGRITY_FOURCC.has(fourcc)) return null;
  const size =
    typeof o.size === "number" && Number.isFinite(o.size) && o.size >= 0
      ? Math.floor(o.size)
      : undefined;
  return { fourcc, sha256, size };
}

export function hasHashContent(p: HashPayload): boolean {
  return !!(p.fileSha256 || p.chunks?.length);
}

export function normalizeHashRecord(raw: Record<string, unknown>): HashPayload | null {
  const fileSha256 = normalizeSha256Hex(raw.fileSha256);
  const chunks: ChunkHashEntry[] = [];
  if (Array.isArray(raw.chunks)) {
    for (const item of raw.chunks.slice(0, MAX_CHUNK_HASH_ENTRIES)) {
      const e = parseChunkEntry(item);
      if (e) chunks.push(e);
    }
  }
  const algorithm = raw.algorithm === "sha256" ? "sha256" : undefined;
  const payload: HashPayload = {
    version: 1,
    algorithm: algorithm ?? (fileSha256 || chunks.length ? "sha256" : undefined),
    chunks: chunks.length ? chunks : undefined,
    fileSha256,
  };
  return hasHashContent(payload) ? payload : null;
}

export function encodeHash(p: HashPayload): Uint8Array {
  const normalized = normalizeHashRecord(p as unknown as Record<string, unknown>);
  if (!normalized) throw new Error("HASH payload has no integrity fields");
  return encodeJsonChunk(normalized);
}

export function decodeHash(data?: Uint8Array): HashPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "HASH");
  if (!raw) return null;
  return normalizeHashRecord(raw);
}
