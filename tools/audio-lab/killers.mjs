// Deterministic synthetic torture fixtures for MP5 lossy / protect paths.
// Seeded LCGs only — no disk audio, no copyrighted material.
//
//   import { allKillers, killerByName } from "./killers.mjs";

const SR = 44100;
const TAU = Math.PI * 2;

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function clampI16(x) {
  if (x > 32767) return 32767;
  if (x < -32768) return -32768;
  return x | 0;
}

function stereo(frames, fn) {
  const s = new Int16Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const [l, r] = fn(i);
    s[i * 2] = clampI16(Math.round(l));
    s[i * 2 + 1] = clampI16(Math.round(r));
  }
  return s;
}

function fixture(name, category, samples, note = "", seed = 0) {
  return { name, category, samples, channels: 2, sampleRate: SR, note, seed };
}

/** Castanet-like sharp wooden attacks (pre-echo stress). */
function castanets() {
  const rng = lcg(0xca57a001);
  const dur = 3;
  return fixture(
    "killer_castanets",
    "transient",
    stereo(SR * dur, (i) => {
      const t = i / SR;
      const hits = [0.15, 0.55, 0.95, 1.4, 1.85, 2.3, 2.7];
      let v = 0;
      for (const h of hits) {
        const dt = t - h;
        if (dt >= 0 && dt < 0.04) {
          const env = Math.exp(-dt * 180);
          v += env * Math.sin(TAU * 2200 * dt) * 22000;
          v += env * (rng() * 2 - 1) * 8000;
        }
      }
      return [v, v * 0.92];
    }),
    "sharp wooden attacks / pre-echo",
    0xca57a001,
  );
}

/** Glockenspiel-like metallic partials. */
function glockenspiel() {
  const dur = 4;
  const notes = [1568, 1865, 2093, 2489, 2794];
  return fixture(
    "killer_glockenspiel",
    "tonal-hf",
    stereo(SR * dur, (i) => {
      const t = i / SR;
      const idx = Math.min(notes.length - 1, Math.floor(t));
      const local = t - idx;
      const f = notes[idx];
      const env = Math.exp(-local * 2.2);
      let v = 0;
      for (let h = 1; h <= 6; h++) {
        v += (env * Math.sin(TAU * f * h * local) * 9000) / h;
      }
      return [v, v * 0.85];
    }),
    "metallic HF partials",
    0x61c001,
  );
}

/** Harpsichord-like bright plucked partials. */
function harpsichord() {
  const rng = lcg(0x1a99510d);
  const dur = 4;
  return fixture(
    "killer_harpsichord",
    "tonal-hf",
    stereo(SR * dur, (i) => {
      const t = i / SR;
      const noteT = t % 0.5;
      const f = 440 * Math.pow(2, (Math.floor(t / 0.5) % 8) / 12);
      const env = Math.exp(-noteT * 8) * (noteT < 0.002 ? noteT / 0.002 : 1);
      let v = 0;
      for (let h = 1; h <= 12; h++) {
        v += (env * Math.sin(TAU * f * h * noteT) * 6000) / Math.sqrt(h);
      }
      v += (rng() * 2 - 1) * env * 400;
      return [v * 0.9, v];
    }),
    "bright plucked partials",
    0x1a99510d,
  );
}

/** Applause / dense transient noise field. */
function applause() {
  const rng = lcg(0xa991a05e);
  const dur = 3;
  return fixture(
    "killer_applause",
    "noise-dense",
    stereo(SR * dur, (i) => {
      const t = i / SR;
      const dens = 0.55 + 0.35 * Math.sin(TAU * 0.7 * t);
      const crack = rng() < dens * 0.08 ? (rng() * 2 - 1) * 18000 : 0;
      const wash = (rng() * 2 - 1) * 4000 * dens;
      const l = crack + wash;
      const r = crack * 0.7 + (rng() * 2 - 1) * 4000 * dens;
      return [l, r];
    }),
    "dense uncorrelated claps",
    0xa991a05e,
  );
}

/** Hard-panned left/right alternating bursts. */
function hardPan() {
  const dur = 3;
  return fixture(
    "killer_hard_pan",
    "stereo",
    stereo(SR * dur, (i) => {
      const t = i / SR;
      const left = Math.floor(t * 2) % 2 === 0;
      const env = Math.sin(TAU * 4 * t);
      const tone = Math.sin(TAU * 880 * t) * 16000 * Math.abs(env);
      return left ? [tone, 0] : [0, tone];
    }),
    "hard L/R alternation",
    0x1a9d9a00,
  );
}

/** Near anti-phase stereo (M/S / joint-stereo stress). */
function antiPhase() {
  const dur = 3;
  return fixture(
    "killer_anti_phase",
    "stereo",
    stereo(SR * dur, (i) => {
      const t = i / SR;
      const v = Math.sin(TAU * 330 * t) * 12000 + Math.sin(TAU * 990 * t) * 4000;
      return [v, -v * 0.98];
    }),
    "near anti-phase stereo",
    0xa071fa5e,
  );
}

/** Sparse HF tones that lossy coders often warble ("birdies"). */
function birdies() {
  const dur = 4;
  const freqs = [11200, 13100, 15200, 16800];
  return fixture(
    "killer_birdies",
    "sparse-hf",
    stereo(SR * dur, (i) => {
      const t = i / SR;
      let v = 0;
      for (let k = 0; k < freqs.length; k++) {
        const gate = Math.sin(TAU * (0.4 + k * 0.11) * t) > 0.3 ? 1 : 0;
        v += gate * Math.sin(TAU * freqs[k] * t) * 3500;
      }
      return [v, v * 0.97];
    }),
    "sparse HF tones / birdie risk",
    0xb19d1e50,
  );
}

/**
 * Oscillate across the quiet/loud protect boundary so unit tagging flips
 * repeatedly (protect-threshold alternation).
 */
function protectThresholdAlt() {
  const dur = 4;
  return fixture(
    "killer_protect_threshold_alt",
    "protect-boundary",
    stereo(SR * dur, (i) => {
      const t = i / SR;
      const loud = Math.floor(t / 0.2) % 2 === 0;
      const amp = loud ? 0.5 * 32767 : 0.008 * 32767;
      const v = Math.sin(TAU * 440 * t) * amp;
      const noise = loud ? 0 : Math.sin(TAU * 6000 * t) * amp * 0.3;
      return [v + noise, v * 0.95 + noise];
    }),
    "quiet/loud alternation across protect threshold",
    0x9707ec7,
  );
}

/** All killer fixtures (deterministic). */
export function allKillers() {
  return [
    castanets(),
    glockenspiel(),
    harpsichord(),
    applause(),
    hardPan(),
    antiPhase(),
    birdies(),
    protectThresholdAlt(),
  ];
}

export function killerByName(name) {
  const k = allKillers().find((f) => f.name === name);
  if (!k) throw new Error("unknown killer fixture: " + name);
  return k;
}

export { SR as KILLER_SR };