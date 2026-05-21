import { CodecId } from "@mp5/container";
import { getCodec } from "../wasm/codec";
import { mp5lBitstreamVersion } from "../lib/codecDisplay";

/** Decode a single stem frame (MP5-L or PCM) without parsing a full container. */
export async function decodeStemFrame(
  frameData: Uint8Array,
  codecId: number,
  channels: number,
  sampleRate: number,
): Promise<{ samples: Int16Array; sampleRate: number; channels: number }> {
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

  const codec = await getCodec();

  if (codecId === CodecId.MP5L) {
    try {
      const samples = codec.decode_mp5l(frameData);
      return { samples, sampleRate, channels };
    } catch (err) {
      const ver = mp5lBitstreamVersion(frameData);
      throw new Error(
        `Stem MP5-L decode failed (v${ver ?? "?"}). Re-export stems as MP5-L v3.`,
        { cause: err },
      );
    }
  }

  throw new Error(
    `Unsupported stem codec (${codecId}). Stems should use MP5-L v3 or PCM reference.`,
  );
}
