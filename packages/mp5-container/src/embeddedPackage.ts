import { crc32 } from "./checksum.js";
import { MAX_CHUNK_PAYLOAD } from "./constants.js";
import { Mp5SecurityError } from "./errors.js";
import { sanitizeJsonString } from "./chunkJson.js";
import { sha256HexDigest } from "./sha256Digest.js";
import {
  ALBUM_MANIFEST_FORMAT,
  EMBEDDED_ALBUM_MANIFEST_FORMAT,
  MAX_ALBUM_TRACKS,
  auditAlbmPackageManifest,
  validateAlbmPackageManifest,
  type AlbmPackageManifest,
  type AlbmValidationError,
} from "./albm.js";

/** Binary `.mp5p` embedded album package (prototype Alpha). */
export const EMBEDDED_PACKAGE_MAGIC = new Uint8Array([0x4d, 0x50, 0x35, 0x50]); // MP5P
export const EMBEDDED_PACKAGE_MAGIC_STR = "MP5P";
export const EMBEDDED_PACKAGE_VERSION = 1;
export const EMBEDDED_FRAGMENT_VERSION = 1;

/** Re-export manifest format id (canonical definition in albm.ts). */
export { EMBEDDED_ALBUM_MANIFEST_FORMAT };

/** Default fragment payload — mirrors STDF safe segmentation (well under 64 MiB chunk cap). */
export const EMBEDDED_DEFAULT_FRAGMENT_PAYLOAD = 12 * 1024 * 1024;
/** Hard cap per fragment inner payload. */
export const EMBEDDED_MAX_FRAGMENT_PAYLOAD = 16 * 1024 * 1024;

export const EMBEDDED_FILE_HEADER_SIZE = 40;
export const EMBEDDED_MAX_TRACK_ID_LEN = 128;
export const EMBEDDED_MAX_LOGICAL_FILE_LEN = 512;

let fragmentPayloadTarget = EMBEDDED_DEFAULT_FRAGMENT_PAYLOAD;

export function setEmbeddedFragmentPayloadTargetForTests(bytes: number): void {
  fragmentPayloadTarget = Math.max(1024, Math.min(bytes, EMBEDDED_MAX_FRAGMENT_PAYLOAD));
}

export function resetEmbeddedFragmentPayloadTarget(): void {
  fragmentPayloadTarget = EMBEDDED_DEFAULT_FRAGMENT_PAYLOAD;
}

export function getEmbeddedFragmentPayloadTarget(): number {
  return fragmentPayloadTarget;
}

export type Mp5pPackageKind = "json-manifest" | "embedded-binary" | "invalid";

export interface EmbeddedFragmentRef {
  partIndex: number;
  partCount: number;
  payloadOffset: number;
  payloadLength: number;
  payloadCrc32: number;
  recordOffset: number;
  recordLength: number;
}

export interface EmbeddedTrackDirectoryEntry {
  trackId: string;
  logicalFile: string;
  totalByteLength: number;
  partCount: number;
  sha256: string | null;
  fragments: EmbeddedFragmentRef[];
}

export interface EmbeddedAlbumPackageIndex {
  packageVersion: number;
  fileSize: number;
  manifest: AlbmPackageManifest;
  tracks: EmbeddedTrackDirectoryEntry[];
  totalEmbeddedBytes: number;
  totalFragmentCount: number;
}

export interface EmbeddedFragmentHeader {
  version: number;
  trackId: string;
  partIndex: number;
  partCount: number;
  payloadLength: number;
  payloadCrc32: number;
}

export interface EmbeddedFragmentRecord extends EmbeddedFragmentHeader {
  payload: Uint8Array;
}

export interface EmbeddedTrackInput {
  trackId: string;
  logicalFile: string;
  bytes: Uint8Array;
  sha256?: string;
}

export interface WriteEmbeddedAlbumOptions {
  manifest: AlbmPackageManifest;
  tracks: EmbeddedTrackInput[];
  fragmentPayload?: number;
}

export interface EmbeddedIntegrityIssue {
  trackId: string;
  partIndex?: number;
  code: string;
  message: string;
}

export interface EmbeddedPackageIntegrityReport {
  valid: boolean;
  issues: EmbeddedIntegrityIssue[];
  tracksChecked: number;
  fragmentsChecked: number;
  missingFragments: number;
  badCrcFragments: number;
  hashMismatches: number;
}

function readU64(view: DataView, offset: number): number {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return hi * 0x1_0000_0000 + lo;
}

function writeU64(view: DataView, offset: number, value: number): void {
  const v = Math.max(0, Math.floor(value));
  view.setUint32(offset, v >>> 0, true);
  view.setUint32(offset + 4, Math.floor(v / 0x1_0000_1_0000) >>> 0, true);
}

function sanitizeTrackId(trackId: string): string {
  const trimmed = trackId.trim().slice(0, EMBEDDED_MAX_TRACK_ID_LEN);
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Mp5SecurityError(`Invalid embedded trackId: ${trackId}`);
  }
  return trimmed;
}

function sanitizeLogicalFile(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const trimmed = base.trim().slice(0, EMBEDDED_MAX_LOGICAL_FILE_LEN);
  if (!trimmed || trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Mp5SecurityError(`Invalid embedded logical file name: ${name}`);
  }
  return trimmed;
}

/** Detect `.mp5p` package kind from raw bytes (no full parse). */
export function detectMp5pPackageKind(data: Uint8Array): Mp5pPackageKind {
  if (!data?.length) return "invalid";
  if (
    data.length >= 4 &&
    data[0] === EMBEDDED_PACKAGE_MAGIC[0] &&
    data[1] === EMBEDDED_PACKAGE_MAGIC[1] &&
    data[2] === EMBEDDED_PACKAGE_MAGIC[2] &&
    data[3] === EMBEDDED_PACKAGE_MAGIC[3]
  ) {
    return "embedded-binary";
  }
  const start = new TextDecoder().decode(data.slice(0, Math.min(64, data.length))).trimStart();
  if (start.startsWith("{")) return "json-manifest";
  return "invalid";
}

export function isEmbeddedMp5pBytes(data: Uint8Array): boolean {
  return detectMp5pPackageKind(data) === "embedded-binary";
}

/** Validate embedded manifest JSON (same album schema, different format id). */
export function validateEmbeddedAlbmManifest(
  raw: Record<string, unknown>,
): { manifest: AlbmPackageManifest | null; errors: AlbmValidationError[] } {
  const format = sanitizeJsonString(raw.format, 64);
  if (format !== EMBEDDED_ALBUM_MANIFEST_FORMAT) {
    return {
      manifest: null,
      errors: [{ path: "format", message: `Expected ${EMBEDDED_ALBUM_MANIFEST_FORMAT}` }],
    };
  }
  const clone = { ...raw, format: ALBUM_MANIFEST_FORMAT };
  const result = validateAlbmPackageManifest(clone);
  if (!result.manifest) return result;
  return {
    manifest: { ...result.manifest, format: EMBEDDED_ALBUM_MANIFEST_FORMAT },
    errors: result.errors,
  };
}

export function parseEmbeddedAlbmManifestJson(text: string): {
  manifest: AlbmPackageManifest | null;
  errors: AlbmValidationError[];
} {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { manifest: null, errors: [{ path: "", message: "Manifest must be a JSON object" }] };
    }
    return validateEmbeddedAlbmManifest(parsed as Record<string, unknown>);
  } catch {
    return { manifest: null, errors: [{ path: "", message: "Invalid JSON" }] };
  }
}

export function encodeEmbeddedFragment(record: Omit<EmbeddedFragmentRecord, "version">): Uint8Array {
  const trackId = sanitizeTrackId(record.trackId);
  const trackIdBytes = new TextEncoder().encode(trackId);
  if (!trackIdBytes.length || trackIdBytes.length > EMBEDDED_MAX_TRACK_ID_LEN) {
    throw new Mp5SecurityError("Embedded fragment requires trackId");
  }
  if (record.payload.length !== record.payloadLength) {
    throw new Mp5SecurityError("Embedded fragment payloadLength mismatch");
  }
  if (record.payload.length > EMBEDDED_MAX_FRAGMENT_PAYLOAD) {
    throw new Mp5SecurityError(
      `Embedded fragment payload exceeds ${EMBEDDED_MAX_FRAGMENT_PAYLOAD} bytes`,
    );
  }
  const headerLen = 2 + trackIdBytes.length + 2 + 2 + 4 + 4;
  const out = new Uint8Array(headerLen + record.payload.length);
  const v = new DataView(out.buffer);
  let o = 0;
  v.setUint8(o++, EMBEDDED_FRAGMENT_VERSION);
  v.setUint8(o++, trackIdBytes.length);
  out.set(trackIdBytes, o);
  o += trackIdBytes.length;
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
      `Embedded fragment record exceeds ${MAX_CHUNK_PAYLOAD} bytes (track ${trackId} part ${record.partIndex + 1}/${record.partCount})`,
    );
  }
  return out;
}

export function decodeEmbeddedFragmentHeader(data: Uint8Array): EmbeddedFragmentHeader | null {
  if (!data || data.length < 14) return null;
  const version = data[0]!;
  if (version !== EMBEDDED_FRAGMENT_VERSION) return null;
  const trackIdLen = data[1]!;
  if (trackIdLen > EMBEDDED_MAX_TRACK_ID_LEN || 2 + trackIdLen + 12 > data.length) return null;
  const trackId = new TextDecoder().decode(data.slice(2, 2 + trackIdLen));
  if (!/^[a-zA-Z0-9_-]+$/.test(trackId)) return null;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 2 + trackIdLen;
  const partIndex = v.getUint16(o, true);
  o += 2;
  const partCount = v.getUint16(o, true);
  o += 2;
  const payloadLength = v.getUint32(o, true);
  o += 4;
  const payloadCrc32 = v.getUint32(o, true);
  if (payloadLength > EMBEDDED_MAX_FRAGMENT_PAYLOAD) return null;
  return { version, trackId, partIndex, partCount, payloadLength, payloadCrc32 };
}

export function decodeEmbeddedFragment(data: Uint8Array): EmbeddedFragmentRecord | null {
  const header = decodeEmbeddedFragmentHeader(data);
  if (!header) return null;
  const trackIdLen = data[1]!;
  const o = 2 + trackIdLen + 12;
  if (header.payloadLength > data.length - o) return null;
  const payload = data.slice(o, o + header.payloadLength);
  return { ...header, payload };
}

export function splitTrackBytesIntoFragments(
  trackId: string,
  trackBytes: Uint8Array,
  maxPayload = fragmentPayloadTarget,
): EmbeddedFragmentRecord[] {
  const id = sanitizeTrackId(trackId);
  if (!trackBytes.length) {
    throw new Mp5SecurityError(`Embedded track ${id} is empty`);
  }
  const payloadSize = Math.max(1024, Math.min(maxPayload, EMBEDDED_MAX_FRAGMENT_PAYLOAD));
  const partCount = Math.ceil(trackBytes.length / payloadSize);
  if (partCount > 65535) {
    throw new Mp5SecurityError(`Embedded track ${id} requires too many fragments`);
  }
  const out: EmbeddedFragmentRecord[] = [];
  for (let partIndex = 0; partIndex < partCount; partIndex++) {
    const start = partIndex * payloadSize;
    const payload = trackBytes.slice(start, Math.min(start + payloadSize, trackBytes.length));
    out.push({
      version: EMBEDDED_FRAGMENT_VERSION,
      trackId: id,
      partIndex,
      partCount,
      payloadLength: payload.length,
      payloadCrc32: crc32(payload),
      payload,
    });
  }
  return out;
}

export function reconstructTrackBytesFromFragments(
  fragments: EmbeddedFragmentRecord[],
): Uint8Array {
  if (!fragments.length) throw new Mp5SecurityError("No embedded fragments");
  const trackId = fragments[0]!.trackId;
  const partCount = fragments[0]!.partCount;
  const byIndex = new Map<number, EmbeddedFragmentRecord>();
  for (const f of fragments) {
    if (f.trackId !== trackId) {
      throw new Mp5SecurityError("Embedded fragment trackId mismatch");
    }
    if (f.partCount !== partCount) {
      throw new Mp5SecurityError("Embedded fragment partCount mismatch");
    }
    if (byIndex.has(f.partIndex)) {
      throw new Mp5SecurityError(`Duplicate embedded fragment part ${f.partIndex}`);
    }
    if (crc32(f.payload) !== f.payloadCrc32) {
      throw new Mp5SecurityError(`Embedded fragment CRC mismatch (track ${trackId} part ${f.partIndex})`);
    }
    byIndex.set(f.partIndex, f);
  }
  for (let i = 0; i < partCount; i++) {
    if (!byIndex.has(i)) {
      throw new Mp5SecurityError(`Missing embedded fragment part ${i} for track ${trackId}`);
    }
  }
  const total = fragments.reduce((n, f) => n + f.payload.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < partCount; i++) {
    const f = byIndex.get(i)!;
    out.set(f.payload, offset);
    offset += f.payload.length;
  }
  return out;
}

function encodeDirectory(tracks: EmbeddedTrackDirectoryEntry[]): Uint8Array {
  let size = 4;
  for (const t of tracks) {
    const trackIdBytes = new TextEncoder().encode(t.trackId);
    const logicalBytes = new TextEncoder().encode(t.logicalFile);
    size += 1 + trackIdBytes.length + 2 + logicalBytes.length + 8 + 2 + 32 + t.fragments.length * (2 + 8 + 4 + 4 + 4);
  }
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  v.setUint32(0, tracks.length, true);
  let o = 4;
  for (const t of tracks) {
    const trackIdBytes = new TextEncoder().encode(t.trackId);
    const logicalBytes = new TextEncoder().encode(t.logicalFile);
    v.setUint8(o++, trackIdBytes.length);
    out.set(trackIdBytes, o);
    o += trackIdBytes.length;
    v.setUint16(o, logicalBytes.length, true);
    o += 2;
    out.set(logicalBytes, o);
    o += logicalBytes.length;
    writeU64(v, o, t.totalByteLength);
    o += 8;
    v.setUint16(o, t.partCount, true);
    o += 2;
    const hashBytes = t.sha256 ? hexToBytes(t.sha256) : new Uint8Array(32);
    out.set(hashBytes, o);
    o += 32;
    for (const f of t.fragments) {
      v.setUint16(o, f.partIndex, true);
      o += 2;
      writeU64(v, o, f.recordOffset);
      o += 8;
      v.setUint32(o, f.payloadLength, true);
      o += 4;
      v.setUint32(o, f.payloadCrc32, true);
      o += 4;
      v.setUint32(o, f.recordLength, true);
      o += 4;
    }
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function decodeDirectory(data: Uint8Array, fileSize: number): EmbeddedTrackDirectoryEntry[] {
  if (data.length < 4) throw new Mp5SecurityError("Embedded directory too short");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const entryCount = v.getUint32(0, true);
  if (entryCount > MAX_ALBUM_TRACKS) {
    throw new Mp5SecurityError(`Embedded directory has too many tracks (${entryCount})`);
  }
  const tracks: EmbeddedTrackDirectoryEntry[] = [];
  let o = 4;
  for (let i = 0; i < entryCount; i++) {
    if (o >= data.length) throw new Mp5SecurityError("Truncated embedded directory");
    const trackIdLen = data[o]!;
    o += 1;
    if (trackIdLen > EMBEDDED_MAX_TRACK_ID_LEN || o + trackIdLen > data.length) {
      throw new Mp5SecurityError("Invalid embedded trackId length");
    }
    const trackId = new TextDecoder().decode(data.slice(o, o + trackIdLen));
    o += trackIdLen;
    if (!/^[a-zA-Z0-9_-]+$/.test(trackId)) {
      throw new Mp5SecurityError(`Invalid embedded trackId in directory: ${trackId}`);
    }
    const logicalLen = v.getUint16(o, true);
    o += 2;
    if (logicalLen > EMBEDDED_MAX_LOGICAL_FILE_LEN || o + logicalLen > data.length) {
      throw new Mp5SecurityError("Invalid embedded logical file length");
    }
    const logicalFile = new TextDecoder().decode(data.slice(o, o + logicalLen));
    o += logicalLen;
    if (logicalFile.includes("..") || logicalFile.includes("/") || logicalFile.includes("\\")) {
      throw new Mp5SecurityError(`Path traversal in embedded logical file: ${logicalFile}`);
    }
    const totalByteLength = readU64(v, o);
    o += 8;
    const partCount = v.getUint16(o, true);
    o += 2;
    const hashSlice = data.slice(o, o + 32);
    o += 32;
    const sha256 = hashSlice.every((b) => b === 0) ? null : bytesToHex(hashSlice);
    const fragments: EmbeddedFragmentRef[] = [];
    for (let p = 0; p < partCount; p++) {
      if (o + 22 > data.length) throw new Mp5SecurityError("Truncated embedded fragment index");
      const partIndex = v.getUint16(o, true);
      o += 2;
      const recordOffset = readU64(v, o);
      o += 8;
      const payloadLength = v.getUint32(o, true);
      o += 4;
      const payloadCrc32 = v.getUint32(o, true);
      o += 4;
      const recordLength = v.getUint32(o, true);
      o += 4;
      if (recordOffset >= fileSize || recordOffset + recordLength > fileSize) {
        throw new Mp5SecurityError(`Embedded fragment record out of bounds (track ${trackId} part ${partIndex})`);
      }
      if (payloadLength > EMBEDDED_MAX_FRAGMENT_PAYLOAD) {
        throw new Mp5SecurityError(`Embedded fragment payload too large (track ${trackId} part ${partIndex})`);
      }
      fragments.push({
        partIndex,
        partCount,
        payloadOffset: recordOffset,
        payloadLength,
        payloadCrc32,
        recordOffset,
        recordLength,
      });
    }
    fragments.sort((a, b) => a.partIndex - b.partIndex);
    tracks.push({ trackId, logicalFile, totalByteLength, partCount, sha256, fragments });
  }
  return tracks;
}

function parseFileHeader(data: Uint8Array): {
  packageVersion: number;
  manifestOffset: number;
  manifestLength: number;
  directoryOffset: number;
  directoryLength: number;
  fragmentDataOffset: number;
} {
  if (data.length < EMBEDDED_FILE_HEADER_SIZE) {
    throw new Mp5SecurityError("Embedded package too short");
  }
  if (!isEmbeddedMp5pBytes(data)) {
    throw new Mp5SecurityError("Not an embedded MP5P package");
  }
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const packageVersion = v.getUint32(4, true);
  if (packageVersion !== EMBEDDED_PACKAGE_VERSION) {
    throw new Mp5SecurityError(`Unsupported embedded package version ${packageVersion}`);
  }
  const headerLength = v.getUint32(8, true);
  if (headerLength !== EMBEDDED_FILE_HEADER_SIZE) {
    throw new Mp5SecurityError("Unsupported embedded package header length");
  }
  const manifestOffset = readU64(v, 12);
  const manifestLength = v.getUint32(20, true);
  const directoryOffset = readU64(v, 24);
  const directoryLength = v.getUint32(32, true);
  const fragmentDataOffset = readU64(v, 36);
  if (manifestOffset + manifestLength > data.length) {
    throw new Mp5SecurityError("Embedded manifest out of bounds");
  }
  if (directoryOffset + directoryLength > data.length) {
    throw new Mp5SecurityError("Embedded directory out of bounds");
  }
  return {
    packageVersion,
    manifestOffset,
    manifestLength,
    directoryOffset,
    directoryLength,
    fragmentDataOffset,
  };
}

/** Lazy index — reads header, manifest JSON, and track directory only. */
export function indexEmbeddedAlbumPackage(data: Uint8Array): EmbeddedAlbumPackageIndex {
  const header = parseFileHeader(data);
  const manifestText = new TextDecoder().decode(
    data.slice(header.manifestOffset, header.manifestOffset + header.manifestLength),
  );
  const { manifest, errors } = parseEmbeddedAlbmManifestJson(manifestText);
  if (!manifest || errors.length) {
    throw new Mp5SecurityError(errors[0]?.message ?? "Invalid embedded album manifest");
  }
  const directoryBytes = data.slice(
    header.directoryOffset,
    header.directoryOffset + header.directoryLength,
  );
  const tracks = decodeDirectory(directoryBytes, data.length);
  if (tracks.length !== manifest.tracks.length) {
    throw new Mp5SecurityError("Embedded track directory count does not match manifest");
  }
  const manifestIds = manifest.tracks.map((t) => t.trackId);
  const dirIds = tracks.map((t) => t.trackId);
  for (let i = 0; i < manifestIds.length; i++) {
    if (manifestIds[i] !== dirIds[i]) {
      throw new Mp5SecurityError("Embedded track directory order does not match manifest");
    }
  }
  let totalEmbeddedBytes = 0;
  let totalFragmentCount = 0;
  for (const t of tracks) {
    totalEmbeddedBytes += t.totalByteLength;
    totalFragmentCount += t.fragments.length;
  }
  return {
    packageVersion: header.packageVersion,
    fileSize: data.length,
    manifest,
    tracks,
    totalEmbeddedBytes,
    totalFragmentCount,
  };
}

/** Load one embedded track's complete `.mp5` bytes from a package blob/array buffer. */
export async function loadEmbeddedTrackBytes(
  source: Uint8Array | ArrayBuffer | Blob,
  index: EmbeddedAlbumPackageIndex,
  trackId: string,
): Promise<Uint8Array> {
  const data =
    source instanceof Uint8Array
      ? source
      : source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : new Uint8Array(await source.arrayBuffer());
  const entry = index.tracks.find((t) => t.trackId === trackId);
  if (!entry) throw new Mp5SecurityError(`Embedded track not found: ${trackId}`);
  const fragments: EmbeddedFragmentRecord[] = [];
  for (const ref of entry.fragments) {
    const slice = data.slice(ref.recordOffset, ref.recordOffset + ref.recordLength);
    const decoded = decodeEmbeddedFragment(slice);
    if (!decoded) {
      throw new Mp5SecurityError(`Corrupt embedded fragment (track ${trackId} part ${ref.partIndex})`);
    }
    if (decoded.partIndex !== ref.partIndex || decoded.payloadLength !== ref.payloadLength) {
      throw new Mp5SecurityError(`Embedded fragment index mismatch (track ${trackId} part ${ref.partIndex})`);
    }
    fragments.push(decoded);
  }
  const bytes = reconstructTrackBytesFromFragments(fragments);
  if (bytes.length !== entry.totalByteLength) {
    throw new Mp5SecurityError(`Embedded track byte length mismatch for ${trackId}`);
  }
  if (entry.sha256) {
    const digest = await sha256HexDigest(bytes);
    if (digest !== entry.sha256.toLowerCase()) {
      throw new Mp5SecurityError(`Embedded track SHA-256 mismatch for ${trackId}`);
    }
  }
  return bytes;
}

export function writeEmbeddedAlbumPackage(opts: WriteEmbeddedAlbumOptions): Uint8Array {
  const manifestInput = opts.manifest;
  if (
    manifestInput.format !== EMBEDDED_ALBUM_MANIFEST_FORMAT &&
    manifestInput.format !== ALBUM_MANIFEST_FORMAT
  ) {
    throw new Mp5SecurityError("Invalid manifest format for embedded package");
  }
  const manifest: AlbmPackageManifest = {
    ...manifestInput,
    format: EMBEDDED_ALBUM_MANIFEST_FORMAT,
    version: 1,
  };
  const validated = validateEmbeddedAlbmManifest(manifest as unknown as Record<string, unknown>);
  if (!validated.manifest || validated.errors.length) {
    throw new Mp5SecurityError(validated.errors[0]?.message ?? "Invalid embedded manifest");
  }
  if (opts.tracks.length !== manifest.tracks.length) {
    throw new Mp5SecurityError("Embedded track inputs count must match manifest tracks");
  }
  const maxPayload = opts.fragmentPayload ?? fragmentPayloadTarget;
  const manifestJson = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const fragmentRecords: Uint8Array[] = [];
  const directoryTracks: EmbeddedTrackDirectoryEntry[] = [];
  for (let i = 0; i < opts.tracks.length; i++) {
    const input = opts.tracks[i]!;
    const ref = manifest.tracks[i]!;
    if (input.trackId !== ref.trackId) {
      throw new Mp5SecurityError(`TrackId mismatch at index ${i}`);
    }
    const logicalFile = sanitizeLogicalFile(input.logicalFile);
    const parts = splitTrackBytesIntoFragments(input.trackId, input.bytes, maxPayload);
    const fragments: EmbeddedFragmentRef[] = [];
    for (const part of parts) {
      const encoded = encodeEmbeddedFragment(part);
      fragmentRecords.push(encoded);
      fragments.push({
        partIndex: part.partIndex,
        partCount: part.partCount,
        payloadOffset: 0,
        payloadLength: part.payloadLength,
        payloadCrc32: part.payloadCrc32,
        recordOffset: 0,
        recordLength: encoded.length,
      });
    }
    directoryTracks.push({
      trackId: input.trackId,
      logicalFile,
      totalByteLength: input.bytes.length,
      partCount: parts.length,
      sha256: input.sha256 ?? null,
      fragments,
    });
  }

  const provisionalDirectory = encodeDirectory(directoryTracks);
  let cursor = EMBEDDED_FILE_HEADER_SIZE + manifestJson.length + provisionalDirectory.length;
  const patchedTracks: EmbeddedTrackDirectoryEntry[] = [];
  let fragIdx = 0;
  for (const t of directoryTracks) {
    const patchedFragments: EmbeddedFragmentRef[] = [];
    for (const f of t.fragments) {
      const record = fragmentRecords[fragIdx]!;
      patchedFragments.push({
        ...f,
        recordOffset: cursor,
        payloadOffset: cursor,
      });
      cursor += record.length;
      fragIdx++;
    }
    patchedTracks.push({ ...t, fragments: patchedFragments });
  }
  const directoryWithOffsets = encodeDirectory(patchedTracks);
  const fragmentDataOffset =
    EMBEDDED_FILE_HEADER_SIZE + manifestJson.length + directoryWithOffsets.length;
  const totalSize = fragmentDataOffset + fragmentRecords.reduce((n, r) => n + r.length, 0);
  const out = new Uint8Array(totalSize);
  const v = new DataView(out.buffer);
  out.set(EMBEDDED_PACKAGE_MAGIC, 0);
  v.setUint32(4, EMBEDDED_PACKAGE_VERSION, true);
  v.setUint32(8, EMBEDDED_FILE_HEADER_SIZE, true);
  writeU64(v, 12, EMBEDDED_FILE_HEADER_SIZE);
  v.setUint32(20, manifestJson.length, true);
  writeU64(v, 24, EMBEDDED_FILE_HEADER_SIZE + manifestJson.length);
  v.setUint32(32, directoryWithOffsets.length, true);
  writeU64(v, 36, fragmentDataOffset);
  out.set(manifestJson, EMBEDDED_FILE_HEADER_SIZE);
  out.set(directoryWithOffsets, EMBEDDED_FILE_HEADER_SIZE + manifestJson.length);
  let fragOffset = fragmentDataOffset;
  for (const record of fragmentRecords) {
    out.set(record, fragOffset);
    fragOffset += record.length;
  }
  return out;
}

export function verifyEmbeddedPackageIntegrity(
  data: Uint8Array,
  opts?: { verifyTrackHashes?: boolean; parseTracks?: boolean },
): EmbeddedPackageIntegrityReport {
  const issues: EmbeddedIntegrityIssue[] = [];
  let fragmentsChecked = 0;
  let missingFragments = 0;
  let badCrcFragments = 0;
  let hashMismatches = 0;
  let index: EmbeddedAlbumPackageIndex;
  try {
    index = indexEmbeddedAlbumPackage(data);
  } catch (e) {
    return {
      valid: false,
      issues: [
        {
          trackId: "",
          code: "package_invalid",
          message: e instanceof Error ? e.message : String(e),
        },
      ],
      tracksChecked: 0,
      fragmentsChecked: 0,
      missingFragments: 0,
      badCrcFragments: 0,
      hashMismatches: 0,
    };
  }
  for (const track of index.tracks) {
    if (track.fragments.length !== track.partCount) {
      issues.push({
        trackId: track.trackId,
        code: "fragment_count",
        message: `Expected ${track.partCount} fragments, directory lists ${track.fragments.length}`,
      });
    }
    const seen = new Set<number>();
    for (const ref of track.fragments) {
      fragmentsChecked++;
      if (seen.has(ref.partIndex)) {
        issues.push({
          trackId: track.trackId,
          partIndex: ref.partIndex,
          code: "duplicate_part",
          message: `Duplicate fragment part ${ref.partIndex}`,
        });
      }
      seen.add(ref.partIndex);
      const slice = data.slice(ref.recordOffset, ref.recordOffset + ref.recordLength);
      const decoded = decodeEmbeddedFragment(slice);
      if (!decoded) {
        missingFragments++;
        issues.push({
          trackId: track.trackId,
          partIndex: ref.partIndex,
          code: "corrupt_fragment",
          message: `Could not decode fragment part ${ref.partIndex}`,
        });
        continue;
      }
      if (crc32(decoded.payload) !== ref.payloadCrc32) {
        badCrcFragments++;
        issues.push({
          trackId: track.trackId,
          partIndex: ref.partIndex,
          code: "crc_mismatch",
          message: `Fragment CRC mismatch part ${ref.partIndex}`,
        });
      }
    }
    for (let i = 0; i < track.partCount; i++) {
      if (!seen.has(i)) {
        missingFragments++;
        issues.push({
          trackId: track.trackId,
          partIndex: i,
          code: "missing_fragment",
          message: `Missing fragment part ${i}`,
        });
      }
    }
  }
  void opts?.verifyTrackHashes;
  void opts?.parseTracks;
  return {
    valid: issues.length === 0,
    issues,
    tracksChecked: index.tracks.length,
    fragmentsChecked,
    missingFragments,
    badCrcFragments,
    hashMismatches,
  };
}

export async function verifyEmbeddedPackageIntegrityAsync(
  data: Uint8Array,
  opts?: { verifyTrackHashes?: boolean },
): Promise<EmbeddedPackageIntegrityReport> {
  const base = verifyEmbeddedPackageIntegrity(data, opts);
  if (!opts?.verifyTrackHashes) return base;
  let index: EmbeddedAlbumPackageIndex;
  try {
    index = indexEmbeddedAlbumPackage(data);
  } catch {
    return base;
  }
  const issues = [...base.issues];
  let hashMismatches = base.hashMismatches;
  for (const track of index.tracks) {
    if (!track.sha256) continue;
    try {
      const bytes = await loadEmbeddedTrackBytes(data, index, track.trackId);
      const digest = await sha256HexDigest(bytes);
      if (digest !== track.sha256.toLowerCase()) {
        hashMismatches++;
        issues.push({
          trackId: track.trackId,
          code: "hash_mismatch",
          message: "Reconstructed track SHA-256 does not match manifest",
        });
      }
    } catch (e) {
      issues.push({
        trackId: track.trackId,
        code: "hash_verify_failed",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return {
    ...base,
    issues,
    hashMismatches,
    valid: issues.length === 0,
  };
}

export function auditEmbeddedAlbumPackage(index: EmbeddedAlbumPackageIndex): string[] {
  const warnings = auditAlbmPackageManifest(index.manifest).map((w) => `${w.path}: ${w.message}`);
  if (index.fileSize > 512 * 1024 * 1024) {
    warnings.push("package: Embedded package is very large (>512 MiB)");
  }
  for (const t of index.tracks) {
    if (t.totalByteLength > 256 * 1024 * 1024) {
      warnings.push(`tracks.${t.trackId}: Embedded track exceeds 256 MiB`);
    }
  }
  return warnings;
}
