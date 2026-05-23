import {
  decodeJsonChunk,
  encodeJsonChunk,
  sanitizeJsonString,
} from "./chunkJson.js";
import {
  parseCrdtObject,
  parseLicnObject,
  parseIdenObject,
  type CrdtPayload,
  type LicnPayload,
  type IdenPayload,
} from "./creditsRights.js";
import { normalizeSha256Hex } from "./sha256Hex.js";

/** Standalone `.mp5p` manifest and optional ALBM chunk share this schema. */
export const ALBUM_MANIFEST_FORMAT = "mp5-album-manifest-v1";
/** Embedded binary `.mp5p` album package manifest (prototype Alpha). */
export const EMBEDDED_ALBUM_MANIFEST_FORMAT = "mp5-album-embedded-v1";
export type AlbmPackageFormat =
  | typeof ALBUM_MANIFEST_FORMAT
  | typeof EMBEDDED_ALBUM_MANIFEST_FORMAT;
export const MAX_ALBUM_TRACKS = 256;
export const MAX_ALBUM_CREDITS_LEN = 4096;

export interface AlbmCoverEmbedded {
  type: "embedded";
  mime: string;
  /** Base64-encoded image bytes (no data: URL). */
  dataBase64: string;
}

export interface AlbmCoverFileRef {
  type: "file";
  /** Relative path from manifest file, e.g. `cover.jpg`. */
  path: string;
  mime?: string;
}

export type AlbmCoverRef = AlbmCoverEmbedded | AlbmCoverFileRef;

export interface AlbmAlbumMeta {
  title: string;
  artist?: string;
  albumArtist?: string;
  year?: string;
  releaseDate?: string;
  genre?: string;
  cover?: AlbmCoverRef;
}

export interface AlbmTrackRef {
  trackId: string;
  /** Relative path to `.mp5` from manifest location, or basename for loose imports. */
  file: string;
  trackNumber: number;
  discNumber?: number;
  title?: string;
  artist?: string;
  durationMs?: number;
  gaplessPrevious?: boolean;
  gaplessNext?: boolean;
  /** Optional SHA-256 hex of sidecar `.mp5` file bytes for integrity check. */
  fileSha256?: string;
}

export interface AlbmPackageManifest {
  format: AlbmPackageFormat;
  version: number;
  album: AlbmAlbumMeta;
  tracks: AlbmTrackRef[];
  /** Freeform album credits text (legacy/simple). */
  credits?: string;
  /** Structured album-level credits (optional). */
  crdt?: CrdtPayload;
  /** Album-level rights metadata — informational only. */
  licn?: LicnPayload;
  /** Album-level release identifiers. */
  iden?: IdenPayload;
  gaplessDefault?: boolean;
}

export interface AlbmValidationError {
  path: string;
  message: string;
}

export interface AlbmAuditWarning {
  path: string;
  message: string;
}

/** Max per-track duration (24h) — values above are dropped with a warning. */
export const MAX_TRACK_DURATION_MS = 24 * 60 * 60 * 1000;

function parsePositiveInt(n: unknown): number | undefined {
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.floor(n);
  return undefined;
}

function parseCover(raw: unknown): AlbmCoverRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (o.type === "embedded") {
    const mime = sanitizeJsonString(o.mime, 64) ?? "image/jpeg";
    const dataBase64 =
      typeof o.dataBase64 === "string" ? o.dataBase64.replace(/\s/g, "").slice(0, 2_800_000) : "";
    if (!dataBase64 || !/^[A-Za-z0-9+/=]+$/.test(dataBase64)) return undefined;
    return { type: "embedded", mime, dataBase64 };
  }
  if (o.type === "file") {
    const path = sanitizeJsonString(o.path, 256);
    if (!path || path.includes("..") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
      return undefined;
    }
    return { type: "file", path, mime: sanitizeJsonString(o.mime, 64) };
  }
  return undefined;
}

function parseTrack(raw: unknown, index: number): AlbmTrackRef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const file = sanitizeJsonString(o.file, 512);
  const trackId = sanitizeJsonString(o.trackId, 128) ?? `track-${index + 1}`;
  const trackNumber = parsePositiveInt(o.trackNumber) ?? index + 1;
  if (!file) return null;
  if (file.includes("..") || file.startsWith("/") || /^[a-zA-Z]:/.test(file) || file.includes("\\")) {
    return null;
  }
  let durationMs = parsePositiveInt(o.durationMs);
  if (durationMs != null && durationMs > MAX_TRACK_DURATION_MS) {
    durationMs = undefined;
  }
  return {
    trackId,
    file,
    trackNumber,
    discNumber: parsePositiveInt(o.discNumber),
    title: sanitizeJsonString(o.title, 256),
    artist: sanitizeJsonString(o.artist, 256),
    durationMs,
    gaplessPrevious: o.gaplessPrevious === true ? true : undefined,
    gaplessNext: o.gaplessNext === true ? true : undefined,
    fileSha256: normalizeSha256Hex(o.fileSha256),
  };
}

/** Validate and normalize a parsed manifest object. */
export function validateAlbmPackageManifest(
  raw: Record<string, unknown>,
): { manifest: AlbmPackageManifest | null; errors: AlbmValidationError[] } {
  const errors: AlbmValidationError[] = [];
  const format = sanitizeJsonString(raw.format, 64);
  if (format !== ALBUM_MANIFEST_FORMAT) {
    errors.push({ path: "format", message: `Expected ${ALBUM_MANIFEST_FORMAT}` });
    return { manifest: null, errors };
  }
  const version = typeof raw.version === "number" ? raw.version : 1;
  if (version !== 1) {
    errors.push({ path: "version", message: "Only version 1 is supported" });
  }
  const albumRaw = raw.album;
  if (!albumRaw || typeof albumRaw !== "object") {
    errors.push({ path: "album", message: "Album metadata is required" });
    return { manifest: null, errors };
  }
  const a = albumRaw as Record<string, unknown>;
  const title = sanitizeJsonString(a.title, 256);
  if (!title) {
    errors.push({ path: "album.title", message: "Album title is required" });
    return { manifest: null, errors };
  }
  const tracksRaw = raw.tracks;
  if (!Array.isArray(tracksRaw) || !tracksRaw.length) {
    errors.push({ path: "tracks", message: "At least one track is required" });
    return { manifest: null, errors };
  }
  if (tracksRaw.length > MAX_ALBUM_TRACKS) {
    errors.push({ path: "tracks", message: `Maximum ${MAX_ALBUM_TRACKS} tracks` });
    return { manifest: null, errors };
  }
  const tracks: AlbmTrackRef[] = [];
  for (let i = 0; i < tracksRaw.length; i++) {
    const t = parseTrack(tracksRaw[i], i);
    if (!t) {
      errors.push({ path: `tracks[${i}]`, message: "Invalid track entry" });
      continue;
    }
    tracks.push(t);
  }
  if (!tracks.length) {
    return { manifest: null, errors };
  }
  tracks.sort((x, y) => {
    const d = (x.discNumber ?? 1) - (y.discNumber ?? 1);
    if (d !== 0) return d;
    return x.trackNumber - y.trackNumber;
  });

  const dedupedTracks: AlbmTrackRef[] = [];
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!;
    const fileKey = albumTrackBasename(t.file).toLowerCase();
    if (seenIds.has(t.trackId)) {
      errors.push({ path: `tracks[${i}].trackId`, message: `Duplicate trackId: ${t.trackId}` });
      continue;
    }
    if (seenFiles.has(fileKey)) {
      errors.push({ path: `tracks[${i}].file`, message: `Duplicate file reference: ${t.file}` });
      continue;
    }
    seenIds.add(t.trackId);
    seenFiles.add(fileKey);
    dedupedTracks.push(t);
  }
  if (!dedupedTracks.length) {
    return { manifest: null, errors };
  }

  const credits = sanitizeJsonString(raw.credits, MAX_ALBUM_CREDITS_LEN);
  const crdt = parseCrdtObject(raw.crdt);
  const licn = parseLicnObject(raw.licn);
  const iden = parseIdenObject(raw.iden);

  const manifest: AlbmPackageManifest = {
    format: ALBUM_MANIFEST_FORMAT,
    version: 1,
    album: {
      title,
      artist: sanitizeJsonString(a.artist, 256),
      albumArtist: sanitizeJsonString(a.albumArtist, 256),
      year: sanitizeJsonString(a.year, 16),
      releaseDate: sanitizeJsonString(a.releaseDate, 32),
      genre: sanitizeJsonString(a.genre, 128),
      cover: parseCover(a.cover),
    },
    tracks: dedupedTracks,
    credits,
    crdt: crdt ?? undefined,
    licn: licn ?? undefined,
    iden: iden ?? undefined,
    gaplessDefault: raw.gaplessDefault === true ? true : undefined,
  };
  return { manifest, errors };
}

/** Non-fatal checks after a manifest is validated (cover hints, duration notes). */
export function auditAlbmPackageManifest(manifest: AlbmPackageManifest): AlbmAuditWarning[] {
  const warnings: AlbmAuditWarning[] = [];
  if (manifest.album.cover?.type === "file") {
    warnings.push({
      path: "album.cover",
      message: "Cover uses a sidecar image file — player may not load it in this MVP",
    });
  }
  if (manifest.album.cover?.type === "embedded") {
    const b64 = manifest.album.cover.dataBase64;
    if (b64.length > 2_000_000) {
      warnings.push({ path: "album.cover", message: "Embedded cover is very large" });
    }
  }
  for (let i = 0; i < manifest.tracks.length; i++) {
    const t = manifest.tracks[i]!;
    if (t.durationMs != null && t.durationMs > MAX_TRACK_DURATION_MS) {
      warnings.push({ path: `tracks[${i}].durationMs`, message: "Duration exceeds 24h limit" });
    }
  }
  return warnings;
}

export function parseAlbmPackageJson(text: string): {
  manifest: AlbmPackageManifest | null;
  errors: AlbmValidationError[];
} {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { manifest: null, errors: [{ path: "", message: "Manifest must be a JSON object" }] };
    }
    return validateAlbmPackageManifest(parsed as Record<string, unknown>);
  } catch {
    return { manifest: null, errors: [{ path: "", message: "Invalid JSON" }] };
  }
}

export function encodeAlbmPackage(manifest: AlbmPackageManifest): Uint8Array {
  const payload: AlbmPackageManifest = {
    format: ALBUM_MANIFEST_FORMAT,
    version: 1,
    album: manifest.album,
    tracks: manifest.tracks.slice(0, MAX_ALBUM_TRACKS),
    credits: manifest.credits ? sanitizeJsonString(manifest.credits, MAX_ALBUM_CREDITS_LEN) : undefined,
    crdt: manifest.crdt,
    licn: manifest.licn,
    iden: manifest.iden,
    gaplessDefault: manifest.gaplessDefault,
  };
  return encodeJsonChunk(payload);
}

/** Decode ALBM optional chunk (same JSON schema as `.mp5p` manifest). */
export function decodeAlbm(data?: Uint8Array): AlbmPackageManifest | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "ALBM");
  if (!raw) return null;
  const { manifest } = validateAlbmPackageManifest(raw);
  return manifest;
}

export function manifestToJson(manifest: AlbmPackageManifest, pretty = true): string {
  return JSON.stringify(manifest, null, pretty ? 2 : 0);
}

/** Basename match helper for resolving track files. */
export function albumTrackBasename(fileRef: string): string {
  const parts = fileRef.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? fileRef;
}
