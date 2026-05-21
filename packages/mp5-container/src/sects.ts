import {
  decodeJsonChunk,
  encodeJsonChunk,
  sanitizeJsonString,
} from "./chunkJson.js";

export const SECT_TYPES = [
  "intro",
  "verse",
  "pre_chorus",
  "chorus",
  "post_chorus",
  "bridge",
  "drop",
  "hook",
  "breakdown",
  "solo",
  "outro",
  "silence",
  "custom",
] as const;

export type SectType = (typeof SECT_TYPES)[number];

export type SectionSource = "artist" | "user" | "ai" | "unknown";

export interface SongSection {
  sectionId: string;
  type: SectType;
  startMs: number;
  endMs?: number;
  title?: string;
  label?: string;
  confidence?: number;
  source?: SectionSource;
  colorHint?: string;
}

export interface SectPayload {
  version?: number;
  sections: SongSection[];
  source?: string;
}

export interface HookPayload {
  sectionId?: string;
  startMs: number;
  endMs?: number;
  label?: string;
}

export type HighlightUseCase =
  | "preview"
  | "share"
  | "chorus"
  | "emotional_peak"
  | "custom";

export interface HighlightMoment {
  startMs: number;
  endMs?: number;
  label?: string;
  useCase?: HighlightUseCase | string;
  sectionId?: string;
}

export interface HiltPayload {
  highlights: HighlightMoment[];
  source?: string;
}

const MAX_SECTIONS = 256;
const MAX_HIGHLIGHTS = 64;

function parseSectType(s: unknown): SectType {
  const v = sanitizeJsonString(s, 32)?.toLowerCase().replace(/-/g, "_");
  if (v && (SECT_TYPES as readonly string[]).includes(v)) return v as SectType;
  if (v === "prechorus") return "pre_chorus";
  if (v === "postchorus") return "post_chorus";
  return "custom";
}

function parseMs(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return Math.max(0, Math.floor(n));
  return null;
}

function parseConfidence(n: unknown): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

function parseSource(s: unknown): SectionSource | undefined {
  if (s === "artist" || s === "user" || s === "ai" || s === "unknown") return s;
  return undefined;
}

function normalizeSection(raw: unknown, index: number): SongSection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const startMs = parseMs(o.startMs ?? o.start);
  if (startMs === null) return null;
  const sectionId = sanitizeJsonString(o.sectionId, 64) ?? `sect-${index + 1}`;
  const type = parseSectType(o.type ?? o.label ?? "custom");
  const endMs = parseMs(o.endMs ?? o.end) ?? undefined;
  const title = sanitizeJsonString(o.title, 128);
  const label = sanitizeJsonString(o.label, 64);
  return {
    sectionId,
    type,
    startMs,
    ...(endMs !== undefined ? { endMs } : {}),
    ...(title ? { title } : {}),
    ...(label ? { label } : {}),
    confidence: parseConfidence(o.confidence),
    source: parseSource(o.source),
    colorHint: sanitizeJsonString(o.colorHint ?? o.color, 32),
  };
}

export function sortSections(sections: SongSection[]): SongSection[] {
  return [...sections].sort((a, b) => a.startMs - b.startMs);
}

export function encodeSect(payload: SectPayload): Uint8Array {
  const sections = sortSections(payload.sections).map((s) => ({
    sectionId: s.sectionId,
    type: s.type,
    startMs: s.startMs,
    endMs: s.endMs,
    title: s.title,
    label: s.label,
    confidence: s.confidence,
    source: s.source,
    colorHint: s.colorHint,
  }));
  return encodeJsonChunk({
    version: payload.version ?? 1,
    sections,
    source: payload.source ?? "unknown",
  });
}

export function decodeSect(data?: Uint8Array): SectPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "SECT");
  if (!raw) return null;
  let sections: SongSection[] = [];
  if (Array.isArray(raw.sections)) {
    sections = raw.sections
      .slice(0, MAX_SECTIONS)
      .map((entry, i) => normalizeSection(entry, i))
      .filter((x): x is SongSection => x !== null);
  }
  if (!sections.length) return null;
  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    sections: sortSections(sections),
    source: sanitizeJsonString(raw.source, 64),
  };
}

export function encodeHook(payload: HookPayload): Uint8Array {
  return encodeJsonChunk({
    sectionId: payload.sectionId,
    startMs: payload.startMs,
    endMs: payload.endMs,
    label: payload.label,
  });
}

export function decodeHook(data?: Uint8Array): HookPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "HOOK");
  if (!raw) return null;
  const startMs = parseMs(raw.startMs);
  if (startMs === null) return null;
  return {
    sectionId: sanitizeJsonString(raw.sectionId, 64),
    startMs,
    endMs: parseMs(raw.endMs) ?? undefined,
    label: sanitizeJsonString(raw.label, 128),
  };
}

function normalizeHighlight(raw: unknown): HighlightMoment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const startMs = parseMs(o.startMs ?? o.start);
  if (startMs === null) return null;
  return {
    startMs,
    endMs: parseMs(o.endMs ?? o.end) ?? undefined,
    label: sanitizeJsonString(o.label, 128),
    useCase: sanitizeJsonString(o.useCase, 32) as HighlightUseCase | string | undefined,
    sectionId: sanitizeJsonString(o.sectionId, 64),
  };
}

export function encodeHilt(payload: HiltPayload): Uint8Array {
  return encodeJsonChunk({
    highlights: payload.highlights.slice(0, MAX_HIGHLIGHTS),
    source: payload.source ?? "unknown",
  });
}

export function decodeHilt(data?: Uint8Array): HiltPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "HILT");
  if (!raw || !Array.isArray(raw.highlights)) return null;
  const highlights = raw.highlights
    .slice(0, MAX_HIGHLIGHTS)
    .map(normalizeHighlight)
    .filter((x): x is HighlightMoment => x !== null);
  if (!highlights.length) return null;
  return {
    highlights,
    source: sanitizeJsonString(raw.source, 64),
  };
}

export function sectTypeLabel(type: SectType): string {
  const labels: Record<SectType, string> = {
    intro: "Intro",
    verse: "Verse",
    pre_chorus: "Pre-chorus",
    chorus: "Chorus",
    post_chorus: "Post-chorus",
    bridge: "Bridge",
    drop: "Drop",
    hook: "Hook",
    breakdown: "Breakdown",
    solo: "Solo",
    outro: "Outro",
    silence: "Silence",
    custom: "Custom",
  };
  return labels[type] ?? type;
}
