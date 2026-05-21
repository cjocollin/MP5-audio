import {
  decodeStemFrameEntries,
  decodeStemManifest,
  resolveStemStorageMode,
  STEM_DATA_FOURCC,
  type Mp5File,
  type StemDescriptor,
  type StemManifest,
  type StemStorageMode,
} from "@mp5/container";

export interface ParsedStemFile {
  manifest: StemManifest;
  stems: (StemDescriptor & { frameData: Uint8Array })[];
  fullMixInAudi: boolean;
  storageMode: StemStorageMode;
  warnings: string[];
  errors: string[];
}

export function parseStemsFromFile(parsed: Mp5File): ParsedStemFile | null {
  try {
    const manifest = decodeStemManifest(parsed.optional.get("STEM"));
    if (!manifest?.stems.length) return null;
    const { entries, errors, warnings } = decodeStemFrameEntries(
      manifest,
      parsed.optional.get(STEM_DATA_FOURCC),
      parsed.stdfFragments,
    );
    const playable = entries.some((e) => e.length > 0);
    if (!playable && errors.length) {
      return {
        manifest,
        stems: manifest.stems.map((desc) => ({ ...desc, frameData: new Uint8Array(0) })),
        fullMixInAudi: manifest.fullMixInAudi,
        storageMode: resolveStemStorageMode(
          manifest,
          parsed.optional.has(STEM_DATA_FOURCC),
          parsed.stdfFragments.length,
        ),
        warnings,
        errors,
      };
    }
    const stems = manifest.stems.map((desc, i) => ({
      ...desc,
      frameData: entries[i] ?? new Uint8Array(0),
    }));
    return {
      manifest,
      stems,
      fullMixInAudi: manifest.fullMixInAudi,
      storageMode: resolveStemStorageMode(
        manifest,
        parsed.optional.has(STEM_DATA_FOURCC),
        parsed.stdfFragments.length,
      ),
      warnings,
      errors,
    };
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
