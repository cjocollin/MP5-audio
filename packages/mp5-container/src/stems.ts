import { crc32 } from "./checksum.js";
import { CodecId } from "./constants.js";
import { decodeJsonChunk, encodeJsonChunk, sanitizeJsonString } from "./chunkJson.js";
import type { Mp5File, StdfFragmentIndex } from "./types.js";
import { auditStdfStemIndex } from "./stemAvailability.js";
import { groupStdfFragmentIndex } from "./lazyMp5Load.js";
import {
  STEM_FRAGMENT_FOURCC,
  buildStemExportSizeReport,
  encodeStdfFragment,
  formatStemExportSizeLog,
  groupStdfFragments,
  parseStemStorageMode,
  reconstructStemFrameFromFragments,
  splitStemFrameIntoFragments,
  type StemExportSizeReport,
} from "./stemStdf.js";

export {
  STEM_FRAGMENT_FOURCC,
  STDA_SAFE_MAX_BYTES,
  STDF_DEFAULT_FRAGMENT_PAYLOAD,
  STDF_VERSION,
  buildStemExportSizeReport,
  formatStemExportSizeLog,
  encodeStdfFragment,
  decodeStdfFragment,
  splitStemFrameIntoFragments,
  reconstructStemFrameFromFragments,
  groupStdfFragments,
  setStdfFragmentPayloadTargetForTests,
  resetStdfFragmentPayloadTarget,
  type StemExportSizeReport,
} from "./stemStdf.js";

/** Companion chunk for STEM manifest — concatenated stem audio payloads. */
export const STEM_DATA_FOURCC = "STDA";

export const STEM_MANIFEST_VERSION = 1;
export const STDA_VERSION = 1;

export type StemStorageMode = "stda-v1" | "stdf-v1";

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
  /** Byte offset in STDA/STDF logical payload. */
  dataOffset: number;
  dataLength: number;
  /** STDF v1: number of STDF chunks for this stem. */
  fragmentCount?: number;
}

export interface StemManifest {
  version: number;
  /** AUDI chunk holds the default full mix (required for playback). */
  fullMixInAudi: boolean;
  storageMode?: StemStorageMode;
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
  const fragmentCount =
    typeof raw.fragmentCount === "number" ? Math.max(0, Math.floor(raw.fragmentCount)) : undefined;

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
    fragmentCount,
  };
}

export function encodeStemManifest(manifest: StemManifest): Uint8Array {
  return encodeJsonChunk({
    version: STEM_MANIFEST_VERSION,
    fullMixInAudi: manifest.fullMixInAudi,
    storageMode: manifest.storageMode,
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

  const storageMode =
    parseStemStorageMode(raw) ??
    (raw.stems?.length ? undefined : undefined);

  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    fullMixInAudi: raw.fullMixInAudi !== false,
    storageMode,
    stems,
  };
}

/** Resolve stem storage mode from manifest + present chunks. */
export function resolveStemStorageMode(
  manifest: StemManifest,
  hasStda: boolean,
  stdfCount: number,
): StemStorageMode {
  if (manifest.storageMode === "stdf-v1" || (!hasStda && stdfCount > 0)) return "stdf-v1";
  return "stda-v1";
}

export function decodeStemFrameEntries(
  manifest: StemManifest,
  stda?: Uint8Array,
  stdfFragments?: readonly Uint8Array[],
): { entries: Uint8Array[]; errors: string[]; warnings: string[] } {
  const mode = resolveStemStorageMode(
    manifest,
    !!stda?.length,
    stdfFragments?.length ?? 0,
  );
  if (mode === "stda-v1") {
    return { entries: decodeStdaEntries(stda), errors: [], warnings: [] };
  }
  const grouped = groupStdfFragments(stdfFragments ?? []);
  const entries: Uint8Array[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const stem of manifest.stems) {
    const frags = grouped.get(stem.stemId) ?? [];
    const { frameData, errors: stemErrors, warnings: stemWarnings } =
      reconstructStemFrameFromFragments(stem.stemId, frags, stem.dataLength);
    warnings.push(...stemWarnings);
    if (!frameData) {
      errors.push(...stemErrors);
      entries.push(new Uint8Array(0));
      continue;
    }
    const checksum = crc32(frameData).toString(16).padStart(8, "0");
    if (stem.checksum && stem.checksum.toLowerCase() !== checksum) {
      errors.push(`Stem "${stem.stemName}" checksum mismatch after STDF reconstruction.`);
    }
    entries.push(frameData);
  }
  return { entries, errors, warnings };
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

export interface StemOptionalChunksResult {
  optional: Map<string, Uint8Array>;
  extraChunks: { fourcc: string; payload: Uint8Array }[];
  manifest: StemManifest;
  report: StemExportSizeReport;
}

/** Build STEM + STDA or segmented STDF optional chunks from encoded stem frames. */
export function buildStemOptionalChunks(stems: StemBundleInput[]): StemOptionalChunksResult {
  const frameList = stems.map((s) => s.frameData);
  const stda = encodeStda(frameList);
  const report = buildStemExportSizeReport(frameList, stda.length);
  const useSegmented = report.exceedsStdaSafeLimit;

  const descriptors: StemDescriptor[] = stems.map((s) => {
    const dataLength = s.frameData.length;
    return {
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
      dataOffset: 0,
      dataLength,
      fragmentCount: useSegmented
        ? splitStemFrameIntoFragments(s.stemId, s.frameData).length
        : undefined,
    };
  });

  const optional = new Map<string, Uint8Array>();
  const extraChunks: { fourcc: string; payload: Uint8Array }[] = [];
  let storageMode: StemStorageMode = "stda-v1";

  if (useSegmented) {
    storageMode = "stdf-v1";
    let fragmentCount = 0;
    let largestFragment = 0;
    for (const s of stems) {
      const frags = splitStemFrameIntoFragments(s.stemId, s.frameData);
      for (const frag of frags) {
        const payload = encodeStdfFragment(frag);
        largestFragment = Math.max(largestFragment, payload.length);
        extraChunks.push({ fourcc: STEM_FRAGMENT_FOURCC, payload });
        fragmentCount++;
      }
    }
    report.chosenStorage = "stdf-v1";
    report.fragmentCount = fragmentCount;
    report.largestFragmentBytes = largestFragment;
    console.info(formatStemExportSizeLog(report));
  } else {
    let offset = 0;
    for (const d of descriptors) {
      d.dataOffset = offset;
      offset += d.dataLength;
    }
    optional.set(STEM_DATA_FOURCC, stda);
    console.info(formatStemExportSizeLog(report));
  }

  const manifest: StemManifest = {
    version: STEM_MANIFEST_VERSION,
    fullMixInAudi: true,
    storageMode,
    stems: descriptors,
  };

  optional.set("STEM", encodeStemManifest(manifest));
  return { optional, extraChunks, manifest, report };
}

/** Validate STEM manifest + STDA or STDF payloads (checksums, offsets, lengths). */
export function validateStemChunks(
  manifest: StemManifest | null | undefined,
  stda?: Uint8Array,
  stdfFragments?: readonly Uint8Array[],
): { valid: boolean; errors: string[]; warnings: string[]; storageMode?: StemStorageMode } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!manifest) {
    errors.push("Missing STEM manifest.");
    return { valid: false, errors, warnings };
  }
  const mode = resolveStemStorageMode(
    manifest,
    !!stda?.length,
    stdfFragments?.length ?? 0,
  );
  if (mode === "stda-v1" && !stda?.length) {
    errors.push("Missing STDA stem data chunk.");
    return { valid: false, errors, warnings, storageMode: mode };
  }
  if (mode === "stdf-v1" && !stdfFragments?.length) {
    errors.push("Missing STDF stem data fragments.");
    return { valid: false, errors, warnings, storageMode: mode };
  }
  if (!manifest.fullMixInAudi) {
    errors.push("fullMixInAudi must be true — AUDI is the default playable mix.");
  }
  if (manifest.version !== STEM_MANIFEST_VERSION) {
    errors.push(`Unsupported STEM manifest version ${manifest.version}.`);
  }

  const { entries, errors: decodeErrors, warnings: decodeWarnings } = decodeStemFrameEntries(
    manifest,
    stda,
    stdfFragments,
  );
  errors.push(...decodeErrors);
  warnings.push(...decodeWarnings);

  if (manifest.stems.length !== entries.length) {
    errors.push("STEM stem count does not match stem audio entries.");
  }
  if (manifest.stems.length > 32) {
    errors.push("Too many stems in manifest (max 32).");
  }

  if (mode === "stda-v1") {
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
  } else {
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
        errors.push(`Stem "${stem.stemName}" has no reconstructed STDF audio data.`);
        continue;
      }
      if (stem.dataLength !== entry.length) {
        errors.push(
          `Stem "${stem.stemName}" dataLength ${stem.dataLength} does not match reconstructed ${entry.length}.`,
        );
      }
      if (stem.fragmentCount != null) {
        const grouped = groupStdfFragments(stdfFragments ?? []);
        const count = grouped.get(stem.stemId)?.length ?? 0;
        if (count !== stem.fragmentCount) {
          warnings.push(
            `Stem "${stem.stemName}" fragmentCount ${stem.fragmentCount} but found ${count} STDF chunk(s).`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, storageMode: mode };
}

/** Index-only STDF validation (lazy ingest — no eager fragment payloads). */
export function validateStemChunksFromIndex(
  manifest: StemManifest | null | undefined,
  stda: Uint8Array | undefined,
  stdfIndex: readonly StdfFragmentIndex[],
): ReturnType<typeof validateStemChunks> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!manifest) {
    errors.push("Missing STEM manifest.");
    return { valid: false, errors, warnings };
  }
  const mode = resolveStemStorageMode(manifest, !!stda?.length, stdfIndex.length);
  if (mode === "stda-v1" && !stda?.length) {
    errors.push("Missing STDA stem data chunk.");
    return { valid: false, errors, warnings, storageMode: mode };
  }
  if (mode === "stdf-v1" && !stdfIndex.length) {
    errors.push("Missing STDF stem data fragments.");
    return { valid: false, errors, warnings, storageMode: mode };
  }
  if (!manifest.fullMixInAudi) {
    errors.push("fullMixInAudi must be true — AUDI is the default playable mix.");
  }
  if (manifest.stems.length > 32) {
    errors.push("Too many stems in manifest (max 32).");
  }

  const audit = auditStdfStemIndex(manifest, stdfIndex);
  const seenStemIds = new Set<string>();
  for (const entry of audit) {
    seenStemIds.add(entry.stemId);
    if (!entry.stemName.trim()) {
      errors.push(`Stem ${entry.stemId} is missing a name.`);
    }
    const stem = manifest.stems.find((s) => s.stemId === entry.stemId);
    if (!stem) continue;
    if (stem.codecId === CodecId.MP5C) {
      errors.push(`Stem "${entry.stemName}" uses MP5-C — not recommended for stems.`);
    }
    if (entry.status === "missing_fragments") {
      errors.push(`Stem "${entry.stemName}" has no indexed STDF fragments.`);
    } else if (entry.status === "partial_fragments") {
      errors.push(
        `Stem "${entry.stemName}" has incomplete STDF parts (expected ${entry.expectedFragmentCount}, indexed ${entry.indexedFragmentCount}).`,
      );
    }
    if (entry.indexedFragmentCount > 0 && entry.expectedDataLength > 0) {
      const sumInner = entry.indexedInnerPayloadBytes;
      if (sumInner !== entry.expectedDataLength) {
        warnings.push(
          `Stem "${entry.stemName}" indexed payload bytes ${sumInner} vs manifest dataLength ${entry.expectedDataLength} (verify after load).`,
        );
      }
    }
  }

  const grouped = groupStdfFragmentIndex(stdfIndex);
  for (const [stemId, frags] of grouped) {
    if (!manifest.stems.some((s) => s.stemId === stemId)) {
      warnings.push(`STDF fragment(s) for unknown stemId ${stemId} (${frags.length} chunk(s)).`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, storageMode: mode };
}

export function validateStemFromParsed(file: Mp5File): ReturnType<typeof validateStemChunks> {
  const manifest = decodeStemManifest(file.optional.get("STEM"));
  if (file.lazy?.stdfFragmentIndex.length) {
    return validateStemChunksFromIndex(
      manifest,
      file.optional.get(STEM_DATA_FOURCC),
      file.lazy.stdfFragmentIndex,
    );
  }
  return validateStemChunks(
    manifest,
    file.optional.get(STEM_DATA_FOURCC),
    file.stdfFragments,
  );
}

export function summarizeStemStorage(file: Mp5File): {
  stemCount: number;
  storageMode: StemStorageMode | "none";
  fragmentCount: number;
  totalStemBytes: number;
  largestFragmentBytes: number;
} {
  const manifest = decodeStemManifest(file.optional.get("STEM"));
  if (!manifest?.stems.length) {
    return { stemCount: 0, storageMode: "none", fragmentCount: 0, totalStemBytes: 0, largestFragmentBytes: 0 };
  }
  const stdfIndexLen = file.lazy?.stdfFragmentIndex.length ?? file.stdfFragments.length;
  const mode = resolveStemStorageMode(
    manifest,
    file.optional.has(STEM_DATA_FOURCC),
    stdfIndexLen,
  );
  let largest = 0;
  let fragmentCount = file.stdfFragments.length;
  let totalStemBytes = 0;

  if (file.lazy?.stdfFragmentIndex.length) {
    fragmentCount = file.lazy.stdfFragmentIndex.length;
    for (const idx of file.lazy.stdfFragmentIndex) {
      largest = Math.max(largest, idx.payloadLength);
      totalStemBytes += idx.innerPayloadLength;
    }
  } else {
    const { entries } = decodeStemFrameEntries(
      manifest,
      file.optional.get(STEM_DATA_FOURCC),
      file.stdfFragments,
    );
    totalStemBytes = entries.reduce((s, e) => s + e.length, 0);
    for (const f of file.stdfFragments) {
      largest = Math.max(largest, f.length);
    }
  }

  const stda = file.optional.get(STEM_DATA_FOURCC);
  if (stda?.length) largest = Math.max(largest, stda.length);
  if (!totalStemBytes) {
    totalStemBytes = manifest.stems.reduce(
      (s, d) => s + Math.max(0, d.dataLength || d.byteLength || 0),
      0,
    );
  }

  return {
    stemCount: manifest.stems.length,
    storageMode: mode,
    fragmentCount,
    totalStemBytes,
    largestFragmentBytes: largest,
  };
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
  stdfFragments: readonly Uint8Array[] = [],
): { valid: boolean; errors: string[]; warnings: string[]; manifest: StemManifest | null } {
  const manifest = decodeStemManifest(optional.get("STEM"));
  const stda = optional.get(STEM_DATA_FOURCC);
  const result = validateStemChunks(manifest, stda, stdfFragments);
  return { ...result, manifest };
}

export function stemTypeLabel(type: StemType): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
