export interface WaveformResult {
  peaks: number[];
  peak: number;
  rms: number;
}

export function generateWaveform(samples: Int16Array, channels: number, points = 512): WaveformResult {
  const frameCount = Math.floor(samples.length / channels);
  if (frameCount === 0) return { peaks: [], peak: 0, rms: 0 };

  let globalPeak = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = 0; i < samples.length; i += channels) {
    const v = Math.abs(samples[i]! / 32768);
    globalPeak = Math.max(globalPeak, v);
    sumSq += v * v;
    n++;
  }
  const rms = n > 0 ? Math.sqrt(sumSq / n) : 0;

  const block = Math.max(1, Math.floor(frameCount / points));
  const peaks: number[] = [];
  for (let p = 0; p < points; p++) {
    const start = p * block * channels;
    const end = Math.min(start + block * channels, samples.length);
    let peak = 0;
    for (let i = start; i < end; i += channels) {
      const v = Math.abs(samples[i]! / 32768);
      if (v > peak) peak = v;
    }
    peaks.push(peak);
  }
  return { peaks, peak: globalPeak, rms };
}