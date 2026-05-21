import {
  decodeStdaEntries,
  decodeStemManifest,
  STEM_DATA_FOURCC,
  type Mp5File,
  type StemDescriptor,
  type StemManifest,
} from "@mp5/container";

export interface ParsedStemFile {
  manifest: StemManifest;
  stems: (StemDescriptor & { frameData: Uint8Array })[];
  fullMixInAudi: boolean;
}

export function parseStemsFromFile(parsed: Mp5File): ParsedStemFile | null {
  try {
    const manifest = decodeStemManifest(parsed.optional.get("STEM"));
    if (!manifest?.stems.length) return null;
    const stda = parsed.optional.get(STEM_DATA_FOURCC);
    const entries = decodeStdaEntries(stda);
    const stems = manifest.stems.map((desc, i) => ({
      ...desc,
      frameData: entries[i] ?? new Uint8Array(0),
    }));
    return { manifest, stems, fullMixInAudi: manifest.fullMixInAudi };
  } catch {
    return null;
  }
}

export function stemCount(parsed?: Mp5File): number {
  if (!parsed) return 0;
  try {
    return decodeStemManifest(parsed.optional.get("STEM"))?.stems.length ?? 0;
  } catch {
    return 0;
  }
}

export function hasStemChunks(parsed?: Mp5File): boolean {
  return stemCount(parsed) > 0;
}
