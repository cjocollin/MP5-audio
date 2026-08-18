export interface WaveformResult {
  peaks: number[];
  peak: number;
  rms: number;
}

const DEFAULT_WAVEFORM_POINTS = 1024;
const RMS_WEIGHT = 0.72;
const PEAK_WEIGHT = 1 - RMS_WEIGHT;

export function generateWaveform(
  samples: Int16Array,
  channels: number,
  points = DEFAULT_WAVEFORM_POINTS,
): WaveformResult {
  const channelCount = Number.isFinite(channels) ? Math.max(1, Math.floor(channels)) : 1;
  const frameCount = Math.floor(samples.length / channelCount);
  if (frameCount === 0) return { peaks: [], peak: 0, rms: 0 };

  let globalPeak = 0;
  let sumSq = 0;
  let n = 0;
  const sampleCount = frameCount * channelCount;
  for (let i = 0; i < sampleCount; i += 1) {
    const v = Math.abs(samples[i]! / 32768);
    globalPeak = Math.max(globalPeak, v);
    sumSq += v * v;
    n++;
  }
  const rms = n > 0 ? Math.sqrt(sumSq / n) : 0;

  const requestedPoints = Number.isFinite(points) ? Math.max(1, Math.floor(points)) : DEFAULT_WAVEFORM_POINTS;
  const pointCount = Math.min(requestedPoints, frameCount);
  const peaks: number[] = [];
  for (let p = 0; p < pointCount; p += 1) {
    const startFrame = Math.floor((p / pointCount) * frameCount);
    const endFrame = Math.floor(((p + 1) / pointCount) * frameCount);
    let blockPeak = 0;
    let blockSumSq = 0;
    let blockSamples = 0;
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const frameOffset = frame * channelCount;
      for (let channel = 0; channel < channelCount; channel += 1) {
        const i = frameOffset + channel;
        const v = Math.abs(samples[i]! / 32768);
        blockPeak = Math.max(blockPeak, v);
        blockSumSq += v * v;
        blockSamples += 1;
      }
    }
    const blockRms = blockSamples > 0 ? Math.sqrt(blockSumSq / blockSamples) : 0;
    peaks.push(blockRms * RMS_WEIGHT + blockPeak * PEAK_WEIGHT);
  }
  return { peaks, peak: globalPeak, rms };
}
