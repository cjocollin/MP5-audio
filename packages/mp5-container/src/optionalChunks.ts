import {
  decodeJsonChunk,
  encodeJsonChunk,
  sanitizeJsonString,
  sanitizeStringArray,
} from "./chunkJson.js";
import { decodeStemManifest } from "./stems.js";
import { decodeLyrc, type LyrcPayload, type LyricLine, type LyricSyncedLine } from "./lyrc.js";
import { decodeSect, decodeHook, decodeHilt } from "./sects.js";
import { decodeVisu } from "./visu.js";
import { decodeCrdt, decodeLicn, decodeIden } from "./creditsRights.js";
import { decodeFing } from "./fing.js";
import { decodeHash } from "./hash.js";

export type { LyrcPayload, LyricLine, LyricSyncedLine };
export { decodeLyrc, encodeLyrc } from "./lyrc.js";
export {
  decodeSect,
  encodeSect,
  decodeHook,
  encodeHook,
  decodeHilt,
  encodeHilt,
  sectTypeLabel,
  sortSections,
  SECT_TYPES,
  type SectPayload,
  type SongSection,
  type SectType,
  type HookPayload,
  type HiltPayload,
  type HighlightMoment,
} from "./sects.js";
export {
  decodeVisu,
  encodeVisu,
  hasVisuContent,
  parseHexColor,
  type VisuPayload,
  type VisuSource,
  type VisualIntensity,
  type VisuPlayerStyle,
} from "./visu.js";
export {
  decodeCrdt,
  encodeCrdt,
  decodeLicn,
  encodeLicn,
  decodeIden,
  encodeIden,
  hasCrdtContent,
  hasLicnContent,
  hasIdenContent,
  parseTriState,
  parseCrdtObject,
  parseLicnObject,
  parseIdenObject,
  normalizeCrdtRecord,
  normalizeLicnRecord,
  normalizeIdenRecord,
  LICN_INFORMATIONAL_DEFAULT,
  type CrdtPayload,
  type LicnPayload,
  type IdenPayload,
  type TriState,
  type PerformerCredit,
  type AdditionalCredit,
} from "./creditsRights.js";
export {
  decodeFing,
  encodeFing,
  hasFingContent,
  fingIdentityKey,
  shortHashPreview,
  FING_VERSION,
  type FingPayload,
  type FingSource,
  type AudioFingerprintType,
} from "./fing.js";
export {
  decodeHash,
  encodeHash,
  hasHashContent,
  HASH_VERSION,
  MAX_CHUNK_HASH_ENTRIES,
  type HashPayload,
  type ChunkHashEntry,
} from "./hash.js";
export {
  getFingFromParsed,
  getHashFromParsed,
  compareSha256,
  summarizeIntegrity,
  buildIntegrityResult,
  expectedChunkHashes,
  mergeChunkCheck,
  type IntegrityCheckStatus,
  type IntegrityCheckResult,
} from "./integrity.js";
export { isSha256Hex, normalizeSha256Hex } from "./sha256Hex.js";

export type WarningSource = "artist" | "user" | "ai" | "unknown";

export interface ExplPayload {
  explicit?: boolean;
  cleanVersionAvailable?: boolean;
  contentWarnings?: string[];
  strongLanguage?: boolean;
  sexualContent?: boolean;
  violence?: boolean;
  drugReferences?: boolean;
  alcoholReferences?: boolean;
  selfHarmThemes?: boolean;
  traumaThemes?: boolean;
  matureThemes?: boolean;
  warningSource?: WarningSource;
  aiGenerated?: boolean;
  confidence?: number;
}

export interface SafePayload {
  tags?: string[];
  griefThemes?: boolean;
  traumaThemes?: boolean;
  panicHeavy?: boolean;
  distressingThemes?: boolean;
  warningSource?: WarningSource;
  aiGenerated?: boolean;
  confidence?: number;
}

export interface RecvPayload {
  recoverySafe?: boolean;
  groundingFriendly?: boolean;
  panicFriendly?: boolean;
  triggers?: string[];
  drugReferences?: boolean;
  alcoholReferences?: boolean;
  relapseThemes?: boolean;
  cravingTriggers?: boolean;
  warningSource?: WarningSource;
  aiGenerated?: boolean;
  confidence?: number;
}

export interface SensPayload {
  warnings?: string[];
  suddenLoudSounds?: boolean;
  intenseBass?: boolean;
  harshFrequencies?: boolean;
  sensoryOverloadRisk?: boolean;
  warningSource?: WarningSource;
  aiGenerated?: boolean;
  confidence?: number;
}

export interface MoodPayload {
  tags?: string[];
  intensity?: number;
  energy?: number;
  source?: string;
}

export interface VibePayload {
  tags?: string[];
  source?: string;
}

function clampConfidence(n: unknown): number | undefined {
  if (typeof n !== "number" || Number.isNaN(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

function parseWarningSource(s: unknown): WarningSource | undefined {
  if (s === "artist" || s === "user" || s === "ai" || s === "unknown") return s;
  return undefined;
}

export function encodeExpl(p: ExplPayload): Uint8Array {
  return encodeJsonChunk(p);
}

export function decodeExpl(data?: Uint8Array): ExplPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "EXPL");
  if (!raw) return null;
  return {
    explicit: raw.explicit === true,
    cleanVersionAvailable: raw.cleanVersionAvailable === true,
    contentWarnings: sanitizeStringArray(raw.contentWarnings),
    strongLanguage: raw.strongLanguage === true,
    sexualContent: raw.sexualContent === true,
    violence: raw.violence === true,
    drugReferences: raw.drugReferences === true,
    alcoholReferences: raw.alcoholReferences === true,
    selfHarmThemes: raw.selfHarmThemes === true,
    traumaThemes: raw.traumaThemes === true,
    matureThemes: raw.matureThemes === true,
    warningSource: parseWarningSource(raw.warningSource) ?? "unknown",
    aiGenerated: raw.aiGenerated === true,
    confidence: clampConfidence(raw.confidence),
  };
}

export function encodeSafe(p: SafePayload): Uint8Array {
  return encodeJsonChunk(p);
}

export function decodeSafe(data?: Uint8Array): SafePayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "SAFE");
  if (!raw) return null;
  return {
    tags: sanitizeStringArray(raw.tags),
    griefThemes: raw.griefThemes === true,
    traumaThemes: raw.traumaThemes === true,
    panicHeavy: raw.panicHeavy === true,
    distressingThemes: raw.distressingThemes === true,
    warningSource: parseWarningSource(raw.warningSource) ?? "unknown",
    aiGenerated: raw.aiGenerated === true,
    confidence: clampConfidence(raw.confidence),
  };
}

export function encodeRecv(p: RecvPayload): Uint8Array {
  return encodeJsonChunk(p);
}

export function decodeRecv(data?: Uint8Array): RecvPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "RECV");
  if (!raw) return null;
  return {
    recoverySafe: raw.recoverySafe === true,
    groundingFriendly: raw.groundingFriendly === true,
    panicFriendly: raw.panicFriendly === true,
    triggers: sanitizeStringArray(raw.triggers),
    drugReferences: raw.drugReferences === true,
    alcoholReferences: raw.alcoholReferences === true,
    relapseThemes: raw.relapseThemes === true,
    cravingTriggers: raw.cravingTriggers === true,
    warningSource: parseWarningSource(raw.warningSource) ?? "unknown",
    aiGenerated: raw.aiGenerated === true,
    confidence: clampConfidence(raw.confidence),
  };
}

export function encodeSens(p: SensPayload): Uint8Array {
  return encodeJsonChunk(p);
}

export function decodeSens(data?: Uint8Array): SensPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "SENS");
  if (!raw) return null;
  return {
    warnings: sanitizeStringArray(raw.warnings),
    suddenLoudSounds: raw.suddenLoudSounds === true,
    intenseBass: raw.intenseBass === true,
    harshFrequencies: raw.harshFrequencies === true,
    sensoryOverloadRisk: raw.sensoryOverloadRisk === true,
    warningSource: parseWarningSource(raw.warningSource) ?? "unknown",
    aiGenerated: raw.aiGenerated === true,
    confidence: clampConfidence(raw.confidence),
  };
}

export function encodeMood(p: MoodPayload): Uint8Array {
  return encodeJsonChunk(p);
}

export function decodeMood(data?: Uint8Array): MoodPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "MOOD");
  if (!raw) return null;
  const tags = sanitizeStringArray(raw.tags);
  if (!tags.length) return null;
  return {
    tags,
    intensity: typeof raw.intensity === "number" ? raw.intensity : undefined,
    energy: typeof raw.energy === "number" ? raw.energy : undefined,
    source: sanitizeJsonString(raw.source, 64),
  };
}

export function encodeVibe(p: VibePayload): Uint8Array {
  return encodeJsonChunk(p);
}

export function decodeVibe(data?: Uint8Array): VibePayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "VIBE");
  if (!raw) return null;
  const tags = sanitizeStringArray(raw.tags);
  if (!tags.length) return null;
  return { tags, source: sanitizeJsonString(raw.source, 64) };
}

/** Parse all optional metadata chunks from a map (safe — never throws on bad JSON). */
export function parseOptionalMetadata(optional: Map<string, Uint8Array>) {
  try {
    return {
      lyrc: decodeLyrc(optional.get("LYRC")),
      expl: decodeExpl(optional.get("EXPL")),
      safe: decodeSafe(optional.get("SAFE")),
      recv: decodeRecv(optional.get("RECV")),
      sens: decodeSens(optional.get("SENS")),
      mood: decodeMood(optional.get("MOOD")),
      vibe: decodeVibe(optional.get("VIBE")),
      stems: decodeStemManifest(optional.get("STEM")),
      sect: decodeSect(optional.get("SECT")),
      hook: decodeHook(optional.get("HOOK")),
      hilt: decodeHilt(optional.get("HILT")),
      visu: decodeVisu(optional.get("VISU")),
      crdt: decodeCrdt(optional.get("CRDT")),
      licn: decodeLicn(optional.get("LICN")),
      iden: decodeIden(optional.get("IDEN")),
      fing: decodeFing(optional.get("FING")),
      hash: decodeHash(optional.get("HASH")),
    };
  } catch {
    return {
      lyrc: null,
      expl: null,
      safe: null,
      recv: null,
      sens: null,
      mood: null,
      vibe: null,
      stems: null,
      sect: null,
      hook: null,
      hilt: null,
      visu: null,
      crdt: null,
      licn: null,
      iden: null,
      fing: null,
      hash: null,
    };
  }
}
