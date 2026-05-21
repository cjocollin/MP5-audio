import type { LyricSyncedLine } from "@mp5/container";

export interface ParseSyncedLyricsResult {
  lines: LyricSyncedLine[];
  errors: string[];
}

const LINE_RE =
  /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?(?:\|([A-Za-z][A-Za-z0-9 _-]{0,31}))?\]\s*(.*)$/;

const KNOWN_SECTIONS = new Set([
  "intro",
  "verse",
  "chorus",
  "bridge",
  "outro",
  "pre-chorus",
  "prechorus",
  "hook",
]);

function normalizeSection(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (KNOWN_SECTIONS.has(lower)) {
    if (lower === "prechorus" || lower === "pre-chorus") return "Pre-Chorus";
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return t.slice(0, 48);
}

/** Parse `[mm:ss.xx]` or `[mm:ss.xxx]` lines into synced LYRC lines. */
export function parseSyncedLyricsText(input: string): ParseSyncedLyricsResult {
  const errors: string[] = [];
  const lines: LyricSyncedLine[] = [];
  const rawLines = input.split(/\r?\n/);

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]?.trim() ?? "";
    if (!line || line.startsWith("#")) continue;

    const m = LINE_RE.exec(line);
    if (!m) {
      errors.push(`Line ${i + 1}: expected [mm:ss.xx] lyric text`);
      continue;
    }

    const minutes = Number(m[1]);
    const seconds = Number(m[2]);
    const frac = m[3] ?? "";
    const sectionRaw = m[4];
    const text = (m[5] ?? "").trim();

    if (minutes > 99 || seconds > 59) {
      errors.push(`Line ${i + 1}: time out of range`);
      continue;
    }

    let fracMs = 0;
    if (frac.length === 2) {
      fracMs = Number(frac) * 10;
    } else if (frac.length === 3) {
      fracMs = Number(frac);
    } else if (frac.length === 1) {
      fracMs = Number(frac) * 100;
    }

    const timeMs = (minutes * 60 + seconds) * 1000 + fracMs;
    const section = sectionRaw ? normalizeSection(sectionRaw) : undefined;

    if (!text && !section) {
      errors.push(`Line ${i + 1}: missing lyric text`);
      continue;
    }

    lines.push({
      timeMs,
      text: text || section || "",
      ...(section ? { section } : {}),
    });
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return { lines, errors };
}

/** Format synced lines for the converter textarea. */
export function formatSyncedLyricsText(lines: LyricSyncedLine[]): string {
  return lines
    .map((l) => {
      const totalSec = l.timeMs / 1000;
      const mm = Math.floor(totalSec / 60);
      const ss = Math.floor(totalSec % 60);
      const cs = Math.round((l.timeMs % 1000) / 10);
      const stamp = `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}]`;
      const section = l.section ? `|${l.section}` : "";
      return `${stamp}${section} ${l.text}`.trimEnd();
    })
    .join("\n");
}
