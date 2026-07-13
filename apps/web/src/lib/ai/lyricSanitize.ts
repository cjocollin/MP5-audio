const SECTION_NAME =
  /^(intro|verse|pre-?chorus|post-?chorus|chorus|bridge|hook|drop|outro|silence|breakdown|solo)(?:\s*\d+)?$/i;

export interface SanitizedLyricLine {
  text: string;
  section?: string;
  /** True when the line is only a section label (Intro, |Verse, [Chorus], …). */
  isSectionOnly: boolean;
}

function normalizeSectionLabel(raw: string): string {
  const t = raw.trim().replace(/^\|+/, "").replace(/\|+$/, "");
  if (!t) return "";
  const lower = t.toLowerCase().replace(/\s+/g, " ");
  if (/^pre ?chorus/.test(lower)) return "Pre-Chorus";
  if (/^post ?chorus/.test(lower)) return "Post-Chorus";
  if (SECTION_NAME.test(t)) {
    const base = lower.replace(/\s*\d+$/, "");
    if (base === "intro") return "Intro";
    if (base === "verse") return "Verse";
    if (base === "chorus") return "Chorus";
    if (base === "bridge") return "Bridge";
    if (base === "hook") return "Hook";
    if (base === "outro") return "Outro";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t.slice(0, 48);
}

/** Strip LRC-style section markers from a single lyric line. */
export function sanitizeLyricLine(raw: string): SanitizedLyricLine {
  let text = raw.trim();
  if (!text) return { text: "", isSectionOnly: true };

  const bracket = text.match(/^\[(.+?)\]\s*(.*)$/s);
  if (bracket) {
    const section = normalizeSectionLabel(bracket[1] ?? "");
    const rest = (bracket[2] ?? "").trim();
    if (!rest) return { text: "", section: section || undefined, isSectionOnly: true };
    return { text: rest, section: section || undefined, isSectionOnly: false };
  }

  const leadPipe = text.match(/^\|+\s*([^|]+)\s*(.*)$/s);
  if (leadPipe) {
    const section = normalizeSectionLabel(leadPipe[1] ?? "");
    const rest = (leadPipe[2] ?? "").trim();
    if (!rest && section) return { text: "", section, isSectionOnly: true };
    if (rest) {
      return {
        text: rest.replace(/\s+\|[^|]+$/g, "").trim(),
        section: section || undefined,
        isSectionOnly: false,
      };
    }
  }

  const trailPipe = text.match(/^(.+?)\s+\|+\s*([^|]+)$/s);
  if (trailPipe) {
    return {
      text: (trailPipe[1] ?? "").trim(),
      section: normalizeSectionLabel(trailPipe[2] ?? "") || undefined,
      isSectionOnly: false,
    };
  }

  if (/^\|+\s*\S+\s*$/.test(text)) {
    return { text: "", section: normalizeSectionLabel(text), isSectionOnly: true };
  }

  text = text.replace(/\s+\|+(Intro|Verse|Chorus|Bridge|Outro|Hook)[^\s|]*\s*$/gi, "").trim();
  return { text, isSectionOnly: !text };
}

/** Remove standalone section-label lines from plain (unsynced) lyrics. */
export function sanitizeUnsyncedLyrics(raw: string): string {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cleaned = sanitizeLyricLine(line);
    if (cleaned.isSectionOnly || !cleaned.text) continue;
    out.push(cleaned.text);
  }
  return out.join("\n").trim();
}

/** Drop duplicate lines where sequential chunks overlap slightly. */
export function dedupeLyricLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (out.length && out[out.length - 1]!.trim().toLowerCase() === t.toLowerCase()) continue;
    out.push(t);
  }
  return out;
}
