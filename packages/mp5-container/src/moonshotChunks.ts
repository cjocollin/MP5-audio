/** Moonshot FourCCs — skip-only in all implementation phases until explicitly scheduled. */
export const MOONSHOT_FOURCCS = [
  "ADPT",
  "BRCH",
  "RESP",
  "EXPR",
  "COMM",
  "RULS",
  "HEAL",
  "TIME",
  "CLEAN",
  "LIVE",
  "LANG",
  "MAST",
  "DNA_",
  "SAMP",
  "AIRG",
] as const;

export const MOONSHOT_FOURCC_SET = new Set<string>(MOONSHOT_FOURCCS);

export function isMoonshotChunk(fourcc: string): boolean {
  return MOONSHOT_FOURCC_SET.has(fourcc);
}
