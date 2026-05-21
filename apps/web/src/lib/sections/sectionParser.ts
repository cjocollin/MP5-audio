import type { HighlightMoment, SectType, SongSection } from "@mp5/container";
import { timecodeToMs } from "./timecode";

export interface ParseSectionsResult {
  sections: SongSection[];
  errors: string[];
}

const SECTION_LINE_RE =
  /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?(?:-(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?)?(?:\|([A-Za-z][A-Za-z0-9_ -]{0,31}))?\]\s*(.*)$/;

function normalizeType(raw: string): SectType {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  const map: Record<string, SectType> = {
    intro: "intro",
    verse: "verse",
    pre_chorus: "pre_chorus",
    prechorus: "pre_chorus",
    chorus: "chorus",
    post_chorus: "post_chorus",
    postchorus: "post_chorus",
    bridge: "bridge",
    drop: "drop",
    hook: "hook",
    breakdown: "breakdown",
    solo: "solo",
    outro: "outro",
    silence: "silence",
    custom: "custom",
  };
  return map[t] ?? "custom";
}

function parseTimeParts(
  lineNo: number,
  minStr: string,
  secStr: string,
  frac: string,
  errors: string[],
): number | null {
  const minutes = Number(minStr);
  const seconds = Number(secStr);
  if (minutes > 99 || seconds > 59) {
    errors.push(`Line ${lineNo}: time out of range`);
    return null;
  }
  return timecodeToMs(minutes, seconds, frac);
}

/** Parse manual section lines for converter export. */
export function parseSectionsText(input: string): ParseSectionsResult {
  const errors: string[] = [];
  const sections: SongSection[] = [];
  const rawLines = input.split(/\r?\n/);

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]?.trim() ?? "";
    if (!line || line.startsWith("#")) continue;

    const m = SECTION_LINE_RE.exec(line);
    if (!m) {
      errors.push(`Line ${i + 1}: expected [mm:ss.xx-mm:ss.xx|Type] title`);
      continue;
    }

    const startMs = parseTimeParts(i + 1, m[1]!, m[2]!, m[3] ?? "", errors);
    if (startMs === null) continue;

    let endMs: number | undefined;
    if (m[4] !== undefined) {
      const end = parseTimeParts(i + 1, m[4], m[5]!, m[6] ?? "", errors);
      if (end === null) continue;
      if (end <= startMs) {
        errors.push(`Line ${i + 1}: end time must be after start`);
        continue;
      }
      endMs = end;
    }

    const typeRaw = m[7];
    const title = (m[8] ?? "").trim();
    const type = typeRaw ? normalizeType(typeRaw) : "custom";

    sections.push({
      sectionId: `sect-${sections.length + 1}`,
      type,
      startMs,
      ...(endMs !== undefined ? { endMs } : {}),
      ...(title ? { title, label: title } : {}),
      source: "user",
    });
  }

  sections.sort((a, b) => a.startMs - b.startMs);
  return { sections, errors };
}

export function formatSectionsText(sections: SongSection[]): string {
  return sections
    .map((s) => {
      const start = formatSectionStamp(s.startMs);
      const end = s.endMs !== undefined ? `-${formatSectionStamp(s.endMs)}` : "";
      const type = s.type === "custom" ? "custom" : s.type;
      const title = s.title ?? s.label ?? "";
      return `[${start}${end}|${type}] ${title}`.trimEnd();
    })
    .join("\n");
}

function formatSectionStamp(ms: number): string {
  const totalSec = ms / 1000;
  const mm = Math.floor(totalSec / 60);
  const ss = Math.floor(totalSec % 60);
  const cs = Math.round((ms % 1000) / 10);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export interface ParseHighlightsResult {
  highlights: HighlightMoment[];
  errors: string[];
}

/** `[start-end|use_case] label` — use_case: preview, share, chorus, emotional_peak */
export function parseHighlightsText(input: string): ParseHighlightsResult {
  const errors: string[] = [];
  const highlights: HighlightMoment[] = [];
  const rawLines = input.split(/\r?\n/);

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]?.trim() ?? "";
    if (!line || line.startsWith("#")) continue;
    const m = SECTION_LINE_RE.exec(line);
    if (!m) {
      errors.push(`Line ${i + 1}: expected [mm:ss.xx-mm:ss.xx|use] label`);
      continue;
    }
    const startMs = parseTimeParts(i + 1, m[1]!, m[2]!, m[3] ?? "", errors);
    if (startMs === null) continue;
    let endMs: number | undefined;
    if (m[4] !== undefined) {
      const end = parseTimeParts(i + 1, m[4], m[5]!, m[6] ?? "", errors);
      if (end === null) continue;
      endMs = end;
    }
    const useCase = m[7]?.trim().toLowerCase().replace(/\s+/g, "_") ?? "custom";
    const label = (m[8] ?? "").trim();
    highlights.push({
      startMs,
      ...(endMs !== undefined ? { endMs } : {}),
      useCase,
      ...(label ? { label } : {}),
    });
  }

  return { highlights, errors };
}

export function formatHighlightsText(highlights: HighlightMoment[]): string {
  return highlights
    .map((h) => {
      const start = formatSectionStamp(h.startMs);
      const end = h.endMs !== undefined ? `-${formatSectionStamp(h.endMs)}` : "";
      const uc = h.useCase ?? "preview";
      const label = h.label ?? "";
      return `[${start}${end}|${uc}] ${label}`.trimEnd();
    })
    .join("\n");
}

/** Derive HOOK chunk from first hook-type section. */
export function hookFromSections(sections: SongSection[]) {
  const hook = sections.find((s) => s.type === "hook");
  if (!hook) return undefined;
  return {
    sectionId: hook.sectionId,
    startMs: hook.startMs,
    endMs: hook.endMs,
    label: hook.title ?? hook.label ?? "Hook",
  };
}
