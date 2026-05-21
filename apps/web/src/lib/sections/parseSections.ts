import {
  decodeSect,
  decodeHook,
  decodeHilt,
  type SectPayload,
  type HookPayload,
  type HiltPayload,
} from "@mp5/container";
import type { Mp5File } from "@mp5/container";

export interface ParsedSongStructure {
  sect: SectPayload | null;
  hook: HookPayload | null;
  hilt: HiltPayload | null;
}

export function parseStructureFromFile(parsed?: Mp5File): ParsedSongStructure {
  if (!parsed) return { sect: null, hook: null, hilt: null };
  try {
    return {
      sect: decodeSect(parsed.optional.get("SECT")),
      hook: decodeHook(parsed.optional.get("HOOK")),
      hilt: decodeHilt(parsed.optional.get("HILT")),
    };
  } catch {
    return { sect: null, hook: null, hilt: null };
  }
}

export function hasSongSections(structure: ParsedSongStructure): boolean {
  return (structure.sect?.sections.length ?? 0) > 0;
}
