export interface ChunkRegistryEntry {
  fourcc: string;
  requiredForPlayback: boolean;
  tier: "ai" | "planned";
}

export const AI_CHUNKS: ChunkRegistryEntry[] = [
  { fourcc: "MOOD", requiredForPlayback: false, tier: "ai" },
  { fourcc: "VIBE", requiredForPlayback: false, tier: "ai" },
  { fourcc: "SECT", requiredForPlayback: false, tier: "ai" },
  { fourcc: "LYRC", requiredForPlayback: false, tier: "ai" },
  { fourcc: "STEM", requiredForPlayback: false, tier: "ai" },
  { fourcc: "BEAT", requiredForPlayback: false, tier: "ai" },
  { fourcc: "SUMM", requiredForPlayback: false, tier: "ai" },
  { fourcc: "FING", requiredForPlayback: false, tier: "ai" },
  { fourcc: "RECS", requiredForPlayback: false, tier: "ai" },
  { fourcc: "VISU", requiredForPlayback: false, tier: "ai" },
];

export const AI_FOURCC_SET = new Set(AI_CHUNKS.map((c) => c.fourcc));
