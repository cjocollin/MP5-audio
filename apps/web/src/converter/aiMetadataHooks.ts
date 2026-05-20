export interface AiChunkSet {
  mood?: Uint8Array;
  vibe?: Uint8Array;
  beat?: Uint8Array;
}

export interface AiMetadataProvider {
  analyze?(pcm: Float32Array, sampleRate: number): Promise<Partial<AiChunkSet>>;
}

/** MVP: no-op — AI enrichment is Phase 10 */
export const noopAiProvider: AiMetadataProvider = {};

export async function enrichWithAi(
  _provider: AiMetadataProvider,
  _pcm: Float32Array,
  _sampleRate: number,
): Promise<Partial<AiChunkSet>> {
  return {};
}
