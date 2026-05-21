import {
  decodeJsonChunk,
  encodeJsonChunk,
  sanitizeJsonString,
} from "./chunkJson.js";

/** Synced lyric line — `timeMs` is milliseconds from track start. */
export interface LyricSyncedLine {
  timeMs: number;
  text: string;
  section?: string;
  source?: string;
}

/** @deprecated Use LyricSyncedLine — kept for decode compatibility. */
export type LyricLine = { time: number; text: string };

export interface LyrcPayload {
  unsynced?: string;
  synced?: LyricSyncedLine[];
  source?: string;
}

const MAX_SYNCED_LINES = 5000;
const MAX_UNSYNCED = 256 * 1024;

function parseTimeMs(o: Record<string, unknown>): number | null {
  if (typeof o.timeMs === "number" && Number.isFinite(o.timeMs)) {
    return Math.max(0, Math.floor(o.timeMs));
  }
  if (typeof o.time === "number" && Number.isFinite(o.time)) {
    return Math.max(0, Math.floor(o.time * 1000));
  }
  return null;
}

function normalizeSyncedLine(raw: unknown): LyricSyncedLine | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const text = sanitizeJsonString(o.text, 512);
  const timeMs = parseTimeMs(o);
  if (!text || timeMs === null) return null;
  const section = sanitizeJsonString(o.section, 48);
  const source = sanitizeJsonString(o.source, 64);
  return {
    timeMs,
    text,
    ...(section ? { section } : {}),
    ...(source ? { source } : {}),
  };
}

function normalizeLyrc(raw: Record<string, unknown>): LyrcPayload | null {
  const unsynced = sanitizeJsonString(raw.unsynced, MAX_UNSYNCED);
  let synced: LyricSyncedLine[] | undefined;
  if (Array.isArray(raw.synced)) {
    synced = raw.synced
      .slice(0, MAX_SYNCED_LINES)
      .map(normalizeSyncedLine)
      .filter((x): x is LyricSyncedLine => x !== null)
      .sort((a, b) => a.timeMs - b.timeMs);
    if (!synced.length) synced = undefined;
  }
  const source = sanitizeJsonString(raw.source, 64);
  if (!unsynced && !synced) return null;
  return { unsynced, synced, source };
}

export function encodeLyrc(payload: LyrcPayload): Uint8Array {
  const synced = payload.synced?.map((line) => {
    const out: Record<string, unknown> = {
      timeMs: line.timeMs,
      text: line.text,
    };
    if (line.section) out.section = line.section;
    if (line.source) out.source = line.source;
    return out;
  });
  return encodeJsonChunk({
    unsynced: payload.unsynced,
    synced,
    source: payload.source ?? "unknown",
  });
}

export function decodeLyrc(data?: Uint8Array): LyrcPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "LYRC");
  if (!raw) {
    if (data?.length) {
      const text = new TextDecoder().decode(data);
      const unsynced = sanitizeJsonString(text, MAX_UNSYNCED);
      return unsynced ? { unsynced, source: "legacy" } : null;
    }
    return null;
  }
  return normalizeLyrc(raw);
}

/** Convert legacy `{ time: seconds }` lines to synced lines. */
export function legacyLinesToSynced(lines: LyricLine[]): LyricSyncedLine[] {
  return lines
    .map((l) => ({
      timeMs: Math.max(0, Math.floor(l.time * 1000)),
      text: l.text,
    }))
    .sort((a, b) => a.timeMs - b.timeMs);
}
