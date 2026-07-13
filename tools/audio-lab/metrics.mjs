// MP5 Audio Quality Lab — honest signal-quality metrics.
//
// Design rule: metrics never hide bad results. Full-song SNR is reported but is
// known to be misleading on its own (a loud signal masks quiet-passage noise),
// so quiet-window SNR, silence residual and worst-1s SNR are reported alongside.

const FULLSCALE = 32768;
const QUIET_RMS_THRESHOLD = 0.01; // -40 dBFS: below this a window is "quiet"

function toFloatChannels(samples, channels) {
  const frames = Math.floor(samples.length / channels);
  const ch = Array.from({ length: channels }, () => new Float64Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) ch[c][i] = samples[i * channels + c] / FULLSCALE;
  }
  return ch;
}

function rms(arr, start = 0, end = arr.length) {
  let s = 0;
  for (let i = start; i < end; i++) s += arr[i] * arr[i];
  const n = end - start;
  return n > 0 ? Math.sqrt(s / n) : 0;
}

function snrDb(orig, dec, n) {
  let signal = 0, noise = 0;
  for (let i = 0; i < n; i++) {
    const o = orig[i];
    const e = o - dec[i];
    signal += o * o;
    noise += e * e;
  }
  if (signal < 1e-20) return null; // no signal — SNR undefined (use silence residual)
  if (noise < 1e-20) return Infinity; // bit-exact
  return 10 * Math.log10(signal / noise);
}

function pearson(a, b, n) {
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db; va += da * da; vb += db * db;
  }
  if (va < 1e-20 || vb < 1e-20) return 0;
  return cov / Math.sqrt(va * vb);
}

/**
 * Compute the full honest metric set comparing decoded vs original PCM.
 * @param {Int16Array} original interleaved i16
 * @param {Int16Array} decoded  interleaved i16 (may be zero-padded longer than original)
 */
export function computeMetrics(original, decoded, channels, sampleRate) {
  const origFrames = Math.floor(original.length / channels);
  const decFrames = Math.floor(decoded.length / channels);
  const n = Math.min(original.length, decoded.length);

  // bit-exact + raw sample errors (interleaved domain)
  // contentBitExact: every overlapping sample matches (length may differ via
  //   frame padding). bitExact: contentBitExact AND identical length.
  let contentBitExact = true;
  let peakErrAbs = 0;
  let sumSqErr = 0;
  let clips = 0;
  for (let i = 0; i < n; i++) {
    const e = original[i] - decoded[i];
    if (e !== 0) contentBitExact = false;
    const ea = Math.abs(e);
    if (ea > peakErrAbs) peakErrAbs = ea;
    sumSqErr += (e / FULLSCALE) * (e / FULLSCALE);
    if (Math.abs(decoded[i]) >= 32767) clips++;
  }
  const bitExact = contentBitExact && original.length === decoded.length;
  const rmsError = Math.sqrt(sumSqErr / n);
  const peakError = peakErrAbs / FULLSCALE;
  const noiseFloorDbfs = rmsError > 0 ? 20 * Math.log10(rmsError) : -Infinity;

  // float channel views over the common length
  const o = toFloatChannels(original.subarray(0, n), channels);
  const d = toFloatChannels(decoded.subarray(0, n), channels);
  const frames = o[0].length;

  // full SNR (mono-summed energy across channels)
  const oFlat = original.subarray(0, n);
  const dFlat = decoded.subarray(0, n);
  const fOrig = new Float64Array(n), fDec = new Float64Array(n);
  for (let i = 0; i < n; i++) { fOrig[i] = oFlat[i] / FULLSCALE; fDec[i] = dFlat[i] / FULLSCALE; }
  const fullSnrDb = snrDb(fOrig, fDec, n);

  // window analysis (100ms quiet / silence buckets)
  const win = Math.max(1, Math.floor(sampleRate / 10));
  let quietSig = 0, quietNoise = 0, quietWindows = 0;
  let silencePeak = 0, silenceSumSq = 0, silenceSamples = 0, silenceWindows = 0;
  for (let w = 0; w < frames; w += win) {
    const wEnd = Math.min(w + win, frames);
    // original window RMS across channels
    let wsig = 0, count = 0;
    for (let c = 0; c < channels; c++) {
      for (let i = w; i < wEnd; i++) { wsig += o[c][i] * o[c][i]; count++; }
    }
    const wRms = Math.sqrt(wsig / count);
    if (wRms === 0) {
      // pure-silence window — track decoded residual
      silenceWindows++;
      for (let c = 0; c < channels; c++) {
        for (let i = w; i < wEnd; i++) {
          const v = Math.abs(d[c][i]);
          if (v > silencePeak) silencePeak = v;
          silenceSumSq += d[c][i] * d[c][i];
          silenceSamples++;
        }
      }
    } else if (wRms < QUIET_RMS_THRESHOLD) {
      quietWindows++;
      for (let c = 0; c < channels; c++) {
        for (let i = w; i < wEnd; i++) {
          quietSig += o[c][i] * o[c][i];
          const e = o[c][i] - d[c][i];
          quietNoise += e * e;
        }
      }
    }
  }
  const quietWindowSnrDb =
    quietWindows === 0 ? null : quietNoise < 1e-20 ? Infinity : 10 * Math.log10(quietSig / quietNoise);
  const silenceResidualPeak = silenceWindows === 0 ? null : silencePeak;
  const silenceResidualRms = silenceWindows === 0 ? null : Math.sqrt(silenceSumSq / Math.max(1, silenceSamples));

  // worst 1-second window SNR (only over audible windows)
  const sec = Math.max(1, sampleRate);
  let worstSnr = null, worstOffset = null;
  for (let w = 0; w < frames; w += sec) {
    const wEnd = Math.min(w + sec, frames);
    let sig = 0, noise = 0;
    for (let c = 0; c < channels; c++) {
      for (let i = w; i < wEnd; i++) {
        sig += o[c][i] * o[c][i];
        const e = o[c][i] - d[c][i];
        noise += e * e;
      }
    }
    const wRms = Math.sqrt(sig / ((wEnd - w) * channels));
    if (wRms < QUIET_RMS_THRESHOLD) continue; // skip silent/quiet seconds
    const s = noise < 1e-20 ? Infinity : 10 * Math.log10(sig / noise);
    if (worstSnr === null || s < worstSnr) { worstSnr = s; worstOffset = w / sampleRate; }
  }

  // stereo correlation error
  let stereoCorrError = null;
  if (channels === 2 && frames > 0) {
    const co = pearson(o[0], o[1], frames);
    const cd = pearson(d[0], d[1], frames);
    stereoCorrError = Math.abs(co - cd);
  }

  // high-frequency error: RMS of first-difference of the error signal
  let hfSumSq = 0, hfCount = 0;
  for (let c = 0; c < channels; c++) {
    let prevE = 0;
    for (let i = 0; i < frames; i++) {
      const e = o[c][i] - d[c][i];
      const de = e - prevE;
      hfSumSq += de * de;
      prevE = e;
      hfCount++;
    }
  }
  const hfErrorRms = hfCount > 0 ? Math.sqrt(hfSumSq / hfCount) : 0;

  return {
    sampleCountOrig: original.length,
    sampleCountDec: decoded.length,
    durationFramesOrig: origFrames,
    durationFramesDec: decFrames,
    durationMatch: origFrames === decFrames,
    bitExact,
    contentBitExact,
    fullSnrDb: serialSnr(fullSnrDb),
    quietWindowSnrDb: serialSnr(quietWindowSnrDb),
    worst1sSnrDb: serialSnr(worstSnr),
    worst1sOffsetSec: worstOffset,
    rmsError,
    peakError,
    noiseFloorDbfs: Number.isFinite(noiseFloorDbfs) ? noiseFloorDbfs : null,
    clippingCount: clips,
    stereoCorrError,
    hfErrorRms,
    silenceResidualPeak,
    silenceResidualRms,
  };
}

// Infinity (bit-exact) and null (no signal) don't survive JSON well; normalise.
function serialSnr(v) {
  if (v === null) return null;
  if (v === Infinity) return "inf"; // bit-exact within this bucket
  return v;
}

/** Null-test: original PCM vs decoded. Confirms digital silence for lossless. */
export function nullTest(original, decoded, channels, sampleRate, previewWindows = 3) {
  const n = Math.min(original.length, decoded.length);
  let maxDiff = 0, sumSq = 0, nonZero = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.abs(original[i] - decoded[i]);
    if (e > maxDiff) maxDiff = e;
    if (e !== 0) nonZero++;
    sumSq += (e / FULLSCALE) * (e / FULLSCALE);
  }
  const rmsDiff = Math.sqrt(sumSq / n);
  const digitalSilence = maxDiff === 0 && original.length === decoded.length;

  // worst windows preview (100ms windows ranked by error energy)
  const win = Math.max(1, Math.floor(sampleRate / 10)) * channels;
  const windows = [];
  for (let w = 0; w < n; w += win) {
    const wEnd = Math.min(w + win, n);
    let e2 = 0, wMax = 0;
    for (let i = w; i < wEnd; i++) {
      const e = Math.abs(original[i] - decoded[i]);
      e2 += e * e;
      if (e > wMax) wMax = e;
    }
    windows.push({ offsetSec: w / channels / sampleRate, errEnergy: e2, maxDiff: wMax });
  }
  windows.sort((a, b) => b.errEnergy - a.errEnergy);
  return {
    maxDiff,
    rmsDiff,
    nonZeroSamples: nonZero,
    totalSamples: n,
    digitalSilence,
    lengthMatch: original.length === decoded.length,
    worstWindows: windows.slice(0, previewWindows).map((w) => ({
      offsetSec: Number(w.offsetSec.toFixed(3)),
      maxDiff: w.maxDiff,
    })),
  };
}
