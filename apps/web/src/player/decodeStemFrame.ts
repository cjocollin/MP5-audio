import { getCodec } from "../wasm/codec";
import { decodeStemFrameCore } from "../lib/stems/stemDecodeCore";

/** Decode a single stem frame (MP5-L or PCM) without parsing a full container. */
export async function decodeStemFrame(
  frameData: Uint8Array,
  codecId: number,
  channels: number,
  sampleRate: number,
): Promise<{ samples: Int16Array; sampleRate: number; channels: number }> {
  const codec = await getCodec();
  return decodeStemFrameCore(frameData, codecId, channels, sampleRate, codec);
}
