import {
  decodeJsonChunk,
  encodeJsonChunk,
  sanitizeJsonString,
} from "./chunkJson.js";
import { normalizeSha256Hex } from "./sha256Hex.js";

export const FING_VERSION = 1;

export type FingSource = "encoder" | "app" | "user" | "unknown";

export type AudioFingerprintType =
  | "sha256-pcm"
  | "sha256-audi"
  | "sha256-file"
  | "none"
  | "experimental-acoustic";

export interface FingPayload {
  version?: number;
  audioFingerprintType?: AudioFingerprintType;
  /** Primary library identity — usually pcmHash or audiHash. */
  audioFingerprint?: string;
  pcmHash?: string;
  audiHash?: string;
  metaHash?: string;
  fileHash?: string;
  fileSize?: number;
  durationMs?: number;
  sampleRate?: number;
  channels?: number;
  generatedBy?: string;
  generatedAt?: string;
  source?: FingSource;
  /** Reserved — not used in MVP (no acoustic fingerprinting). */
  acousticExperimental?: string;
}

const FING_TYPES: readonly AudioFingerprintType[] = [
  "sha256-pcm",
  "sha256-audi",
  "sha256-file",
  "none",
  "experimental-acoustic",
];

const MAX_GENERATED_BY = 128;
const MAX_ISO_DATE = 40;

function parseFingSource(s: unknown): FingSource | undefined {
  if (s === "encoder" || s === "app" || s === "user" || s === "unknown") return s;
  return undefined;
}

function parseFingerprintType(s: unknown): AudioFingerprintType | undefined {
  const v = sanitizeJsonString(s, 32)?.toLowerCase();
  if (v && (FING_TYPES as readonly string[]).includes(v)) return v as AudioFingerprintType;
  return undefined;
}

function parsePositiveInt(n: unknown): number | undefined {
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.floor(n);
  return undefined;
}

export function hasFingContent(p: FingPayload): boolean {
  return !!(
    p.audioFingerprint ||
    p.pcmHash ||
    p.audiHash ||
    p.metaHash ||
    p.fileHash ||
    p.fileSize != null ||
    p.durationMs != null ||
    p.sampleRate != null ||
    p.channels != null
  );
}

export function normalizeFingRecord(raw: Record<string, unknown>): FingPayload | null {
  const pcmHash = normalizeSha256Hex(raw.pcmHash);
  const audiHash = normalizeSha256Hex(raw.audiHash);
  const metaHash = normalizeSha256Hex(raw.metaHash);
  const fileHash = normalizeSha256Hex(raw.fileHash);
  let audioFingerprint = normalizeSha256Hex(raw.audioFingerprint);
  const audioFingerprintType = parseFingerprintType(raw.audioFingerprintType);
  if (!audioFingerprint) {
    audioFingerprint =
      audioFingerprintType === "sha256-audi"
        ? audiHash
        : audioFingerprintType === "sha256-file"
          ? fileHash
          : pcmHash ?? audiHash ?? fileHash;
  }
  const acousticExperimental = sanitizeJsonString(raw.acousticExperimental, 256);
  if (acousticExperimental) {
    /* drop experimental acoustic in MVP — never store */
  }
  const payload: FingPayload = {
    version: 1,
    audioFingerprintType: audioFingerprintType ?? (pcmHash ? "sha256-pcm" : audiHash ? "sha256-audi" : undefined),
    audioFingerprint,
    pcmHash,
    audiHash,
    metaHash,
    fileHash,
    fileSize: parsePositiveInt(raw.fileSize),
    durationMs: parsePositiveInt(raw.durationMs),
    sampleRate: parsePositiveInt(raw.sampleRate),
    channels: parsePositiveInt(raw.channels),
    generatedBy: sanitizeJsonString(raw.generatedBy, MAX_GENERATED_BY),
    generatedAt: sanitizeJsonString(raw.generatedAt, MAX_ISO_DATE),
    source: parseFingSource(raw.source),
  };
  return hasFingContent(payload) ? payload : null;
}

export function encodeFing(p: FingPayload): Uint8Array {
  const normalized = normalizeFingRecord(p as unknown as Record<string, unknown>);
  if (!normalized) throw new Error("FING payload has no fingerprint fields");
  return encodeJsonChunk(normalized);
}

export function decodeFing(data?: Uint8Array): FingPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "FING");
  if (!raw) return null;
  return normalizeFingRecord(raw);
}

/** Stable identity key for duplicate detection (pcm preferred, then audi, then file). */
export function fingIdentityKey(p: FingPayload | null | undefined): string | undefined {
  if (!p) return undefined;
  return p.pcmHash ?? p.audioFingerprint ?? p.audiHash ?? p.fileHash;
}

export function shortHashPreview(hex: string | undefined, chars = 12): string | undefined {
  if (!hex || hex.length < 8) return undefined;
  return `${hex.slice(0, chars)}…`;
}
