// MP5 Audio Quality Lab — hiss-specific metrics + Hiss Risk rating.
//
// These target audible hiss directly: quantization noise that survives in quiet
// passages, reverb tails, and fades — the exact failure full-song SNR hides.
// `original` is the clean reference (e.g. MP5-L PCM); `decoded` the candidate.

const FULLSCALE = 32768;
const QUIET_RMS_THRESHOLD = 0.01; // -40 dBFS (matches metrics.mjs)
const DBFS_FLOOR = -200;

function dbfs(rms) {
  return rms > 0 ? 20 * Math.log10(rms) : DBFS_FLOOR;
}
function round(v, d = 1) {
  if (v === null || v === undefined) return null;
  if (v === Infinity) return "inf";
  if (!Number.isFinite(v)) return null;
  return Number(v.toFixed(d));
}

// In-place iterative radix-2 FFT (re/im Float64Array, length power of 2).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const trr = re[b] * cwr - im[b] * cwi;
        const tii = re[b] * cwi + im[b] * cwr;
        re[b] = re[a] - trr; im[b] = im[a] - tii;
        re[a] += trr; im[a] += tii;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr; cwr = ncwr;
      }
    }
  }
}

/** Spectral flatness of a real window (1.0 = white/hiss-like, toward 0 = tonal). */
function spectralFlatness(signal) {
  let n = 1;
  while (n < signal.length) n <<= 1;
  if (n < 64) return null;
  const re = new Float64Array(n), im = new Float64Array(n);
  const L = signal.length;
  for (let i = 0; i < L; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / L);
    re[i] = signal[i] * hann;
  }
  fft(re, im);
  let logSum = 0, arith = 0, count = 0;
  for (let k = 1; k < n / 2; k++) {
    const p = re[k] * re[k] + im[k] * im[k] + 1e-20;
    logSum += Math.log(p);
    arith += p;
    count++;
  }
  if (count === 0) return null;
  const geo = Math.exp(logSum / count);
  const ar = arith / count;
  return ar > 0 ? geo / ar : null;
}

function aggSnr(wins) {
  if (!wins.length) return null;
  let sig = 0, noise = 0;
  for (const w of wins) { sig += w.refRms * w.refRms; noise += w.errRms * w.errRms; }
  if (sig < 1e-20) return null;
  if (noise < 1e-20) return Infinity;
  return 10 * Math.log10(sig / noise);
}
function rmsOf(wins) {
  if (!wins.length) return 0;
  return Math.sqrt(wins.reduce((a, w) => a + w.errRms * w.errRms, 0) / wins.length);
}
function worstQuietWindow(err, refRms, size, sampleRate) {
  size = Math.max(1, size);
  const step = Math.floor(size / 2) || 1;
  let worst = null;
  for (let w = 0; w + size <= err.length; w += step) {
    let sig = 0, noise = 0;
    for (let i = w; i < w + size; i++) { sig += refRms[i] * refRms[i]; noise += err[i] * err[i]; }
    const rms = Math.sqrt(sig / size);
    if (rms === 0 || rms >= QUIET_RMS_THRESHOLD) continue; // only quiet windows
    const snr = noise < 1e-20 ? Infinity : 10 * Math.log10(sig / noise);
    if (worst === null || snr < worst.snr) worst = { snr, start: w, offsetSec: w / sampleRate };
  }
  return worst;
}

export function hissMetrics(original, decoded, channels, sampleRate) {
  const n = Math.min(original.length, decoded.length);
  const frames = Math.floor(n / channels);
  const err = new Float64Array(frames);
  const refRms = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    let e = 0, r = 0;
    for (let c = 0; c < channels; c++) {
      const o = original[i * channels + c] / FULLSCALE;
      const d = decoded[i * channels + c] / FULLSCALE;
      e += o - d;
      r += o * o;
    }
    err[i] = e / channels;
    refRms[i] = Math.sqrt(r / channels);
  }

  const win = Math.max(1, Math.floor(sampleRate / 10)); // 100ms
  const windows = [];
  for (let w = 0; w < frames; w += win) {
    const wEnd = Math.min(w + win, frames);
    let sig = 0, noise = 0;
    for (let i = w; i < wEnd; i++) { sig += refRms[i] * refRms[i]; noise += err[i] * err[i]; }
    const m = wEnd - w;
    windows.push({ refRms: Math.sqrt(sig / m), errRms: Math.sqrt(noise / m) });
  }

  const tailWins = windows.filter((w) => w.refRms > 0 && dbfs(w.refRms) >= -55 && dbfs(w.refRms) < -30);
  const tailSnr = aggSnr(tailWins);
  const reverbDecayErrorRms = tailWins.length
    ? Math.sqrt(tailWins.reduce((a, w) => a + w.errRms * w.errRms, 0) / tailWins.length)
    : null;

  const gateSweep = {};
  for (const thr of [-35, -45, -55]) {
    const lim = Math.pow(10, thr / 20);
    const q = windows.filter((w) => w.refRms > 0 && w.refRms < lim);
    gateSweep[`${thr}dBFS`] = q.length
      ? { windows: q.length, noiseFloorDbfs: round(dbfs(rmsOf(q))) }
      : { windows: 0, noiseFloorDbfs: null };
  }

  let hfQuietSum = 0, hfQuietCount = 0, prev = 0;
  for (let i = 0; i < frames; i++) {
    const de = err[i] - prev;
    prev = err[i];
    if (refRms[i] > 0 && refRms[i] < QUIET_RMS_THRESHOLD) { hfQuietSum += de * de; hfQuietCount++; }
  }
  const hfNoiseFloorDbfs = hfQuietCount ? round(dbfs(Math.sqrt(hfQuietSum / hfQuietCount))) : null;

  const worstQuiet500ms = worstQuietWindow(err, refRms, Math.floor(sampleRate / 2), sampleRate);
  const worstQuiet1s = worstQuietWindow(err, refRms, sampleRate, sampleRate);

  let errorSpectralFlatness = null;
  if (worstQuiet1s && worstQuiet1s.start != null) {
    const s = worstQuiet1s.start;
    const len = Math.min(4096, frames - s);
    if (len >= 64) errorSpectralFlatness = round(spectralFlatness(err.subarray(s, s + len)), 4);
  }

  return {
    tailSnrDb: tailSnr === null ? null : round(tailSnr),
    tailWindows: tailWins.length,
    reverbDecayErrorRms: reverbDecayErrorRms === null ? null : round(reverbDecayErrorRms, 6),
    quietNoiseGateSweep: gateSweep,
    hfNoiseFloorDbfs,
    errorSpectralFlatness,
    worstQuiet500msSnrDb: worstQuiet500ms ? round(worstQuiet500ms.snr) : null,
    worstQuiet1sSnrDb: worstQuiet1s ? round(worstQuiet1s.snr) : null,
  };
}

// ── Hiss Risk rating (committed thresholds — quiet-window SNR, never full-song) ─
// Anchored on lab data: MP5-L is bit-exact (∞ quiet SNR → low); MP5-C reverb
// tails score single-digit dB → severe. A transparent lossy codec should clear
// ~40 dB in quiet passages. These cutoffs are used identically in every report.
export const HISS_RISK_THRESHOLDS = {
  lowMinDb: 40, // quiet-class SNR >= 40 dB (or bit-exact) → low
  mediumMinDb: 25, // 25..40 → medium
  highMinDb: 12, // 12..25 → high; < 12 → severe
};

/**
 * Derive categorical hiss risk from the lowest available quiet-class SNR.
 * `null` = that metric had no qualifying window (absent). `"inf"`/Infinity = a
 * quiet window exists and is bit-exact (clean). If every quiet-class metric is
 * absent → "n/a" (the signal has no quiet/tail content to expose hiss); if windows
 * exist and are all clean → "low".
 */
export function hissRisk({ quietWindowSnrDb, tailSnrDb, worstQuiet1sSnrDb, bitExact }) {
  if (bitExact) return "low";
  const nums = [quietWindowSnrDb, tailSnrDb, worstQuiet1sSnrDb]
    .filter((v) => v !== null && v !== undefined)
    .map((v) => (v === "inf" ? Infinity : v))
    .filter((v) => typeof v === "number"); // keeps Infinity (bit-exact window present)
  if (!nums.length) return "n/a"; // no quiet/tail windows at all
  const worst = Math.min(...nums); // Infinity only if every present window is bit-exact
  if (worst >= HISS_RISK_THRESHOLDS.lowMinDb) return "low";
  if (worst >= HISS_RISK_THRESHOLDS.mediumMinDb) return "medium";
  if (worst >= HISS_RISK_THRESHOLDS.highMinDb) return "high";
  return "severe";
}
