// Encoder/decoder delay alignment for fair PCM comparison.
// MP3 decode inserts leading padding; comparing unaligned streams yields garbage metrics.

/**
 * Best integer lag (in frames) maximizing normalized cross-correlation of mono mixes.
 * Positive lag means `candidate` is delayed relative to `reference` (drop lag frames
 * from the start of candidate / pad reference).
 *
 * @returns {{ lagFrames: number, correlation: number, searched: { min: number, max: number } }}
 */
export function findBestLag(reference, candidate, channels, maxLagFrames = 576 * 3) {
  const refMono = toMono(reference, channels);
  const candMono = toMono(candidate, channels);
  const nRef = refMono.length;
  const nCand = candMono.length;
  if (nRef < 8 || nCand < 8) {
    return { lagFrames: 0, correlation: 0, searched: { min: 0, max: 0 } };
  }

  // Use a mid-signal window to avoid fade-in/out bias.
  const win = Math.min(nRef, nCand, Math.floor(Math.max(nRef, nCand) * 0.5));
  const refStart = Math.floor((nRef - win) / 2);
  const refSlice = refMono.subarray(refStart, refStart + win);

  let bestLag = 0;
  let bestCorr = -Infinity;
  const minLag = -maxLagFrames;
  const maxLag = maxLagFrames;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const candStart = refStart + lag;
    if (candStart < 0 || candStart + win > nCand) continue;
    const corr = pearson(refSlice, candMono.subarray(candStart, candStart + win));
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  return {
    lagFrames: bestLag,
    correlation: bestCorr === -Infinity ? 0 : bestCorr,
    searched: { min: minLag, max: maxLag },
  };
}

/**
 * Align candidate to reference by best lag. Returns equal-length Int16Arrays
 * (interleaved) cropped to the overlapping region after lag correction.
 */
export function alignByLag(reference, candidate, channels, lagFrames) {
  const refFrames = Math.floor(reference.length / channels);
  const candFrames = Math.floor(candidate.length / channels);
  let refStart = 0;
  let candStart = 0;
  if (lagFrames > 0) {
    candStart = lagFrames;
  } else if (lagFrames < 0) {
    refStart = -lagFrames;
  }
  const frames = Math.min(refFrames - refStart, candFrames - candStart);
  if (frames <= 0) {
    return {
      reference: new Int16Array(0),
      candidate: new Int16Array(0),
      frames: 0,
    };
  }
  const refOut = new Int16Array(frames * channels);
  const candOut = new Int16Array(frames * channels);
  refOut.set(
    reference.subarray(refStart * channels, (refStart + frames) * channels),
  );
  candOut.set(
    candidate.subarray(candStart * channels, (candStart + frames) * channels),
  );
  return { reference: refOut, candidate: candOut, frames };
}

export function alignDecoded(reference, candidate, channels, maxLagFrames) {
  const { lagFrames, correlation, searched } = findBestLag(
    reference,
    candidate,
    channels,
    maxLagFrames,
  );
  const aligned = alignByLag(reference, candidate, channels, lagFrames);
  return { ...aligned, lagFrames, correlation, searched };
}

function toMono(interleaved, channels) {
  const frames = Math.floor(interleaved.length / channels);
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += interleaved[i * channels + c];
    out[i] = s / channels;
  }
  return out;
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va < 1e-12 || vb < 1e-12) return 0;
  return cov / Math.sqrt(va * vb);
}
