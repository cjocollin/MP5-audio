/** Encode a PCM slice as WAV bytes for cloud audio APIs. */
export function pcmDurationSec(samples: Int16Array, sampleRate: number, channels: number): number {
  if (!samples.length || sampleRate <= 0 || channels <= 0) return 0;
  return samples.length / channels / sampleRate;
}

export interface PcmClipRange {
  startSec: number;
  maxSec: number;
  index: number;
  total: number;
}

/** Split a track into sequential chunks for cloud transcription / structure analysis. */
export function planSequentialClips(
  durationSec: number,
  chunkSec: number,
  maxChunks: number,
): PcmClipRange[] {
  if (durationSec <= 0 || chunkSec <= 0 || maxChunks <= 0) {
    return [{ startSec: 0, maxSec: chunkSec, index: 0, total: 1 }];
  }

  const needed = Math.min(maxChunks, Math.max(1, Math.ceil(durationSec / chunkSec)));
  const ranges: PcmClipRange[] = [];

  for (let i = 0; i < needed; i++) {
    const startSec = i * chunkSec;
    if (startSec >= durationSec) break;
    const maxSec = Math.min(chunkSec, durationSec - startSec);
    ranges.push({ startSec, maxSec, index: i, total: needed });
  }

  if (ranges.length) ranges[ranges.length - 1]!.total = ranges.length;
  for (const r of ranges) r.total = ranges.length;
  return ranges;
}

/** Encode PCM from an absolute start time (seconds) for up to maxSec. */
export function pcmToWavClipRange(
  samples: Int16Array,
  sampleRate: number,
  channels: number,
  startSec: number,
  maxSec: number,
): Uint8Array {
  if (!samples.length || sampleRate <= 0 || channels <= 0 || maxSec <= 0) return new Uint8Array();

  const totalFrames = Math.floor(samples.length / channels);
  const startFrame = Math.min(totalFrames, Math.max(0, Math.floor(startSec * sampleRate)));
  const maxFrames = Math.floor(maxSec * sampleRate);
  const useFrames = Math.min(maxFrames, totalFrames - startFrame);
  if (useFrames <= 0) return new Uint8Array();

  const startSample = startFrame * channels;
  const clipSamples = samples.subarray(startSample, startSample + useFrames * channels);
  return encodeWavFromSamples(clipSamples, sampleRate, channels);
}

export function pcmToWavClip(
  samples: Int16Array,
  sampleRate: number,
  channels: number,
  maxSec = 30,
  clipStartRatio = 0.25,
): Uint8Array {
  if (!samples.length || sampleRate <= 0 || channels <= 0) return new Uint8Array();

  const totalFrames = Math.floor(samples.length / channels);
  const maxFrames = Math.floor(sampleRate * maxSec);
  const useFrames = Math.min(totalFrames, maxFrames);
  const ratio = Math.max(0, Math.min(1, clipStartRatio));
  const startFrame =
    totalFrames > useFrames ? Math.floor((totalFrames - useFrames) * ratio) : 0;
  const startSample = startFrame * channels;
  const clipSamples = samples.subarray(startSample, startSample + useFrames * channels);
  return encodeWavFromSamples(clipSamples, sampleRate, channels);
}

function encodeWavFromSamples(clipSamples: Int16Array, sampleRate: number, channels: number): Uint8Array {
  const dataSize = clipSamples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < clipSamples.length; i++) {
    view.setInt16(offset, clipSamples[i]!, true);
    offset += 2;
  }

  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
