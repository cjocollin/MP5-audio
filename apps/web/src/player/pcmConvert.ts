/** Shared Int16 / planar Float32 helpers for mix decode / AudioBuffer upload. */

import { yieldToEventLoop } from "@mp5/container";

const SCALE = 1 / 32768;

/**
 * Yield so the UI can paint / handle input during long main-thread work.
 * Must NOT be requestAnimationFrame: rAF never fires in hidden/occluded tabs,
 * which left track loads parked forever at "Preparing decode…".
 */
export const yieldToMain = yieldToEventLoop;

/** Convert interleaved Int16 PCM to planar Float32 channels (runs where called). */
export function int16ToPlanarFloat(
  samples: Int16Array,
  channels: number,
): Float32Array[] {
  const frames = samples.length / channels;
  if (channels === 1) {
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      out[i] = samples[i]! * SCALE;
    }
    return [out];
  }

  if (channels === 2) {
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let i = 0, s = 0; i < frames; i++) {
      left[i] = samples[s++]! * SCALE;
      right[i] = samples[s++]! * SCALE;
    }
    return [left, right];
  }

  const out: Float32Array[] = Array.from(
    { length: channels },
    () => new Float32Array(frames),
  );
  for (let c = 0; c < channels; c++) {
    const channel = out[c]!;
    for (let i = 0, s = c; i < frames; i++, s += channels) {
      channel[i] = samples[s]! * SCALE;
    }
  }
  return out;
}

/** Yielding convert so the page stays responsive during long uploads. */
export async function int16ToPlanarFloatAsync(
  samples: Int16Array,
  channels: number,
  chunkFrames = 48_000,
): Promise<Float32Array[]> {
  const frames = samples.length / channels;
  if (frames <= chunkFrames) {
    return int16ToPlanarFloat(samples, channels);
  }

  const out: Float32Array[] = Array.from(
    { length: channels },
    () => new Float32Array(frames),
  );

  if (channels === 2) {
    const left = out[0]!;
    const right = out[1]!;
    for (let i = 0; i < frames; ) {
      const end = Math.min(frames, i + chunkFrames);
      for (let f = i, s = i * 2; f < end; f++) {
        left[f] = samples[s++]! * SCALE;
        right[f] = samples[s++]! * SCALE;
      }
      i = end;
      if (i < frames) await yieldToMain();
    }
    return out;
  }

  for (let i = 0; i < frames; ) {
    const end = Math.min(frames, i + chunkFrames);
    for (let c = 0; c < channels; c++) {
      const channel = out[c]!;
      for (let f = i, s = i * channels + c; f < end; f++, s += channels) {
        channel[f] = samples[s]! * SCALE;
      }
    }
    i = end;
    if (i < frames) await yieldToMain();
  }
  return out;
}

/** Fast AudioBuffer fill from planar floats (native copyToChannel). */
export function planarFloatToAudioBuffer(
  ctx: AudioContext,
  channels: Float32Array[],
  sampleRate: number,
): AudioBuffer {
  const frames = channels[0]?.length ?? 0;
  const buffer = ctx.createBuffer(channels.length, frames, sampleRate);
  for (let c = 0; c < channels.length; c++) {
    // Worker-transferred channels are ArrayBuffer-backed; cast for DOM lib typings.
    buffer.copyToChannel(channels[c]! as Float32Array<ArrayBuffer>, c);
  }
  return buffer;
}

/** Copy bytes in chunks with yields before worker transfer. */
export async function copyToArrayBufferAsync(
  bytes: Uint8Array,
  chunkBytes = 2 * 1024 * 1024,
): Promise<ArrayBuffer> {
  if (bytes.byteLength <= chunkBytes) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  }

  const copy = new Uint8Array(bytes.byteLength);
  for (let offset = 0; offset < bytes.byteLength; ) {
    const end = Math.min(bytes.byteLength, offset + chunkBytes);
    copy.set(bytes.subarray(offset, end), offset);
    offset = end;
    if (offset < bytes.byteLength) await yieldToMain();
  }
  return copy.buffer;
}