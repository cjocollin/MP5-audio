import { CodecId } from "@mp5/container";
import { alignedInt16 } from "../pcm/alignedInt16";

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
    return { samples: alignedInt16(frameData), sampleRate, channels };
  }

  if (codecId === CodecId.MP5L) {
    if (!codec) {
      throw new Error("MP5-L stem decode requires WASM codec.");
    }
    try {
      const samples = codec.decode_mp5l(frameData);
      return { samples, sampleRate, channels };
    } catch (err) {
      throw new Error("Stem MP5-L decode failed. Re-export stems as MP5-L (v3/v4).", {
        cause: err,
      });
    }
  }

  throw new Error(
    `Unsupported stem codec (${codecId}). Stems should use MP5-L or PCM reference.`,
  );
}
