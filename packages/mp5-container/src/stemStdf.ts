import { crc32 } from "./checksum.js";
import { MAX_CHUNK_PAYLOAD } from "./constants.js";
import { Mp5SecurityError } from "./errors.js";
import { sanitizeJsonString } from "./chunkJson.js";

/** Segmented stem data fragment chunk (v1). */
export const STEM_FRAGMENT_FOURCC = "STDF";
export const STDF_VERSION = 1;
/** Max bytes read from each STDF chunk during lazy index (header only). */
export const STDF_HEADER_PREFIX_MAX = 128;

/** Keep single STDA under ~48 MiB (64 MiB chunk cap minus margin). */
export const STDA_SAFE_MAX_BYTES = 48 * 1024 * 1024;

/** Default max payload bytes per STDF fragment (under 64 MiB chunk limit). */
export const STDF_DEFAULT_FRAGMENT_PAYLOAD = 12 * 1024 * 1024;

let fragmentPayloadTarget = STDF_DEFAULT_FRAGMENT_PAYLOAD;

/** Test hook — lower fragment size to force segmentation without huge allocations. */
export function setStdfFragmentPayloadTargetForTests(bytes: number): void {
  fragmentPayloadTarget = Math.max(1024, Math.min(bytes, MAX_CHUNK_PAYLOAD - 128));
}

export function resetStdfFragmentPayloadTarget(): void {
  fragmentPayloadTarget = STDF_DEFAULT_FRAGMENT_PAYLOAD;
}

export function getStdfFragmentPayloadTarget(): number {
  return fragmentPayloadTarget;
}

export interface StdfFragmentHeader {
  version: number;
  stemId: string;
  partIndex: number;
  partCount: number;
  payloadLength: number;
  payloadCrc32: number;
}

export interface StdfFragmentRecord extends StdfFragmentHeader {
  payload: Uint8Array;
}

export interface StemExportSizeReport {
  stemCount: number;
  totalStemFrameBytes: number;
  largestStemBytes: number;
  stdaPayloadBytes: number;
  metadataEstimateBytes: number;
  exceedsStdaSafeLimit: boolean;
  chosenStorage: "stda-v1" | "stdf-v1";
  fragmentCount: number;
  largestFragmentBytes: number;
}

const MAX_STEM_ID_LEN = 64;

export function encodeStdfFragment(record: Omit<StdfFragmentRecord, "version">): Uint8Array {
  const stemIdBytes = new TextEncoder().encode(record.stemId.slice(0, MAX_STEM_ID_LEN));
  if (!stemIdBytes.length) throw new Mp5SecurityError("STDF fragment requires stemId");
  if (stemIdBytes.length > MAX_STEM_ID_LEN) {
    throw new Mp5SecurityError("STDF stemId too long");
  }
  if (record.payload.length !== record.payloadLength) {
    throw new Mp5SecurityError("STDF payloadLength mismatch");
  }
  const headerLen = 2 + stemIdBytes.length + 2 + 2 + 4 + 4;
  const out = new Uint8Array(headerLen + record.payload.length);
  const v = new DataView(out.buffer);
  let o = 0;
  v.setUint8(o++, STDF_VERSION);
  v.setUint8(o++, stemIdBytes.length);
  out.set(stemIdBytes, o);
  o += stemIdBytes.length;
  v.setUint16(o, record.partIndex, true);
  o += 2;
  v.setUint16(o, record.partCount, true);
  o += 2;
  v.setUint32(o, record.payload.length, true);
  o += 4;
  v.setUint32(o, record.payloadCrc32, true);
  o += 4;
  out.set(record.payload, o);
  if (out.length > MAX_CHUNK_PAYLOAD) {
    throw new Mp5SecurityError(
      `Chunk payload exceeds ${MAX_CHUNK_PAYLOAD} (STDF fragment for ${record.stemId} part ${record.partIndex + 1}/${record.partCount})`,
    );
  }
  return out;
}

/** Parse STDF header fields without copying the inner payload. */
export function decodeStdfFragmentHeader(data: Uint8Array): StdfFragmentHeader | null {
  if (!data || data.length < 14) return null;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = v.getUint8(0);
  if (version !== STDF_VERSION) return null;
  const stemIdLen = v.getUint8(1);
  if (stemIdLen > MAX_STEM_ID_LEN || 2 + stemIdLen + 12 > data.length) return null;
  const stemId = new TextDecoder().decode(data.slice(2, 2 + stemIdLen));
  let o = 2 + stemIdLen;
  const partIndex = v.getUint16(o, true);
  o += 2;
  const partCount = v.getUint16(o, true);
  o += 2;
  const payloadLength = v.getUint32(o, true);
  o += 4;
  const payloadCrc32 = v.getUint32(o, true);
  if (payloadLength > MAX_CHUNK_PAYLOAD) return null;
  return {
    version,
    stemId,
    partIndex,
    partCount,
    payloadLength,
    payloadCrc32,
  };
}

export function decodeStdfFragment(data: Uint8Array): StdfFragmentRecord | null {
  if (!data || data.length < 14) return null;
  const header = decodeStdfFragmentHeader(data);
  if (!header) return null;
  const stemIdLen = data[1]!;
  const o = 2 + stemIdLen + 12;
  if (header.payloadLength > data.length - o) return null;
  const payload = data.slice(o, o + header.payloadLength);
  return { ...header, payload };
}

export function splitStemFrameIntoFragments(
  stemId: string,
  frameData: Uint8Array,
  maxPayload = fragmentPayloadTarget,
): StdfFragmentRecord[] {
  if (!frameData.length) {
    return [
      {
        version: STDF_VERSION,
        stemId,
        partIndex: 0,
        partCount: 1,
        payloadLength: 0,
        payloadCrc32: crc32(new Uint8Array(0)),
        payload: new Uint8Array(0),
      },
    ];
  }
  const partCount = Math.max(1, Math.ceil(frameData.length / maxPayload));
  const out: StdfFragmentRecord[] = [];
  for (let i = 0; i < partCount; i++) {
    const start = i * maxPayload;
    const payload = frameData.slice(start, Math.min(start + maxPayload, frameData.length));
    out.push({
      version: STDF_VERSION,
      stemId,
      partIndex: i,
      partCount,
      payloadLength: payload.length,
      payloadCrc32: crc32(payload),
      payload,
    });
  }
  return out;
}

export function groupStdfFragments(
  fragments: readonly Uint8Array[],
): Map<string, StdfFragmentRecord[]> {
  const byStem = new Map<string, StdfFragmentRecord[]>();
  for (const raw of fragments) {
    const frag = decodeStdfFragment(raw);
    if (!frag) continue;
    const list = byStem.get(frag.stemId) ?? [];
    list.push(frag);
    byStem.set(frag.stemId, list);
  }
  return byStem;
}

export interface ReconstructStemResult {
  frameData: Uint8Array | null;
  errors: string[];
  warnings: string[];
}

export function reconstructStemFrameFromFragments(
  stemId: string,
  fragments: StdfFragmentRecord[],
  expectedLength?: number,
): ReconstructStemResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mine = fragments.filter((f) => f.stemId === stemId);
  if (!mine.length) {
    return { frameData: null, errors: [`No STDF fragments for stem ${stemId}.`], warnings };
  }

  const partCounts = new Set(mine.map((f) => f.partCount));
  if (partCounts.size !== 1) {
    errors.push(`Stem ${stemId}: inconsistent partCount in STDF fragments.`);
    return { frameData: null, errors, warnings };
  }
  const partCount = [...partCounts][0]!;
  const byIndex = new Map<number, StdfFragmentRecord>();
  for (const f of mine) {
    if (f.partIndex >= partCount) {
      errors.push(`Stem ${stemId}: partIndex ${f.partIndex} out of range.`);
      continue;
    }
    if (byIndex.has(f.partIndex)) {
      errors.push(`Stem ${stemId}: duplicate fragment part ${f.partIndex}.`);
      continue;
    }
    if (crc32(f.payload) !== f.payloadCrc32) {
      errors.push(`Stem ${stemId}: CRC mismatch on part ${f.partIndex + 1}/${partCount}.`);
      continue;
    }
    byIndex.set(f.partIndex, f);
  }

  if (byIndex.size !== partCount) {
    const missing = [];
    for (let i = 0; i < partCount; i++) {
      if (!byIndex.has(i)) missing.push(i + 1);
    }
    errors.push(
      `Stem ${stemId}: missing STDF fragment(s) ${missing.join(", ")} of ${partCount}.`,
    );
    return { frameData: null, errors, warnings };
  }

  let total = 0;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < partCount; i++) {
    const p = byIndex.get(i)!;
    parts.push(p.payload);
    total += p.payload.length;
  }
  const frameData = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    frameData.set(p, o);
    o += p.length;
  }
  if (expectedLength != null && expectedLength !== total) {
    errors.push(`Stem ${stemId}: reconstructed length ${total} expected ${expectedLength}.`);
    return { frameData: null, errors, warnings };
  }
  return { frameData, errors, warnings };
}

export function buildStemExportSizeReport(
  stemFrameData: Uint8Array[],
  stdaPayloadBytes: number,
  metadataEstimateBytes = 0,
): StemExportSizeReport {
  const totalStemFrameBytes = stemFrameData.reduce((s, d) => s + d.length, 0);
  const largestStemBytes = stemFrameData.reduce((m, d) => Math.max(m, d.length), 0);
  const exceeds = stdaPayloadBytes > STDA_SAFE_MAX_BYTES;
  return {
    stemCount: stemFrameData.length,
    totalStemFrameBytes,
    largestStemBytes,
    stdaPayloadBytes,
    metadataEstimateBytes,
    exceedsStdaSafeLimit: exceeds,
    chosenStorage: exceeds ? "stdf-v1" : "stda-v1",
    fragmentCount: 0,
    largestFragmentBytes: 0,
  };
}

export function formatStemExportSizeLog(report: StemExportSizeReport): string {
  const lines = [
    `[MP5 stem export] stems=${report.stemCount} totalStemBytes=${report.totalStemFrameBytes} largestStemBytes=${report.largestStemBytes}`,
    `[MP5 stem export] STDA payload would be ${report.stdaPayloadBytes} bytes (limit ${STDA_SAFE_MAX_BYTES}) metadataEst=${report.metadataEstimateBytes}`,
    `[MP5 stem export] storage=${report.chosenStorage}${report.fragmentCount ? ` fragments=${report.fragmentCount} largestFragment=${report.largestFragmentBytes}` : ""}`,
  ];
  return lines.join("\n");
}

export function parseStemStorageMode(raw: Record<string, unknown>): "stda-v1" | "stdf-v1" | undefined {
  const v = sanitizeJsonString(raw.storageMode, 16);
  if (v === "stda-v1" || v === "stdf-v1") return v;
  return undefined;
}
