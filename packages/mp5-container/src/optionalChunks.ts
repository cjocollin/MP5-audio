import {
  decodeJsonChunk,
  encodeJsonChunk,
  sanitizeJsonString,
  sanitizeStringArray,
} from "./chunkJson.js";

export type LyricLine = { time: number; text: string };

export interface LyrcPayload {
  unsynced?: string;
  synced?: LyricLine[];
  source?: string;
}

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

function normalizeLyrc(raw: Record<string, unknown>): LyrcPayload | null {
  const unsynced = sanitizeJsonString(raw.unsynced, 256 * 1024);
  let synced: LyricLine[] | undefined;
  if (Array.isArray(raw.synced)) {
    synced = raw.synced
      .slice(0, 5000)
      .map((line) => {
        if (!line || typeof line !== "object") return null;
        const o = line as Record<string, unknown>;
        const text = sanitizeJsonString(o.text, 512);
        const time = typeof o.time === "number" ? Math.max(0, o.time) : NaN;
        if (!text || Number.isNaN(time)) return null;
        return { time, text };
      })
      .filter((x): x is LyricLine => x !== null);
    if (!synced.length) synced = undefined;
  }
  const source = sanitizeJsonString(raw.source, 64);
  if (!unsynced && !synced) return null;
  return { unsynced, synced, source };
}

export function encodeLyrc(payload: LyrcPayload): Uint8Array {
  return encodeJsonChunk({
    unsynced: payload.unsynced,
    synced: payload.synced,
    source: payload.source ?? "unknown",
  });
}

export function decodeLyrc(data?: Uint8Array): LyrcPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "LYRC");
  if (!raw) {
    if (data?.length) {
      const text = new TextDecoder().decode(data);
      const unsynced = sanitizeJsonString(text, 256 * 1024);
      return unsynced ? { unsynced, source: "legacy" } : null;
    }
    return null;
  }
  return normalizeLyrc(raw);
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
    };
  }
}
