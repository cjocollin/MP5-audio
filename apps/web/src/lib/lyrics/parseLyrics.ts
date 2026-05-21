import { decodeLyrc, type LyrcPayload } from "@mp5/container";
import type { Mp5File } from "@mp5/container";

export function parseLyrcFromFile(parsed?: Mp5File): LyrcPayload | null {
  if (!parsed?.optional.has("LYRC")) return null;
  try {
    return decodeLyrc(parsed.optional.get("LYRC"));
  } catch {
    return null;
  }
}
