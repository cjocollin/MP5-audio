import type { StemType } from "./stemTypes";

/** Filename-only stem type hints — user can override in the UI. */
const FILENAME_RULES: { pattern: RegExp; type: StemType }[] = [
  { pattern: /\b(lead[\s_-]?vox|lead[\s_-]?vocal|lead vocal)\b/i, type: "lead_vocals" },
  {
    pattern: /\b(bg[\s_-]?vox|bg[\s_-]?vocal|background[\s_-]?vocal|harmony|harmonies|backing[\s_-]?vocal|bgv)\b/i,
    type: "background_vocals",
  },
  { pattern: /\b(808|sub[\s_-]?bass)\b/i, type: "bass" },
  { pattern: /\bsub\b/i, type: "bass" },
  { pattern: /\bbass\b/i, type: "bass" },
  { pattern: /\bkick\b/i, type: "percussion" },
  { pattern: /\b(snare|clap|snares?[\s_-]?(and|&|n)[\s_-]?claps?)\b/i, type: "percussion" },
  { pattern: /\b(hat|hats|hi[\s_-]?hat|hihat)\b/i, type: "percussion" },
  { pattern: /\bdrums?\b/i, type: "drums" },
  { pattern: /\b(synths?|keys|keyboard)\b/i, type: "synths" },
  { pattern: /\bguitar\b/i, type: "guitar" },
  { pattern: /\bpiano\b/i, type: "piano" },
  { pattern: /\b(fx|effects|vocal[\s_-]?fx)\b/i, type: "effects" },
  { pattern: /\bvox\b/i, type: "lead_vocals" },
  { pattern: /\bvocal\b/i, type: "lead_vocals" },
  { pattern: /\binstrumental\b/i, type: "instrumental" },
  { pattern: /\b(acapella|a[\s_-]?cappella)\b/i, type: "acapella" },
  { pattern: /\bstrings?\b/i, type: "strings" },
];

export function normalizeStemFilenameForGuess(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return base.toLowerCase().replace(/[._-]+/g, " ");
}

export function guessStemTypeFromFilename(fileName: string): StemType {
  const norm = normalizeStemFilenameForGuess(fileName);
  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(norm)) return rule.type;
  }
  return "custom";
}

export function defaultStemNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
