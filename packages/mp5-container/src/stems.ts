import { crc32 } from "./checksum.js";
import { CodecId } from "./constants.js";
import { decodeJsonChunk, encodeJsonChunk, sanitizeJsonString } from "./chunkJson.js";

/** Companion chunk for STEM manifest — concatenated stem audio payloads. */
export const STEM_DATA_FOURCC = "STDA";

export const STEM_MANIFEST_VERSION = 1;
export const STDA_VERSION = 1;

/** Recommended stem taxonomy (MVP). */
export const STEM_TYPES = [
  "full_mix",
  "lead_vocals",
  "background_vocals",
  "drums",
  "bass",
  "guitar",
  "piano",
  "synths",
  "strings",
  "percussion",
  "instrumental",
  "acapella",
  "effects",
  "custom",
] as const;

export type StemType = (typeof STEM_TYPES)[number];

export interface StemDescriptor {
  stemId: string;
  stemName: string;
  stemType: StemType;
  codecId: number;
  sampleRate: number;
  channels: number;
  /** Total PCM samples per channel (interleaved frame count × channels). */
  durationSamples: number;
  byteLength: number;
  checksum?: string;
  defaultVolume: number;
  soloMuteCapable: boolean;
  requiredForPlayback: boolean;
  explicitContent?: boolean;
  cleanAlternateStemId?: string;
  /** Byte offset in STDA chunk payload (after STDA header). */
  dataOffset: number;
  dataLength: number;
}

export interface StemManifest {
  version: number;
  /** AUDI chunk holds the default full mix (required for playback). */
  fullMixInAudi: boolean;
  stems: StemDescriptor[];
}

function parseStemType(s: unknown): StemType {
  const v = sanitizeJsonString(s, 32);
  if (v && (STEM_TYPES as readonly string[]).includes(v)) return v as StemType;
  return "custom";
}

function clampVolume(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(2, n));
}

function parseStemEntry(raw: Record<string, unknown>): StemDescriptor | null {
  const stemId = sanitizeJsonString(raw.stemId, 64);
  const stemName = sanitizeJsonString(raw.stemName, 128);
  if (!stemId || !stemName) return null;

  const durationSamples =
    typeof raw.durationSamples === "number"
      ? Math.max(0, Math.floor(raw.durationSamples))
      : typeof raw.durationSamples === "string"
        ? Math.max(0, parseInt(raw.durationSamples, 10) || 0)
        : 0;

  const dataOffset = typeof raw.dataOffset === "number" ? Math.max(0, Math.floor(raw.dataOffset)) : 0;
  const dataLength = typeof raw.dataLength === "number" ? Math.max(0, Math.floor(raw.dataLength)) : 0;
  const byteLength = typeof raw.byteLength === "number" ? Math.max(0, Math.floor(raw.byteLength)) : dataLength;

  const codecId =
    typeof raw.codecId === "number" && raw.codecId >= 0 && raw.codecId <= 255
      ? raw.codecId
      : CodecId.MP5L;

  return {
    stemId,
    stemName,
    stemType: parseStemType(raw.stemType),
    codecId,
    sampleRate: typeof raw.sampleRate === "number" ? Math.max(1, Math.floor(raw.sampleRate)) : 44100,
    channels: typeof raw.channels === "number" ? Math.max(1, Math.min(8, Math.floor(raw.channels))) : 2,
    durationSamples,
    byteLength,
    checksum: sanitizeJsonString(raw.checksum, 16),
    defaultVolume: clampVolume(raw.defaultVolume),
    soloMuteCapable: raw.soloMuteCapable !== false,
    requiredForPlayback: raw.requiredForPlayback === true,
    explicitContent: raw.explicitContent === true,
    cleanAlternateStemId: sanitizeJsonString(raw.cleanAlternateStemId, 64),
    dataOffset,
    dataLength,
  };
}

export function encodeStemManifest(manifest: StemManifest): Uint8Array {
  return encodeJsonChunk({
    version: STEM_MANIFEST_VERSION,
    fullMixInAudi: manifest.fullMixInAudi,
    stems: manifest.stems.map((s) => ({
      ...s,
      durationSamples: s.durationSamples,
    })),
  });
}

export function decodeStemManifest(data?: Uint8Array): StemManifest | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "STEM");
  if (!raw) return null;
  if (!Array.isArray(raw.stems)) return null;

  const stems: StemDescriptor[] = [];
  for (const entry of raw.stems.slice(0, 32)) {
    if (!entry || typeof entry !== "object") continue;
    const stem = parseStemEntry(entry as Record<string, unknown>);
    if (stem) stems.push(stem);
  }
  if (!stems.length) return null;

  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    fullMixInAudi: raw.fullMixInAudi !== false,
    stems,
  };
}

/** Build STDA payload: version byte + per-stem length-prefixed frame data. */
export function encodeStda(stemFrameData: Uint8Array[]): Uint8Array {
  let size = 2;
  for (const d of stemFrameData) size += 4 + d.length;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  v.setUint8(0, STDA_VERSION);
  v.setUint8(1, stemFrameData.length);
  let o = 2;
  for (const data of stemFrameData) {
    v.setUint32(o, data.length, true);
    o += 4;
    out.set(data, o);
    o += data.length;
  }
  return out;
}

export function decodeStdaEntries(stda?: Uint8Array): Uint8Array[] {
  if (!stda || stda.length < 2) return [];
  const v = new DataView(stda.buffer, stda.byteOffset, stda.byteLength);
  const version = v.getUint8(0);
  if (version !== STDA_VERSION) return [];
  const count = v.getUint8(1);
  const entries: Uint8Array[] = [];
  let o = 2;
  for (let i = 0; i < count && o + 4 <= stda.length; i++) {
    const len = v.getUint32(o, true);
    o += 4;
    if (len > stda.length - o || len > 256 * 1024 * 1024) break;
    entries.push(stda.slice(o, o + len));
    o += len;
  }
  return entries;
}

export interface StemBundleInput {
  stemId: string;
  stemName: string;
  stemType: StemType;
  codecId: number;
  sampleRate: number;
  channels: number;
  durationSamples: number;
  frameData: Uint8Array;
  defaultVolume?: number;
  requiredForPlayback?: boolean;
  explicitContent?: boolean;
}

/** Build STEM + STDA optional chunks from encoded stem frames. */
export function buildStemOptionalChunks(stems: StemBundleInput[]): {
  optional: Map<string, Uint8Array>;
  manifest: StemManifest;
} {
  const frameList = stems.map((s) => s.frameData);
  const stda = encodeStda(frameList);
  let offset = 0;
  const descriptors: StemDescriptor[] = stems.map((s) => {
    const dataLength = s.frameData.length;
    const desc: StemDescriptor = {
      stemId: s.stemId,
      stemName: s.stemName,
      stemType: s.stemType,
      codecId: s.codecId,
      sampleRate: s.sampleRate,
      channels: s.channels,
      durationSamples: s.durationSamples,
      byteLength: dataLength,
      checksum: crc32(s.frameData).toString(16).padStart(8, "0"),
      defaultVolume: clampVolume(s.defaultVolume ?? 1),
      soloMuteCapable: true,
      requiredForPlayback: s.requiredForPlayback === true,
      explicitContent: s.explicitContent === true,
      dataOffset: offset,
      dataLength,
    };
    offset += dataLength;
    return desc;
  });

  const manifest: StemManifest = {
    version: STEM_MANIFEST_VERSION,
    fullMixInAudi: true,
    stems: descriptors,
  };

  const optional = new Map<string, Uint8Array>();
  optional.set("STEM", encodeStemManifest(manifest));
  optional.set(STEM_DATA_FOURCC, stda);
  return { optional, manifest };
}

/** Validate STEM manifest + STDA payloads (checksums, offsets, lengths). */
export function validateStemChunks(
  manifest: StemManifest | null | undefined,
  stda?: Uint8Array,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!manifest) {
    errors.push("Missing STEM manifest.");
    return { valid: false, errors };
  }
  if (!stda?.length) {
    errors.push("Missing STDA stem data chunk.");
    return { valid: false, errors };
  }
  if (!manifest.fullMixInAudi) {
    errors.push("fullMixInAudi must be true — AUDI is the default playable mix.");
  }
  if (manifest.version !== STEM_MANIFEST_VERSION) {
    errors.push(`Unsupported STEM manifest version ${manifest.version}.`);
  }

  const entries = decodeStdaEntries(stda);
  if (manifest.stems.length !== entries.length) {
    errors.push("STEM stem count does not match STDA audio entries.");
  }
  if (manifest.stems.length > 32) {
    errors.push("Too many stems in manifest (max 32).");
  }

  let offset = 0;
  for (let i = 0; i < manifest.stems.length; i++) {
    const stem = manifest.stems[i]!;
    const entry = entries[i];

    if (!stem.stemName.trim()) {
      errors.push(`Stem ${stem.stemId} is missing a name.`);
    }
    if (stem.codecId === CodecId.MP5C) {
      errors.push(`Stem "${stem.stemName}" uses MP5-C — not recommended for stems.`);
    }
    if (!entry?.length) {
      errors.push(`Stem "${stem.stemName}" has no STDA audio data.`);
      continue;
    }
    if (stem.dataOffset !== offset) {
      errors.push(`Stem "${stem.stemName}" dataOffset ${stem.dataOffset} expected ${offset}.`);
    }
    if (stem.dataLength !== entry.length) {
      errors.push(
        `Stem "${stem.stemName}" dataLength ${stem.dataLength} does not match STDA entry ${entry.length}.`,
      );
    }
    if (stem.byteLength !== entry.length) {
      errors.push(`Stem "${stem.stemName}" byteLength does not match payload.`);
    }
    const checksum = crc32(entry).toString(16).padStart(8, "0");
    if (stem.checksum && stem.checksum.toLowerCase() !== checksum) {
      errors.push(`Stem "${stem.stemName}" checksum mismatch.`);
    }
    offset += entry.length;
  }

  return { valid: errors.length === 0, errors };
}

/** @deprecated Use validateStemChunks */
export function validateStemManifest(
  manifest: StemManifest,
  stda?: Uint8Array,
): { valid: boolean; errors: string[] } {
  return validateStemChunks(manifest, stda);
}

export function validateStemOptionalMap(
  optional: Map<string, Uint8Array>,
): { valid: boolean; errors: string[]; manifest: StemManifest | null } {
  const manifest = decodeStemManifest(optional.get("STEM"));
  const stda = optional.get(STEM_DATA_FOURCC);
  const result = validateStemChunks(manifest, stda);
  return { ...result, manifest };
}

export function stemTypeLabel(type: StemType): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
