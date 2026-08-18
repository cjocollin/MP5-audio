const RMS_WEIGHT = 0.7;
const PEAK_WEIGHT = 1 - RMS_WEIGHT;
const SMOOTHING_SIDE_WEIGHT = 0.18;
const SMOOTHING_CENTER_WEIGHT = 1 - SMOOTHING_SIDE_WEIGHT * 2;

function safeAmplitude(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

export function resampleWaveformEnvelope(peaks: number[], targetLength: number): number[] {
  const sampleCount = Math.max(1, Math.floor(targetLength));
  if (peaks.length < 2) return peaks.map(safeAmplitude);

  if (peaks.length === sampleCount) {
    return peaks.map(safeAmplitude);
  }

  if (peaks.length < sampleCount) {
    return Array.from({ length: sampleCount }, (_, index) => {
      const position = (index / (sampleCount - 1)) * (peaks.length - 1);
      const leftIndex = Math.floor(position);
      const rightIndex = Math.min(peaks.length - 1, leftIndex + 1);
      const mix = position - leftIndex;
      const left = safeAmplitude(peaks[leftIndex]);
      const right = safeAmplitude(peaks[rightIndex]);
      return left * (1 - mix) + right * mix;
    });
  }

  return Array.from({ length: sampleCount }, (_, index) => {
    const start = Math.floor((index / sampleCount) * peaks.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / sampleCount) * peaks.length));
    let bucketPeak = 0;
    let bucketSumSq = 0;
    let bucketSamples = 0;

    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      const amplitude = safeAmplitude(peaks[sourceIndex]);
      bucketPeak = Math.max(bucketPeak, amplitude);
      bucketSumSq += amplitude * amplitude;
      bucketSamples += 1;
    }

    const bucketRms = bucketSamples > 0 ? Math.sqrt(bucketSumSq / bucketSamples) : 0;
    return bucketRms * RMS_WEIGHT + bucketPeak * PEAK_WEIGHT;
  });
}

export function smoothWaveformEnvelope(peaks: number[]): number[] {
  if (peaks.length < 3) return peaks.map(safeAmplitude);

  return peaks.map((peak, index) => {
    const center = safeAmplitude(peak);
    const previous = safeAmplitude(peaks[index - 1] ?? center);
    const next = safeAmplitude(peaks[index + 1] ?? center);
    return (
      previous * SMOOTHING_SIDE_WEIGHT +
      center * SMOOTHING_CENTER_WEIGHT +
      next * SMOOTHING_SIDE_WEIGHT
    );
  });
}

export function waveformScaleReference(peaks: number[], percentile = 0.98): number {
  if (!peaks.length) return 0.001;
  const sorted = peaks.map(safeAmplitude).sort((a, b) => a - b);
  const boundedPercentile = Math.max(0, Math.min(1, percentile));
  const index = Math.floor((sorted.length - 1) * boundedPercentile);
  return Math.max(0.001, sorted[index] ?? 0);
}
