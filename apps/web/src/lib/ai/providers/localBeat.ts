import type { BeatPayload } from "@mp5/container";

const ANALYZER_ID = "mp5-beat-local";
const ENVELOPE_WINDOW_MS = 30;
const ENVELOPE_HOP_DIVISOR = 4;
const TEMPO_MIN = 55;
const TEMPO_MAX = 180;

function int16ToMonoFloat(samples: Int16Array, channels: number): Float32Array {
  const frames = Math.floor(samples.length / channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += samples[i * channels + c]! / 32768;
    }
    mono[i] = sum / channels;
  }
  return mono;
}

function energyEnvelope(
  mono: Float32Array,
  sampleRate: number,
  windowMs = ENVELOPE_WINDOW_MS,
  hopDivisor = ENVELOPE_HOP_DIVISOR,
): Float32Array {
  const windowSize = Math.max(1, Math.floor((sampleRate * windowMs) / 1000));
  const hop = Math.max(1, Math.floor(windowSize / hopDivisor));
  const frames = Math.max(0, Math.floor((mono.length - windowSize) / hop));
  const env = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const start = i * hop;
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const v = mono[start + j] ?? 0;
      sum += v * v;
    }
    env[i] = Math.sqrt(sum / windowSize);
  }
  return env;
}

function envelopeFrameRate(
  sampleRate: number,
  windowMs = ENVELOPE_WINDOW_MS,
  hopDivisor = ENVELOPE_HOP_DIVISOR,
): number {
  const windowSize = Math.max(1, Math.floor((sampleRate * windowMs) / 1000));
  const hop = Math.max(1, Math.floor(windowSize / hopDivisor));
  return sampleRate / hop;
}

function normalizeEnvelope(env: Float32Array): Float32Array {
  const out = new Float32Array(env.length);
  let mean = 0;
  for (const v of env) mean += v;
  mean /= env.length || 1;
  let variance = 0;
  for (let i = 0; i < env.length; i++) {
    const centered = env[i]! - mean;
    out[i] = centered;
    variance += centered * centered;
  }
  const std = Math.sqrt(variance / (env.length || 1)) || 1;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / std;
  return out;
}

function buildOnsetEnvelope(energy: Float32Array): Float32Array {
  const onset = new Float32Array(energy.length);
  onset[0] = 0;
  for (let i = 1; i < energy.length; i++) {
    const rise = energy[i]! - energy[i - 1]!;
    onset[i] = rise > 0 ? rise : 0;
  }
  return normalizeEnvelope(onset);
}

function autocorrAtLag(env: Float32Array, lag: number): number {
  if (lag <= 0 || lag >= env.length - 1) return -Infinity;
  const base = Math.floor(lag);
  const frac = lag - base;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < env.length - base - 1; i++) {
    const shifted = env[i + base]! * (1 - frac) + env[i + base + 1]! * frac;
    sum += env[i]! * shifted;
    count++;
  }
  return count > 0 ? sum / count : -Infinity;
}

function combScore(env: Float32Array, frameRate: number, bpm: number): number {
  if (bpm <= 0) return -Infinity;
  const lag = (60 * frameRate) / bpm;
  let score = 0;
  let weight = 0;
  for (const [k, w] of [
    [1, 1],
    [2, 0.65],
    [3, 0.35],
    [4, 0.2],
  ] as const) {
    score += w * autocorrAtLag(env, lag * k);
    weight += w;
  }
  return weight > 0 ? score / weight : -Infinity;
}

function buildFoldedIoIHistogram(onset: Float32Array, frameRate: number): Map<number, number> {
  let mean = 0;
  for (const v of onset) mean += v;
  mean /= onset.length || 1;
  let variance = 0;
  for (const v of onset) variance += (v - mean) ** 2;
  const threshold = mean + Math.sqrt(variance / (onset.length || 1)) * 0.35;

  const peaks: number[] = [];
  for (let i = 1; i < onset.length - 1; i++) {
    const v = onset[i]!;
    if (v >= threshold && v >= onset[i - 1]! && v >= onset[i + 1]!) peaks.push(i);
  }
  if (peaks.length < 4) return new Map();

  const hist = new Map<number, number>();
  for (let i = 1; i < peaks.length; i++) {
    const ioiSec = (peaks[i]! - peaks[i - 1]!) / frameRate;
    const intervalPref = ioiSec >= 0.45 && ioiSec <= 1.0 ? 1.4 : ioiSec < 0.45 ? 0.35 : 0.8;
    for (const mult of [1, 2, 3, 4]) {
      const adjusted = ioiSec * mult;
      if (adjusted < 0.28 || adjusted > 1.5) continue;
      const bin = Math.round(60 / adjusted);
      for (let d = -1; d <= 1; d++) {
        const key = bin + d;
        if (key < TEMPO_MIN || key > TEMPO_MAX) continue;
        hist.set(key, (hist.get(key) ?? 0) + intervalPref * (d === 0 ? 1 : 0.35));
      }
    }
  }

  const folded = new Map<number, number>();
  for (const [bpm, weight] of hist) {
    folded.set(bpm, (folded.get(bpm) ?? 0) + weight);
    for (const div of [2, 3]) {
      const half = Math.round(bpm / div);
      if (half >= TEMPO_MIN && half <= TEMPO_MAX) {
        folded.set(half, (folded.get(half) ?? 0) + weight * 0.9);
      }
    }
  }
  return folded;
}

function fineSearchAround(
  env: Float32Array,
  frameRate: number,
  anchorBpm: number,
  radius = 2.5,
): { bpm: number; score: number } {
  let bestBpm = anchorBpm;
  let bestScore = -Infinity;
  const searchMin = Math.max(TEMPO_MIN, anchorBpm - radius);
  const searchMax = Math.min(TEMPO_MAX, anchorBpm + radius);
  for (let bpm = searchMin; bpm <= searchMax; bpm += 0.02) {
    const score = combScore(env, frameRate, bpm);
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return { bpm: bestBpm, score: bestScore };
}

function tempoWeight(bpm: number): number {
  if (bpm >= 75 && bpm <= 130) return 1.1;
  if (bpm < 72) return 0.35;
  return 1;
}

function snapNearInteger(env: Float32Array, frameRate: number, bpm: number, score: number): number {
  let best = bpm;
  let bestScore = score;
  const min = Math.max(TEMPO_MIN, Math.floor(bpm - 3));
  const max = Math.min(TEMPO_MAX, Math.ceil(bpm + 3));
  for (let candidate = min; candidate <= max; candidate++) {
    const s = combScore(env, frameRate, candidate);
    if (s >= score * 0.96 && (s > bestScore || (s >= bestScore * 0.995 && Math.abs(candidate - bpm) < Math.abs(best - bpm)))) {
      bestScore = s;
      best = candidate;
    }
  }
  return Math.round(best * 10) / 10;
}

function detectBpmAutocorrFallback(
  env: Float32Array,
  frameRate: number,
): { bpm: number; confidence: number } | null {
  const minLag = Math.max(2, Math.floor((frameRate * 60) / 200));
  const maxLag = Math.min(env.length - 2, Math.floor((frameRate * 60) / TEMPO_MIN));
  if (minLag >= maxLag) return null;

  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const score = autocorrAtLag(env, lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestScore <= 0) return null;

  const coarse = (60 * frameRate) / bestLag;
  const refined = fineSearchAround(env, frameRate, coarse, 4);
  const snapped = snapNearInteger(env, frameRate, refined.bpm, refined.score);
  return { bpm: snapped, confidence: Math.max(0, Math.min(1, refined.score * 6)) };
}

function detectBpm(
  energy: Float32Array,
  onset: Float32Array,
  frameRate: number,
): { bpm: number; confidence: number } | null {
  const blend = normalizeEnvelope(
    Float32Array.from({ length: energy.length }, (_, i) => 0.5 * energy[i]! + 0.5 * onset[i]!),
  );

  const ioiHist = buildFoldedIoIHistogram(onset, frameRate);
  const topBins = [...ioiHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topBins.length === 0) return detectBpmAutocorrFallback(blend, frameRate);

  const maxWeight = topBins[0]![1];
  let bestBpm = 0;
  let bestTotal = -Infinity;
  let bestComb = -Infinity;

  for (const [bin, weight] of topBins) {
    const prior = weight / maxWeight;
    const refined = fineSearchAround(blend, frameRate, bin, 2.5);
    const total = refined.score * (1 + prior * 1.5) * tempoWeight(refined.bpm);
    if (total > bestTotal) {
      bestTotal = total;
      bestComb = refined.score;
      bestBpm = refined.bpm;
    }
  }

  if (!Number.isFinite(bestBpm) || bestBpm <= 0 || bestComb <= 0) {
    return detectBpmAutocorrFallback(blend, frameRate);
  }

  const snapped = snapNearInteger(blend, frameRate, bestBpm, bestComb);
  return {
    bpm: snapped,
    confidence: Math.max(0, Math.min(1, bestComb * 6)),
  };
}

/** Local BPM estimate from PCM — no network, approximate only. */
export function analyzeBeatFromPcm(
  samples: Int16Array,
  sampleRate: number,
  channels: number,
): BeatPayload | null {
  if (!samples.length || sampleRate <= 0 || channels <= 0) return null;

  const mono = int16ToMonoFloat(samples, channels);
  const maxAnalyzeSec = 90;
  const maxSamples = Math.min(mono.length, sampleRate * maxAnalyzeSec);
  const slice = mono.subarray(0, maxSamples);

  const frameRate = envelopeFrameRate(sampleRate);
  const rawEnergy = energyEnvelope(slice, sampleRate);
  const energy = normalizeEnvelope(rawEnergy);
  const onset = buildOnsetEnvelope(rawEnergy);
  const result = detectBpm(energy, onset, frameRate);
  if (!result) return null;

  return {
    bpm: result.bpm,
    timeSignature: "4/4",
    confidence: Math.round(result.confidence * 100) / 100,
    source: "ai-local",
    analyzer: ANALYZER_ID,
  };
}
