import type { CodecModule } from "../wasm/codec";

type ProgressiveCodec = CodecModule;

export type EncodeProgress = (framesDone: number, frameCount: number) => void;

/**
 * Encode MP5-L v4 with optional frame progress. Falls back to one-shot encode.
 * Stream path is bit-identical to `encode_mp5l_v4` when the progressive API is available.
 */
export function encodeMp5lV4Progressive(
  codec: ProgressiveCodec,
  samples: Int16Array,
  channels: number,
  onProgress?: EncodeProgress,
): Uint8Array {
  if (typeof codec.Mp5lV4StreamEncoder === "function") {
    const enc = new codec.Mp5lV4StreamEncoder(samples, channels);
    const total = enc.frameCount();
    onProgress?.(0, total);
    while (enc.encodeNextFrame()) {
      onProgress?.(enc.framesDone(), total);
    }
    // finish() takes ownership — do not call free() afterward.
    return enc.finish();
  }
  return codec.encode_mp5l_v4(samples, channels);
}

/**
 * Multi-worker-ready frame encode: plan once, encode frames (optionally in parallel),
 * assemble in order. Bit-identical to serial `encode_mp5l_v4` when frame order is preserved.
 */
export async function encodeMp5lV4FrameParallel(
  codec: ProgressiveCodec,
  samples: Int16Array,
  channels: number,
  opts?: {
    concurrency?: number;
    onProgress?: EncodeProgress;
  },
): Promise<Uint8Array> {
  if (
    typeof codec.plan_mp5l_v4_boundaries !== "function" ||
    typeof codec.encode_mp5l_v4_frame !== "function" ||
    typeof codec.assemble_mp5l_v4 !== "function"
  ) {
    return encodeMp5lV4Progressive(codec, samples, channels, opts?.onProgress);
  }

  const flat = codec.plan_mp5l_v4_boundaries(samples, channels);
  const ranges: { start: number; end: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    ranges.push({ start: flat[i]!, end: flat[i + 1]! });
  }
  if (!ranges.length) {
    return codec.encode_mp5l_v4(samples, channels);
  }

  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 1, ranges.length));
  const payloads: Uint8Array[] = new Array(ranges.length);
  const offsets = new Uint32Array(ranges.length);
  let done = 0;
  opts?.onProgress?.(0, ranges.length);

  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= ranges.length) return;
      const { start, end } = ranges[idx]!;
      offsets[idx] = start;
      payloads[idx] = codec.encode_mp5l_v4_frame!(samples, channels, start, end);
      done++;
      opts?.onProgress?.(done, ranges.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  let totalLen = 0;
  const lengths = new Uint32Array(payloads.length);
  for (let i = 0; i < payloads.length; i++) {
    lengths[i] = payloads[i]!.byteLength;
    totalLen += payloads[i]!.byteLength;
  }
  const concat = new Uint8Array(totalLen);
  let cursor = 0;
  for (const p of payloads) {
    concat.set(p, cursor);
    cursor += p.byteLength;
  }
  return codec.assemble_mp5l_v4(channels, offsets, concat, lengths);
}
