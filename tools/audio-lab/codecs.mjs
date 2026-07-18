// MP5 Audio Quality Lab — codec mode wrappers.
//
// Every mode exposes { id, label, group, encode(samples,ch) -> Uint8Array,
// decode(bytes) -> Int16Array }. PCM is the reference. mp5c2-lab is an
// EXPERIMENTAL, lab-only prototype that is NEVER written to .mp5 files and is
// NOT wired into the public converter — it exists only inside this harness.

const C2_BLOCK_FRAMES = 8192; // per-channel block size for the vNext prototype
const C2_QUIET_PEAK = 0.02; // blocks with peak below this (~-34 dBFS) go lossless

function packPcm16(samples) {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i], true);
  return out;
}

function unpackPcm16(bytes) {
  const n = Math.floor(bytes.length / 2);
  const out = new Int16Array(n);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

/**
 * MP5-C vNext prototype (lab-only): adaptive lossless fallback.
 * Loud blocks use MP5-C (lossy); quiet/silent/reverb-tail blocks fall back to
 * MP5-L (lossless) so the noise floor and reverb tails stay clean. This is the
 * "hybrid lossless fallback for quiet frames" strategy from the milestone.
 */
function encodeMp5c2(codec, samples, channels, preset) {
  const frames = Math.floor(samples.length / channels);
  const parts = [];
  const header = new Uint8Array(8);
  const hv = new DataView(header.buffer);
  header[0] = 0x43; header[1] = 0x32; // 'C','2' lab tag (never a real .mp5 stream)
  header[2] = channels; header[3] = preset;
  hv.setUint32(4, frames, true);
  parts.push(header);

  for (let f = 0; f < frames; f += C2_BLOCK_FRAMES) {
    const fEnd = Math.min(f + C2_BLOCK_FRAMES, frames);
    const blkFrames = fEnd - f;
    const slice = samples.subarray(f * channels, fEnd * channels);
    let peak = 0;
    for (let i = 0; i < slice.length; i++) {
      const a = Math.abs(slice[i]);
      if (a > peak) peak = a;
    }
    const quiet = peak / 32768 < C2_QUIET_PEAK;
    const payload = quiet ? codec.encode_mp5l(slice, channels) : codec.encode_mp5c(slice, channels, preset);
    const head = new Uint8Array(9);
    const hd = new DataView(head.buffer);
    head[0] = quiet ? 0x4c : 0x43; // 'L' lossless block / 'C' lossy block
    hd.setUint32(1, blkFrames, true);
    hd.setUint32(5, payload.length, true);
    parts.push(head, payload instanceof Uint8Array ? payload : new Uint8Array(payload));
  }
  return concat(parts);
}

function decodeMp5c2(codec, bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = bytes[2];
  let pos = 8;
  const chunks = [];
  let total = 0;
  while (pos + 9 <= bytes.length) {
    const tag = bytes[pos];
    const blkFrames = view.getUint32(pos + 1, true);
    const len = view.getUint32(pos + 5, true);
    pos += 9;
    const payload = bytes.subarray(pos, pos + len);
    pos += len;
    const decoded = tag === 0x4c ? codec.decode_mp5l(payload) : codec.decode_mp5c(payload);
    const want = blkFrames * channels;
    const trimmed = decoded.length > want ? decoded.subarray(0, want) : decoded;
    chunks.push(trimmed);
    total += trimmed.length;
  }
  const out = new Int16Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function concat(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ── vNext v2: sub-block + per-band quiet detection ───────────────────────────
//
// The block-level vNext (above) protects whole 8192-frame blocks, so quiet
// moments inside loud blocks stay lossy. v2 decides lossless/lossy per SUB-BLOCK
// (default 1024 frames ≈ 23 ms) and additionally escalates a low-level sub-block
// to lossless when it carries a quiet-but-present high-frequency tail (the kind of
// signal MP5-C turns to hiss) — but NOT when HF is masked by a loud low end.
//
// Container (lab-internal, never a .mp5): magic 0x43 0x33, then per sub-block
//   [tag(1): 'L' broadband-quiet | 'B' band-quiet | 'C' lossy][subFrames u32][len u32][payload]
// Lossy sub-blocks pad to the 2048 MP5-C frame — a size cost we report honestly.

export const VNEXT_PARAMS = {
  subBlockFrames: 1024, // ~23 ms at 44.1 kHz
  // Phase 4.4: protect_scale 1.5 (was 0.02/0.04/0.02/0.06/0.06/8) — real-track hiss risk low
  quietPeak: 0.03, // broadband peak below this → lossless
  fragileRmsMax: 0.06, // only escalate per-band inside low-level sub-blocks
  hfCutoffHz: 3600, // high band for fragile-tail detection (mirrors mp5c bands.rs)
  hfFragileMax: 0.03, // HF peak below this (but above silence) = quiet-but-present tail
  hfPresentMin: 0.0005, // ignore true HF silence
  // hysteresis + lookahead tail protection
  tailRmsMax: 0.09, // low-level threshold to enter a decaying tail
  tailExitPeak: 0.09, // a sub-block peaking above this breaks the tail latch
  lookaheadSubBlocks: 12, // a low-level sub-block whose next N stay quiet = a fade/tail
  // noise-shaped quantization experiment (v0.24, lossy sub-blocks only)
  emphasisA: 0.5, // pre/de-emphasis coefficient (first-order)
  shapeMaxPeak: 0.6, // only shape lossy sub-blocks with headroom (avoid pre-emphasis clipping)
};

// First-order pre-emphasis y[n]=x[n]-a*x[n-1] (per channel, state reset per sub-block).
// Returns null if it would clip (no headroom) so the caller falls back to plain lossy.
function preEmphasize(slice, channels, a) {
  const out = new Int16Array(slice.length);
  for (let c = 0; c < channels; c++) {
    let prev = 0;
    for (let i = c; i < slice.length; i += channels) {
      const x = slice[i];
      const y = x - a * prev;
      if (y > 32767 || y < -32768) return null; // clips → skip shaping
      out[i] = Math.round(y);
      prev = x;
    }
  }
  return out;
}

// Inverse de-emphasis x[n]=y[n]+a*x[n-1] (per channel, state reset per sub-block).
function deEmphasize(slice, channels, a) {
  const out = new Int16Array(slice.length);
  for (let c = 0; c < channels; c++) {
    let prev = 0;
    for (let i = c; i < slice.length; i += channels) {
      const x = slice[i] + a * prev;
      const v = x > 32767 ? 32767 : x < -32768 ? -32768 : x;
      out[i] = Math.round(v);
      prev = v;
    }
  }
  return out;
}

function alphaForCutoff(hz, sr) {
  const x = (2 * Math.PI * hz) / Math.max(8000, sr);
  return Math.min(0.999, Math.max(0.001, 1 - Math.exp(-x)));
}

/** Peak of the high band (signal minus a one-pole lowpass), mono-summed. */
function highBandPeak(samples, channels, alpha) {
  const frames = Math.floor(samples.length / channels);
  let peak = 0;
  for (let c = 0; c < channels; c++) {
    let s = 0;
    for (let i = 0; i < frames; i++) {
      const v = samples[i * channels + c] / 32768;
      s = alpha * v + (1 - alpha) * s;
      const hp = Math.abs(v - s);
      if (hp > peak) peak = hp;
    }
  }
  return peak;
}

function subBlockStats(slice, channels, alpha) {
  let peak = 0, sumSq = 0;
  for (let i = 0; i < slice.length; i++) {
    const v = Math.abs(slice[i]);
    if (v > peak) peak = v;
    const f = slice[i] / 32768;
    sumSq += f * f;
  }
  return {
    peak: peak / 32768,
    rms: Math.sqrt(sumSq / Math.max(1, slice.length)),
    hfPeak: highBandPeak(slice, channels, alpha),
  };
}

/**
 * Sub-block vNext encoder. `opts` (or a legacy boolean = bandQuiet):
 *   bandQuiet  — per-band fragile-HF-tail escalation to lossless.
 *   hysteresis — lookahead + latch so a whole decaying tail/fade stays lossless (v0.24).
 *   shaped     — noise-shaped (pre/de-emphasis) quantization on lossy sub-blocks (v0.24).
 *   coalesce   — merge adjacent lossy sub-blocks into one MP5-C encode (avoids 2048 pad per unit)
 *                and merge adjacent lossless L/B runs into one MP5-L encode.
 */
function encodeMp5c2V2(codec, samples, channels, preset, opts) {
  const o = typeof opts === "boolean" ? { bandQuiet: opts } : opts || {};
  const { bandQuiet = false, hysteresis = false, shaped = false, coalesce = false } = o;
  const P = VNEXT_PARAMS;
  const sb = P.subBlockFrames;
  const frames = Math.floor(samples.length / channels);
  const alpha = alphaForCutoff(P.hfCutoffHz, 44100);

  // pre-compute per-sub-block stats (needed for lookahead)
  const starts = [];
  const stats = [];
  for (let f = 0; f < frames; f += sb) {
    const fEnd = Math.min(f + sb, frames);
    starts.push([f, fEnd]);
    stats.push(subBlockStats(samples.subarray(f * channels, fEnd * channels), channels, alpha));
  }
  const futureMaxPeak = (i) => {
    let m = 0;
    for (let k = i; k < Math.min(stats.length, i + P.lookaheadSubBlocks); k++) m = Math.max(m, stats[k].peak);
    return m;
  };

  const tags = [];
  let inTail = false;
  for (let i = 0; i < starts.length; i++) {
    const st = stats[i];
    if (st.peak >= P.tailExitPeak) inTail = false;
    let tag;
    if (st.peak < P.quietPeak) {
      tag = 0x4c;
      inTail = true;
    } else if (
      bandQuiet &&
      ((st.rms < P.fragileRmsMax && st.hfPeak > P.hfPresentMin && st.hfPeak < P.hfFragileMax) ||
        (hysteresis && st.rms < P.tailRmsMax && futureMaxPeak(i) < P.tailExitPeak) ||
        (hysteresis && inTail && st.peak < P.tailExitPeak))
    ) {
      tag = 0x42;
      inTail = true;
    } else {
      tag = 0x43;
    }
    tags.push(tag);
  }

  const header = new Uint8Array(10);
  const hv = new DataView(header.buffer);
  header[0] = 0x43; header[1] = 0x33; // 'C','3' — lab sub-block container (decoder reads tags)
  header[2] = channels; header[3] = preset;
  hv.setUint16(4, sb, true);
  hv.setUint32(6, frames, true);
  const parts = [header];

  const pushUnit = (tag, n, payload) => {
    const head = new Uint8Array(9);
    const hd = new DataView(head.buffer);
    head[0] = tag;
    hd.setUint32(1, n, true);
    hd.setUint32(5, payload.length, true);
    parts.push(head, payload instanceof Uint8Array ? payload : new Uint8Array(payload));
  };

  let i = 0;
  while (i < starts.length) {
    const tag = tags[i];
    if (coalesce && tag === 0x43 && !shaped) {
      let end = i + 1;
      while (end < starts.length && tags[end] === 0x43) end++;
      const f = starts[i][0];
      const fEnd = starts[end - 1][1];
      const n = fEnd - f;
      const slice = samples.subarray(f * channels, fEnd * channels);
      pushUnit(0x43, n, codec.encode_mp5c(slice, channels, preset));
      i = end;
      continue;
    }
    if (coalesce && (tag === 0x4c || tag === 0x42) && !shaped) {
      let end = i + 1;
      let outTag = tag;
      while (end < starts.length && tags[end] !== 0x43) {
        if (tags[end] === 0x42) outTag = 0x42;
        end++;
      }
      const f = starts[i][0];
      const fEnd = starts[end - 1][1];
      const n = fEnd - f;
      const slice = samples.subarray(f * channels, fEnd * channels);
      pushUnit(outTag, n, codec.encode_mp5l(slice, channels));
      i = end;
      continue;
    }

    const [f, fEnd] = starts[i];
    const n = fEnd - f;
    const slice = samples.subarray(f * channels, fEnd * channels);
    const st = stats[i];
    let outTag = tag;
    let payload;
    if (tag === 0x43) {
      let pre = null;
      if (shaped && st.peak < P.shapeMaxPeak) pre = preEmphasize(slice, channels, P.emphasisA);
      if (pre) {
        outTag = 0x53;
        payload = codec.encode_mp5c(pre, channels, preset);
      } else {
        payload = codec.encode_mp5c(slice, channels, preset);
      }
    } else {
      payload = codec.encode_mp5l(slice, channels);
    }
    pushUnit(outTag, n, payload);
    i++;
  }
  return concat(parts);
}

function decodeMp5c2V2(codec, bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = bytes[2];
  let pos = 10;
  const chunks = [];
  let total = 0;
  while (pos + 9 <= bytes.length) {
    const tag = bytes[pos];
    const n = view.getUint32(pos + 1, true);
    const len = view.getUint32(pos + 5, true);
    pos += 9;
    const payload = bytes.subarray(pos, pos + len);
    pos += len;
    let decoded;
    if (tag === 0x53) decoded = deEmphasize(codec.decode_mp5c(payload), channels, VNEXT_PARAMS.emphasisA);
    else if (tag === 0x43) decoded = codec.decode_mp5c(payload);
    else decoded = codec.decode_mp5l(payload);
    const want = n * channels;
    const trimmed = decoded.length > want ? decoded.subarray(0, want) : decoded;
    chunks.push(trimmed);
    total += trimmed.length;
  }
  const out = new Int16Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** Recover fallback-usage stats from any vNext container (0x32 block, 0x33 JS
 * sub-block, or 0x34 native-Rust sub-block — the last two share a 10-byte header). */
export function vnextFallbackStats(bytes) {
  if (bytes[0] !== 0x43 || (bytes[1] !== 0x32 && bytes[1] !== 0x33 && bytes[1] !== 0x34)) return null;
  const v2 = bytes[1] === 0x33 || bytes[1] === 0x34;
  const channels = bytes[2];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = v2 ? 10 : 8;
  const tally = { unit: v2 ? "sub-block" : "block", units: 0, lossless: 0, bandQuiet: 0, lossy: 0, shaped: 0, samplesLossless: 0, samplesBandQuiet: 0, samplesLossy: 0, samplesShaped: 0 };
  while (pos + 9 <= bytes.length) {
    const tag = bytes[pos];
    const n = view.getUint32(pos + 1, true);
    const len = view.getUint32(pos + 5, true);
    pos += 9 + len;
    tally.units++;
    if (tag === 0x42) { tally.bandQuiet++; tally.samplesBandQuiet += n; }
    else if (tag === 0x4c) { tally.lossless++; tally.samplesLossless += n; }
    else if (tag === 0x53) { tally.shaped++; tally.samplesShaped += n; tally.samplesLossy += n; }
    else { tally.lossy++; tally.samplesLossy += n; }
  }
  const totalSamples = tally.samplesLossless + tally.samplesBandQuiet + tally.samplesLossy;
  const pct = (x) => (totalSamples ? Number(((100 * x) / totalSamples).toFixed(1)) : 0);
  tally.losslessSamplePct = pct(tally.samplesLossless);
  tally.bandQuietSamplePct = pct(tally.samplesBandQuiet);
  tally.lossySamplePct = pct(tally.samplesLossy);
  tally.shapedSamplePct = pct(tally.samplesShaped);
  tally.protectedSamplePct = pct(tally.samplesLossless + tally.samplesBandQuiet);
  return tally;
}

/** Build the codec mode table for a loaded WASM codec. */
export function buildModes(codec) {
  return [
    {
      id: "pcm",
      label: "PCM (reference / debug)",
      group: "reference",
      encode: (s) => packPcm16(s),
      decode: (b) => unpackPcm16(b),
    },
    {
      id: "mp5l",
      label: "MP5-L v3 (lossless · default)",
      group: "lossless",
      encode: (s, ch) => codec.encode_mp5l(s, ch),
      decode: (b) => codec.decode_mp5l(b),
    },
    {
      id: "mp5c-standard",
      label: "MP5-C Standard (lossy · lab)",
      group: "lossy",
      encode: (s, ch) => codec.encode_mp5c(s, ch, 1),
      decode: (b) => codec.decode_mp5c(b),
    },
    {
      id: "mp5c-high",
      label: "MP5-C High (lossy · lab)",
      group: "lossy",
      encode: (s, ch) => codec.encode_mp5c(s, ch, 2),
      decode: (b) => codec.decode_mp5c(b),
    },
    {
      id: "mp5c-extreme",
      label: "MP5-C Extreme (lossy · lab)",
      group: "lossy",
      encode: (s, ch) => codec.encode_mp5c(s, ch, 3),
      decode: (b) => codec.decode_mp5c(b),
    },
    {
      id: "mp5h-high",
      label: "MP5-H High + CORR (hybrid)",
      group: "hybrid",
      encode: (s, ch) => codec.encode_mp5h(s, ch, 2),
      decode: (b) => codec.decode_mp5h(b, true),
    },
    {
      id: "mp5h-extreme",
      label: "MP5-H Extreme + CORR (hybrid)",
      group: "hybrid",
      encode: (s, ch) => codec.encode_mp5h(s, ch, 3),
      decode: (b) => codec.decode_mp5h(b, true),
    },
    {
      // vNext High: lossless quiet/silent blocks + MP5-C High loud blocks.
      id: "mp5c2-lab",
      label: "MP5-C vNext High (lab prototype · default OFF)",
      group: "prototype",
      prototype: true,
      encode: (s, ch) => encodeMp5c2(codec, s, ch, 2),
      decode: (b) => decodeMp5c2(codec, b),
    },
    {
      // vNext Extreme: lossless quiet/silent blocks + MP5-C Extreme loud blocks.
      // The preset only selects the lossy fallback used on loud blocks; quiet and
      // silent blocks are always lossless regardless of preset.
      id: "mp5c2-extreme",
      label: "MP5-C vNext Extreme (lab prototype · default OFF)",
      group: "prototype",
      prototype: true,
      encode: (s, ch) => encodeMp5c2(codec, s, ch, 3),
      decode: (b) => decodeMp5c2(codec, b),
    },
    {
      // vNext sub-block (High): per-1024-frame lossless/lossy decision. No per-band.
      id: "mp5c2-subblock",
      label: "MP5-C vNext sub-block High (lab prototype · default OFF)",
      group: "prototype",
      prototype: true,
      encode: (s, ch) => encodeMp5c2V2(codec, s, ch, 2, false),
      decode: (b) => decodeMp5c2V2(codec, b),
    },
    {
      // vNext sub-block + per-band (High): also escalates low-level sub-blocks with
      // a quiet-but-present HF tail to lossless. Best High prototype.
      id: "mp5c2-bandquiet",
      label: "MP5-C vNext sub-block+band High (lab prototype · default OFF)",
      group: "prototype",
      prototype: true,
      encode: (s, ch) => encodeMp5c2V2(codec, s, ch, 2, true),
      decode: (b) => decodeMp5c2V2(codec, b),
    },
    {
      // vNext sub-block + per-band (Extreme): best Extreme prototype.
      id: "mp5c2-bandquiet-extreme",
      label: "MP5-C vNext sub-block+band Extreme (lab prototype · default OFF)",
      group: "prototype",
      prototype: true,
      encode: (s, ch) => encodeMp5c2V2(codec, s, ch, 3, true),
      decode: (b) => decodeMp5c2V2(codec, b),
    },
    {
      // vNext + hysteresis/lookahead tail latch (High): protects whole fades/tails.
      // Coalesces adjacent lossy sub-blocks to avoid per-unit 2048-frame pad.
      id: "mp5c2-smooth",
      label: "MP5-C vNext smooth High (sub-block+band+hysteresis+coalesce · lab · default OFF)",
      group: "prototype",
      prototype: true,
      encode: (s, ch) =>
        encodeMp5c2V2(codec, s, ch, 2, { bandQuiet: true, hysteresis: true, coalesce: true }),
      decode: (b) => decodeMp5c2V2(codec, b),
    },
    {
      // vNext + hysteresis/lookahead (Extreme): best quality prototype + coalesce.
      id: "mp5c2-smooth-extreme",
      label: "MP5-C vNext smooth Extreme (sub-block+band+hysteresis+coalesce · lab · default OFF)",
      group: "prototype",
      prototype: true,
      encode: (s, ch) =>
        encodeMp5c2V2(codec, s, ch, 3, { bandQuiet: true, hysteresis: true, coalesce: true }),
      decode: (b) => decodeMp5c2V2(codec, b),
    },
    {
      // Baseline smooth WITHOUT coalesce (kept for size A/B vs coalesced).
      id: "mp5c2-smooth-nocoalesce-extreme",
      label: "MP5-C vNext smooth Extreme no-coalesce (lab baseline · default OFF)",
      group: "prototype",
      prototype: true,
      encode: (s, ch) =>
        encodeMp5c2V2(codec, s, ch, 3, { bandQuiet: true, hysteresis: true, coalesce: false }),
      decode: (b) => decodeMp5c2V2(codec, b),
    },
    {
      // vNext + noise-shaped (pre/de-emphasis) lossy sub-blocks (Extreme): experiment.
      id: "mp5c2-shaped-extreme",
      label: "MP5-C vNext shaped Extreme (sub-block+band+noise-shaping · lab · default OFF)",
      group: "prototype",
      prototype: true,
      encode: (s, ch) => encodeMp5c2V2(codec, s, ch, 3, { bandQuiet: true, shaped: true }),
      decode: (b) => decodeMp5c2V2(codec, b),
    },
    // Native Rust port of the "smooth" winner (encode_mp5c_vnext/decode_mp5c_vnext).
    // Present only when the rebuilt WASM exposes it; same algorithm, native speed.
    ...(typeof codec.encode_mp5c_vnext === "function"
      ? [
          {
            id: "mp5c2-native-high",
            label: "MP5-C vNext native High (Rust smooth+coalesce · preferred size preset · lab · default OFF)",
            group: "prototype",
            prototype: true,
            native: true,
            encode: (s, ch) => codec.encode_mp5c_vnext(s, ch, 2),
            decode: (b) => codec.decode_mp5c_vnext(b),
          },
          {
            id: "mp5c2-native-extreme",
            label: "MP5-C vNext native Extreme (Rust sub-block+band+hysteresis+coalesce · lab · default OFF)",
            group: "prototype",
            prototype: true,
            native: true,
            encode: (s, ch) => codec.encode_mp5c_vnext(s, ch, 3),
            decode: (b) => codec.decode_mp5c_vnext(b),
          },
          ...(typeof codec.encode_mp5c_vnext_mdct === "function"
            ? [
                {
                  id: "mp5c2-native-mdct-high",
                  label: "MP5-C vNext native MDCT High (mp5c3 loud path · lab · default OFF)",
                  group: "prototype",
                  prototype: true,
                  native: true,
                  encode: (s, ch) => codec.encode_mp5c_vnext_mdct(s, ch, 2),
                  decode: (b) => codec.decode_mp5c_vnext(b),
                },
              ]
            : []),
        ]
      : []),
    // MP5-C3 MDCT loud-path spike (lab-only). Present when WASM exports encode_mp5c3.
    ...(typeof codec.encode_mp5c3 === "function"
      ? [
          {
            id: "mp5c3-mdct-high",
            label: "MP5-C3 MDCT High (signal-relative band quant · lab spike · default OFF)",
            group: "prototype",
            prototype: true,
            native: true,
            encode: (s, ch) => codec.encode_mp5c3(s, ch, 2),
            decode: (b) => codec.decode_mp5c3(b),
          },
          {
            id: "mp5c3-mdct-extreme",
            label: "MP5-C3 MDCT Extreme (signal-relative band quant · lab spike · default OFF)",
            group: "prototype",
            prototype: true,
            native: true,
            encode: (s, ch) => codec.encode_mp5c3(s, ch, 3),
            decode: (b) => codec.decode_mp5c3(b),
          },
        ]
      : []),
  ];
}

export function modesForGroup(modes, group) {
  if (group === "mp5l") return modes.filter((m) => m.id === "pcm" || m.id === "mp5l");
  if (group === "mp5c")
    return modes.filter((m) => m.id === "pcm" || m.group === "lossy" || m.group === "prototype");
  if (group === "mp5c-vnext")
    return modes.filter((m) => m.id === "pcm" || m.id === "mp5c-high" || m.id === "mp5c-extreme" || m.group === "prototype");
  if (group === "mp5h") return modes.filter((m) => m.id === "pcm" || m.id === "mp5l" || m.group === "hybrid");
  return modes;
}
