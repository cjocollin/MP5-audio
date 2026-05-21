export interface ChunkRegistryEntry {
  fourcc: string;
  requiredForPlayback: boolean;
  tier: "warning" | "advanced";
}

export const WARNING_CHUNKS: ChunkRegistryEntry[] = [
  { fourcc: "EXPL", requiredForPlayback: false, tier: "warning" },
  { fourcc: "SAFE", requiredForPlayback: false, tier: "warning" },
  { fourcc: "RECV", requiredForPlayback: false, tier: "warning" },
  { fourcc: "SENS", requiredForPlayback: false, tier: "warning" },
];

export const ADVANCED_CHUNKS: ChunkRegistryEntry[] = [
  { fourcc: "LAYS", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "MIXR", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "KARA", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "SOLO", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "HOOK", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "HILT", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "CVRA", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "ARTS", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "CRDT", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "LICN", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "IDEN", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "SHAR", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "CLIP", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "NOTE", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "MEMR", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "ACCS", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "QUAL", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "REPR", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "AIPR", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "VERS", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "ALBM", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "HASH", requiredForPlayback: false, tier: "advanced" },
  { fourcc: "SIGN", requiredForPlayback: false, tier: "advanced" },
];

export const OPTIONAL_FOURCC_SET = new Set([
  ...WARNING_CHUNKS.map((c) => c.fourcc),
  ...ADVANCED_CHUNKS.map((c) => c.fourcc),
]);

export function isOptionalChunk(fourcc: string): boolean {
  return OPTIONAL_FOURCC_SET.has(fourcc);
}

export function isWarningChunk(fourcc: string): boolean {
  return WARNING_CHUNKS.some((c) => c.fourcc === fourcc);
}
