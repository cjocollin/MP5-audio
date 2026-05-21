import { CodecId } from "@mp5/container";

export interface StemCodecFns {
  decode_mp5l: (data: Uint8Array) => Int16Array;
}

/** Decode one stem frame (PCM or MP5-L) — shared by main thread fallback and worker. */
export function decodeStemFrameCore(
  frameData: Uint8Array,
  codecId: number,
  channels: number,
  sampleRate: number,
  codec: StemCodecFns | null,
): { samples: Int16Array; sampleRate: number; channels: number } {
  if (!frameData.length) {
    throw new Error("Stem audio data is empty.");
  }

  if (codecId === CodecId.PCM) {
    const samples = new Int16Array(
      frameData.buffer,
      frameData.byteOffset,
      frameData.byteLength / 2,
    );
    return { samples, sampleRate, channels };
  }

  if (codecId === CodecId.MP5L) {
    if (!codec) {
      throw new Error("MP5-L stem decode requires WASM codec.");
    }
    try {
      const samples = codec.decode_mp5l(frameData);
      return { samples, sampleRate, channels };
    } catch (err) {
      throw new Error("Stem MP5-L decode failed. Re-export stems as MP5-L v3.", { cause: err });
    }
  }

  throw new Error(
    `Unsupported stem codec (${codecId}). Stems should use MP5-L v3 or PCM reference.`,
  );
}
