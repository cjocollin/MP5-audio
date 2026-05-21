import { CodecId, REQUIRED_CHUNKS } from "./constants.js";
import type { Mp5File } from "./types.js";
import { validateParsedFile } from "./validator.js";
import { decodeLyrc } from "./lyrc.js";
import { decodeSect, decodeHook, decodeHilt } from "./sects.js";
import { decodeVisu } from "./visu.js";
import {
  decodeStemManifest,
  validateStemFromParsed,
  summarizeStemStorage,
  STEM_DATA_FOURCC,
  STEM_FRAGMENT_FOURCC,
} from "./stems.js";
import { decodeCrdt, decodeLicn, decodeIden } from "./creditsRights.js";
import { getFingFromParsed, getHashFromParsed, buildIntegrityResult } from "./integrity.js";
import { AI_FOURCC_SET } from "./aiChunks.js";
import {
  OPTIONAL_FOURCC_SET,
  isOptionalChunk,
  isWarningChunk,
} from "./advancedChunks.js";
import { isMoonshotChunk } from "./moonshotChunks.js";
import {
  parseAlbmPackageJson,
  validateAlbmPackageManifest,
  auditAlbmPackageManifest,
} from "./albm.js";
import { isSha256Hex } from "./sha256Hex.js";

export type ValidationProfile = "basic" | "playable" | "rich" | "strict" | "package";

export type CompatibilityLevel = "basic" | "playable" | "rich" | "strict" | "warning" | "error";

export interface CompatibilityIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
}

export interface Mp5CompatibilityReport {
  fileType: ".mp5";
  path?: string;
  fileSize: number;
  magic: string;
  containerVersion: string;
  codecId: number;
  codecLabel: string;
  codecVersion: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  chunksPresent: string[];
  requiredPresent: string[];
  requiredMissing: string[];
  optionalKnown: string[];
  optionalUnknown: string[];
  metadataSummary: { title?: string; artist?: string; album?: string };
  hasCover: boolean;
  lyricsSynced: number;
  lyricsUnsynced: number;
  stemsCount: number;
  stemTypes: string[];
  stemStorageMode: string;
  stemFragmentCount: number;
  stemDataTotalBytes: number;
  largestStemChunkBytes: number;
  sectionsCount: number;
  hooksCount: number;
  highlightsCount: number;
  hasVisualTheme: boolean;
  hasCredits: boolean;
  hasRights: boolean;
  hasIdentifiers: boolean;
  integrityStatus: string;
  warnings: string[];
  errors: string[];
  issues: CompatibilityIssue[];
  profiles: Record<ValidationProfile, boolean>;
  compatibilityLevel: CompatibilityLevel;
  parseWarnings: string[];
}

const CODEC_LABELS: Record<number, string> = {
  [CodecId.PCM]: "PCM reference",
  [CodecId.MP5C]: "MP5-C (lab)",
  [CodecId.MP5L]: "MP5-L",
  [CodecId.MP5H]: "MP5-H (hybrid)",
};

function metaValue(file: Mp5File, key: string): string | undefined {
  const m = file.meta.find((e) => e.key === key)?.value;
  return m?.trim() || undefined;
}

function listChunks(file: Mp5File): string[] {
  const out = ["HEAD"];
  if (file.meta.length) out.push("META");
  if (file.cover?.length || file.coverArt) out.push("COVR");
  if (file.audioFrames.length) out.push("AUDI");
  if (file.seek.length) out.push("SEEK");
  if (file.waveform.length) out.push("WAVE");
  if (file.info.length) out.push("INFO");
  if (file.corr.length) out.push("CORR");
  for (const k of file.optional.keys()) out.push(k);
  if (file.stdfFragments.length) {
    out.push(`${STEM_FRAGMENT_FOURCC}×${file.stdfFragments.length}`);
  }
  return out;
}

function classifyOptional(fourcc: string): "known" | "unknown" {
  if (
    OPTIONAL_FOURCC_SET.has(fourcc) ||
    AI_FOURCC_SET.has(fourcc) ||
    isWarningChunk(fourcc) ||
    isOptionalChunk(fourcc) ||
    fourcc === STEM_DATA_FOURCC ||
    fourcc === STEM_FRAGMENT_FOURCC
  ) {
    return "known";
  }
  if (isMoonshotChunk(fourcc)) return "known";
  return "unknown";
}

export function mp5CodecVersionLabel(codecId: number, audi?: Uint8Array): string {
  if (!audi?.length) return "n/a";
  if (codecId === CodecId.MP5L) {
    const v = audi[1];
    if (v === 2) return "v2 (legacy)";
    if (v === 3) return "v3 (recommended)";
    return `v${v ?? "?"}`;
  }
  if (codecId === CodecId.MP5C) {
    const v = audi[1];
    if (v === 2) return "v2 (legacy)";
    if (v === 3) return "v3";
    if (v === 4) return "v4 (current encoder)";
    return `v${v ?? "?"}`;
  }
  if (codecId === CodecId.MP5H) return audi.length ? "hybrid frame" : "n/a";
  if (codecId === CodecId.PCM) return "raw PCM";
  return "unknown";
}

export function assessMp5Compatibility(
  file: Mp5File,
  opts?: { fileSize?: number; path?: string },
): Mp5CompatibilityReport {
  const issues: CompatibilityIssue[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const chunks = listChunks(file);
  const requiredPresent: string[] = [];
  const requiredMissing: string[] = [];
  for (const r of REQUIRED_CHUNKS) {
    if (chunks.includes(r)) requiredPresent.push(r);
    else requiredMissing.push(r);
  }

  const optionalKnown: string[] = [];
  const optionalUnknown: string[] = [];
  for (const k of file.optional.keys()) {
    if (classifyOptional(k) === "known") optionalKnown.push(k);
    else optionalUnknown.push(k);
  }

  let basic = false;
  let playable = false;
  let rich = false;
  let strict = false;

  try {
    validateParsedFile(file, chunks.length);
    basic = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    issues.push({ level: "error", code: "parse_invalid", message: msg });
    errors.push(msg);
  }

  const head = file.head;
  const audi = file.audioFrames[0]?.data;
  const codecId = head?.codecId ?? -1;
  const durationSec = head
    ? Number(head.totalSamples) / head.sampleRate
    : 0;

  if (head && file.audioFrames.length) {
    playable = basic;
    if (codecId === CodecId.MP5C) {
      issues.push({
        level: "warning",
        code: "codec_lab",
        message: "MP5-C is lab-only and may hiss — not recommended for distribution.",
      });
      warnings.push("MP5-C lab codec — experimental playback");
    }
    if (codecId === CodecId.MP5H && !file.corr.length) {
      issues.push({
        level: "warning",
        code: "mp5h_no_corr",
        message: "MP5-H without CORR correction may hiss — hybrid not fully lossless.",
      });
      warnings.push("MP5-H missing CORR chunk");
    }
    if (codecId === CodecId.MP5L && audi?.[1] !== 3) {
      issues.push({
        level: "warning",
        code: "mp5l_not_v3",
        message: "MP5-L bitstream is not v3 — v3 is the Alpha default/recommended.",
      });
      warnings.push("MP5-L not v3");
    }
  } else if (basic) {
    issues.push({ level: "error", code: "no_audio", message: "Missing HEAD or AUDI." });
    errors.push("Not playable — missing audio");
  }

  const lyrc = decodeLyrc(file.optional.get("LYRC"));
  const lyricsSynced = lyrc?.synced?.length ?? 0;
  const lyricsUnsynced = lyrc?.unsynced?.length ?? 0;
  const stemManifest = decodeStemManifest(file.optional.get("STEM"));
  const stemSummary = summarizeStemStorage(file);
  const stemCheck = stemManifest ? validateStemFromParsed(file) : null;
  if (stemCheck && !stemCheck.valid) {
    for (const err of stemCheck.errors) {
      issues.push({ level: "error", code: "stem_invalid", message: err });
      errors.push(err);
    }
  }
  if (stemCheck?.warnings.length) {
    for (const w of stemCheck.warnings) {
      issues.push({ level: "warning", code: "stem_warning", message: w });
      warnings.push(w);
    }
  }
  if (stemSummary.storageMode === "stdf-v1") {
    issues.push({
      level: "info",
      code: "stem_stdf",
      message: `Segmented stem storage (STDF): ${stemSummary.fragmentCount} fragment(s), ~${Math.round(stemSummary.totalStemBytes / (1024 * 1024))} MB stem data.`,
    });
  }
  const sect = decodeSect(file.optional.get("SECT"));
  const hook = decodeHook(file.optional.get("HOOK"));
  const hilt = decodeHilt(file.optional.get("HILT"));
  const visu = decodeVisu(file.optional.get("VISU"));
  const hasCredits = !!decodeCrdt(file.optional.get("CRDT"));
  const hasRights = !!decodeLicn(file.optional.get("LICN"));
  const hasIdentifiers = !!decodeIden(file.optional.get("IDEN"));

  const fing = getFingFromParsed(file);
  const hash = getHashFromParsed(file);
  const integrity = buildIntegrityResult({
    fing,
    hash,
    fileHashOk: null,
    pcmHashOk: null,
    audiHashOk: null,
    metaHashOk: null,
    chunkChecks: [],
  });

  if (optionalUnknown.length) {
    issues.push({
      level: "info",
      code: "unknown_optional",
      message: `Unknown optional chunk(s): ${optionalUnknown.join(", ")} — safe to ignore per Alpha policy.`,
    });
  }

  for (const w of file.warnings) {
    warnings.push(w);
    issues.push({ level: "warning", code: "parse_warning", message: w });
  }

  rich =
    playable &&
    errors.length === 0 &&
    (!stemManifest || (stemCheck?.valid ?? false));

  if (hash || fing) {
    if (integrity.status === "verified") strict = rich;
    else if (integrity.status === "mismatch") {
      issues.push({
        level: "warning",
        code: "integrity_mismatch",
        message: "HASH/FING present but verification incomplete in this tool — re-export or verify in player.",
      });
      warnings.push("Integrity mismatch or partial");
      strict = false;
    } else {
      strict = rich;
    }
  } else {
    strict = false;
    if (playable) {
      issues.push({
        level: "info",
        code: "no_integrity",
        message: "No FING/HASH chunks — strict profile requires integrity metadata.",
      });
    }
  }

  const profiles: Record<ValidationProfile, boolean> = {
    basic,
    playable,
    rich,
    strict,
    package: false,
  };

  let compatibilityLevel: CompatibilityLevel = "error";
  if (!basic) compatibilityLevel = "error";
  else if (!playable || errors.length) compatibilityLevel = "warning";
  else if (strict) compatibilityLevel = "strict";
  else if (rich) compatibilityLevel = "rich";
  else compatibilityLevel = "playable";

  return {
    fileType: ".mp5" as const,
    path: opts?.path,
    fileSize: opts?.fileSize ?? 0,
    magic: "MP5A",
    containerVersion: "1 (Alpha)",
    codecId,
    codecLabel: CODEC_LABELS[codecId] ?? `codec ${codecId}`,
    codecVersion: mp5CodecVersionLabel(codecId, audi),
    durationSec,
    sampleRate: head?.sampleRate ?? 0,
    channels: head?.channels ?? 0,
    chunksPresent: chunks,
    requiredPresent,
    requiredMissing,
    optionalKnown,
    optionalUnknown,
    metadataSummary: {
      title: metaValue(file, "title"),
      artist: metaValue(file, "artist"),
      album: metaValue(file, "album"),
    },
    hasCover: !!(file.cover?.length || file.coverArt),
    lyricsSynced,
    lyricsUnsynced,
    stemsCount: stemManifest?.stems.length ?? 0,
    stemTypes: stemManifest?.stems.map((s) => s.stemType) ?? [],
    stemStorageMode: stemSummary.storageMode,
    stemFragmentCount: stemSummary.fragmentCount,
    stemDataTotalBytes: stemSummary.totalStemBytes,
    largestStemChunkBytes: stemSummary.largestFragmentBytes,
    sectionsCount: sect?.sections.length ?? 0,
    hooksCount: hook ? 1 : 0,
    highlightsCount: hilt?.highlights.length ?? 0,
    hasVisualTheme: !!visu?.themeName,
    hasCredits,
    hasRights,
    hasIdentifiers,
    integrityStatus: integrity.status,
    warnings,
    errors,
    issues,
    profiles,
    compatibilityLevel,
    parseWarnings: [...file.warnings],
  };
}

export interface Mp5pCompatibilityReport {
  fileType: ".mp5p";
  path?: string;
  manifestFormat: string;
  manifestVersion: number;
  albumTitle: string;
  albumArtist?: string;
  trackCount: number;
  sidecarPaths: string[];
  tracksWithHash: number;
  missingSidecars: string[];
  auditWarnings: string[];
  validationErrors: string[];
  profiles: Record<ValidationProfile, boolean>;
  compatibilityLevel: CompatibilityLevel;
}

export function assessMp5pCompatibility(
  text: string,
  opts?: { path?: string; sidecarExists?: (relativePath: string) => boolean },
): Mp5pCompatibilityReport {
  const { manifest, errors } = parseAlbmPackageJson(text);
  const validationErrors = errors.map((e) => `${e.path}: ${e.message}`);
  let packageOk = false;
  if (manifest) {
    const v = validateAlbmPackageManifest(manifest as unknown as Record<string, unknown>);
    if (v.errors.length) validationErrors.push(...v.errors.map((e) => `${e.path}: ${e.message}`));
    else packageOk = true;
  }

  const missingSidecars: string[] = [];
  const sidecarPaths = manifest?.tracks.map((t) => t.file) ?? [];
  if (manifest && opts?.sidecarExists) {
    for (const t of manifest.tracks) {
      if (!opts.sidecarExists(t.file)) missingSidecars.push(t.file);
    }
  }

  const auditWarnings = manifest
    ? auditAlbmPackageManifest(manifest).map((w) => `${w.path}: ${w.message}`)
    : [];

  const basic = !!manifest && validationErrors.length === 0;
  const playable = basic && missingSidecars.length === 0;
  const rich = playable;
  const strict =
    playable &&
    (manifest?.tracks.every((t) => !t.fileSha256 || isSha256Hex(t.fileSha256)) ?? false);

  const profiles: Record<ValidationProfile, boolean> = {
    basic,
    playable,
    rich,
    strict,
    package: packageOk,
  };

  let compatibilityLevel: CompatibilityLevel = "error";
  if (!manifest) compatibilityLevel = "error";
  else if (!packageOk) compatibilityLevel = "warning";
  else if (missingSidecars.length) compatibilityLevel = "warning";
  else if (strict) compatibilityLevel = "strict";
  else if (rich) compatibilityLevel = "rich";
  else compatibilityLevel = "playable";

  return {
    fileType: ".mp5p",
    path: opts?.path,
    manifestFormat: manifest?.format ?? "(invalid)",
    manifestVersion: manifest?.version ?? 0,
    albumTitle: manifest?.album.title ?? "(unknown)",
    albumArtist: manifest?.album.artist,
    trackCount: manifest?.tracks.length ?? 0,
    sidecarPaths,
    tracksWithHash: manifest?.tracks.filter((t) => t.fileSha256).length ?? 0,
    missingSidecars,
    auditWarnings,
    validationErrors,
    profiles,
    compatibilityLevel,
  };
}
