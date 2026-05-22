import {
  decodeStemManifest,
  groupStdfFragmentIndex,
  groupStdfFragments,
  resolveStemStorageMode,
  STEM_DATA_FOURCC,
  type Mp5File,
  type StemDescriptor,
  type StemManifest,
  type StemStorageMode,
  type StdfFragmentIndex,
  type StdfFragmentRecord,
} from "@mp5/container";

/** Manifest + lazy frame sources — no full stem reconstruction on parse. */
export interface ParsedStemFile {
  manifest: StemManifest;
  stems: StemDescriptor[];
  fullMixInAudi: boolean;
  storageMode: StemStorageMode;
  warnings: string[];
  errors: string[];
  stda?: Uint8Array;
  stdfGrouped: Map<string, StdfFragmentRecord[]>;
  /** Lazy-indexed STDF (payloads loaded on demand). */
  stdfIndexGrouped?: Map<string, StdfFragmentIndex[]>;
  lazyFile?: Mp5File;
  totalEmbeddedBytes: number;
}

export function parseStemsFromFile(parsed: Mp5File): ParsedStemFile | null {
  try {
    const manifest = decodeStemManifest(parsed.optional.get("STEM"));
    if (!manifest?.stems.length) return null;
    const stda = parsed.optional.get(STEM_DATA_FOURCC);
    const stdfFragments = parsed.stdfFragments ?? [];
    const storageMode = resolveStemStorageMode(
      manifest,
      !!stda?.length,
      parsed.lazy?.stdfFragmentIndex.length ?? stdfFragments.length,
    );
    const stdfGrouped =
      storageMode === "stdf-v1" && !parsed.lazy
        ? groupStdfFragments(stdfFragments)
        : new Map<string, StdfFragmentRecord[]>();
    const stdfIndexGrouped =
      storageMode === "stdf-v1" && parsed.lazy
        ? groupStdfFragmentIndex(parsed.lazy.stdfFragmentIndex)
        : undefined;
    const totalEmbeddedBytes = manifest.stems.reduce(
      (s, d) => s + Math.max(0, d.dataLength || d.byteLength || 0),
      0,
    );
    return {
      manifest,
      stems: manifest.stems,
      fullMixInAudi: manifest.fullMixInAudi,
      storageMode,
      warnings: [],
      errors: [],
      stda: stda?.length ? stda : undefined,
      stdfGrouped,
      stdfIndexGrouped,
      lazyFile: parsed.lazy ? parsed : undefined,
      totalEmbeddedBytes,
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
