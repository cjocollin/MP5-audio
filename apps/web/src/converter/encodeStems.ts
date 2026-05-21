import { CodecId, buildStemOptionalChunks, type StemBundleInput, type StemType } from "@mp5/container";
import { getCodec, isWasmCodecReady } from "../wasm/codec";
import type { PendingStemPcm } from "./stemValidation";

export async function encodeStemsForExport(
  stems: PendingStemPcm[],
): Promise<{ optional: Map<string, Uint8Array>; warnings: string[] }> {
  if (!stems.length) {
    return { optional: new Map(), warnings: [] };
  }

  const wasmReady = isWasmCodecReady();
  const warnings: string[] = [];
  if (!wasmReady) {
    warnings.push("WASM unavailable — stems stored as PCM reference (larger files).");
  }

  const codec = wasmReady ? await getCodec() : null;
  const bundles: StemBundleInput[] = [];

  for (const stem of stems) {
    const ch = stem.channels;
    let frameData: Uint8Array;
    let codecId: number;

    if (wasmReady && codec) {
      frameData = codec.encode_mp5l(stem.samples, ch);
      codecId = CodecId.MP5L;
    } else {
      frameData = new Uint8Array(stem.samples.buffer, stem.samples.byteOffset, stem.samples.byteLength);
      codecId = CodecId.PCM;
    }

    const durationSamples = Math.floor(stem.samples.length / ch);
    bundles.push({
      stemId: stem.id,
      stemName: stem.name.trim() || stem.fileName,
      stemType: stem.stemType,
      codecId,
      sampleRate: stem.sampleRate,
      channels: ch,
      durationSamples,
      frameData,
      defaultVolume: stem.defaultVolume,
      explicitContent: stem.explicitContent,
    });
  }

  const { optional } = buildStemOptionalChunks(bundles);
  return { optional, warnings };
}
