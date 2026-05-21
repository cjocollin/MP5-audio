import type { Mp5File, VisuPayload } from "@mp5/container";
import { decodeVisu, parseOptionalMetadata } from "@mp5/container";

export function parseVisuFromFile(parsed?: Mp5File): VisuPayload | null {
  if (!parsed?.optional?.size) return null;
  try {
    const chunks = parseOptionalMetadata(parsed.optional);
    return chunks.visu ?? decodeVisu(parsed.optional.get("VISU"));
  } catch {
    return decodeVisu(parsed.optional.get("VISU"));
  }
}
