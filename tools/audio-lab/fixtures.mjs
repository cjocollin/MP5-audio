// MP5 Audio Quality Lab — synthetic fixture generator.
// All fixtures are generated deterministically; nothing is read from disk and
// no copyrighted audio is ever used. Each fixture is stereo i16 at 44.1 kHz
// unless noted. Categories mirror docs/MP5_AUDIO_QUALITY_LAB.md.

const SR = 44100;
const TAU = Math.PI * 2;

// Deterministic LCG so noise fixtures are reproducible across runs/machines.
function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff; // [0,1)
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

function fixture(name, category, samples, note = "") {
  return { name, category, samples, channels: 2, sampleRate: SR, note };
}

// ── individual generators ───────────────────────────────────────────────────

function silence() {
  return fixture("silence", "silence", new Int16Array(SR * 2 * 2), "2s digital silence");
}

function quietSine() {
  // ~-40 dBFS — the canonical hiss exposure case.
  const amp = 0.01 * 32767;
  return fixture(
    "quiet_sine",
    "tonal",
    stereo(SR * 2, (i) => {
      const v = Math.sin((TAU * 440 * i) / SR) * amp;
      return [v, v];
    }),
    "2s 440Hz at -40 dBFS",
  );
}

function loudSine() {
  const amp = 0.95 * 32767;
  return fixture(
    "loud_sine",
    "tonal",
    stereo(SR * 2, (i) => [
      Math.sin((TAU * 440 * i) / SR) * amp,
      Math.cos((TAU * 330 * i) / SR) * amp,
    ]),
    "2s near-full-scale tones",
  );
}

function sweptSine() {
  // Log sweep 50Hz → 18kHz over 3s.
  const f0 = 50, f1 = 18000, dur = 3;
  const k = Math.log(f1 / f0) / dur;
  const amp = 0.6 * 32767;
  return fixture(
    "swept_sine",
    "tonal",
    stereo(SR * dur, (i) => {
      const t = i / SR;
      const phase = (TAU * f0 * (Math.exp(k * t) - 1)) / k;
      const v = Math.sin(phase) * amp;
      return [v, v];
    }),
    "50Hz→18kHz log sweep",
  );
}

function pinkNoise() {
  const rng = lcg(0x9e3779b1);
  let b0 = 0, b1 = 0, b2 = 0;
  return fixture(
    "pink_noise",
    "noise",
    stereo(SR * 2, () => {
      const w = rng() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      const p = (b0 + b1 + b2 + w * 0.1848) * 0.35 * 32767;
      return [p, p * 0.98];
    }),
    "2s pink noise",
  );
}

function whiteNoise() {
  const rng = lcg(0x12345678);
  const amp = 0.4 * 32767;
  return fixture(
    "white_noise",
    "noise",
    stereo(SR * 2, () => [(rng() * 2 - 1) * amp, (rng() * 2 - 1) * amp]),
    "2s white noise (decorrelated)",
  );
}

function impulse() {
  const s = new Int16Array(SR * 1 * 2);
  s[SR * 2] = 32767; // single full-scale impulse at t=0.5s, otherwise silence
  s[SR * 2 + 1] = 32767;
  return fixture("impulse", "transient", s, "single full-scale impulse in silence");
}

function kickSnare() {
  return fixture(
    "kick_snare",
    "transient",
    stereo(SR * 4, (i) => {
      const t = i / SR;
      const beat = Math.floor(t * 2);
      const env = Math.max(0, 1 - (t * 2 - beat));
      const kick = Math.pow(env, 3) * Math.sin(t * 80) * 28000;
      const snare = beat % 2 === 1 ? Math.sin(t * 1800) * env * 9000 : 0;
      const v = kick + snare;
      return [v, v];
    }),
    "4s kick/snare-like transients",
  );
}

function bassLoop() {
  return fixture(
    "bass_loop",
    "musical",
    stereo(SR * 4, (i) => {
      const t = i / SR;
      const note = [55, 55, 73.42, 65.41][Math.floor(t) % 4];
      const env = 0.5 + 0.5 * Math.sin(TAU * 2 * t);
      const v = (Math.sin(TAU * note * t) + 0.3 * Math.sin(TAU * note * 2 * t)) * env * 16000;
      return [v, v];
    }),
    "4s bass-heavy loop",
  );
}

function vocalLike() {
  return fixture(
    "vocal_like",
    "musical",
    stereo(SR * 4, (i) => {
      const t = i / SR;
      const f0 = 220 + 30 * Math.sin(t * 3);
      let v = 0;
      for (let h = 1; h <= 6; h++) v += Math.sin(TAU * f0 * h * t) / h;
      const formant = Math.sin(t * 2500) * 0.15;
      const amp = 0.4 + 0.4 * Math.max(0, Math.sin(t * 2.5));
      const s = (v + formant) * amp * 9000;
      return [s, s * 0.92];
    }),
    "4s vocal-like harmonic signal",
  );
}

function stereoWidth() {
  const rng = lcg(0xcafebabe);
  return fixture(
    "stereo_width",
    "spatial",
    stereo(SR * 2, (i) => {
      const t = i / SR;
      const carrier = Math.sin(TAU * 300 * t) * 12000;
      const wob = Math.sin(TAU * 3 * t) * 8000;
      const noise = (rng() * 2 - 1) * 2000;
      return [carrier + wob + noise, carrier - wob - noise];
    }),
    "2s wide/decorrelated stereo",
  );
}

function reverbTail() {
  // A burst that decays into near-silence — the canonical reverb-tail hiss test.
  const rng = lcg(0x5eed1234);
  return fixture(
    "reverb_tail",
    "decay",
    stereo(SR * 3, (i) => {
      const t = i / SR;
      let body = 0;
      for (let h = 1; h <= 5; h++) body += Math.sin(TAU * 220 * h * t) / h;
      const tail = Math.exp(-t * 3.0); // long exponential decay toward silence
      const diffuse = (rng() * 2 - 1) * 0.15;
      const v = (body + diffuse) * tail * 14000;
      return [v, v * 0.96];
    }),
    "3s reverb-tail decay to near-silence",
  );
}

function denseMusic() {
  const rng = lcg(0xabcd1234);
  return fixture(
    "dense_music",
    "musical",
    stereo(SR * 6, (i) => {
      const t = i / SR;
      const kickEnv = Math.pow(Math.max(0, 1 - (t * 2 - Math.floor(t * 2))), 3);
      const kick = kickEnv * Math.sin(t * 70) * 14000;
      const bass = Math.sin(TAU * 110 * t) * 10000;
      const lead = Math.sin(TAU * 440 * t) * 5000;
      const pad = Math.sin(TAU * 277 * t) * 3500;
      const hat = (rng() * 2 - 1) * 1500 * (Math.floor(t * 8) % 2);
      const l = kick + bass + lead + pad + hat;
      const r = kick + bass + lead * 0.9 + pad * 1.1 - hat;
      return [l, r];
    }),
    "6s dense music-like loop",
  );
}

/** Full synthetic fixture set used by the lab. */
export function allFixtures() {
  return [
    silence(),
    quietSine(),
    loudSine(),
    sweptSine(),
    pinkNoise(),
    whiteNoise(),
    impulse(),
    kickSnare(),
    bassLoop(),
    vocalLike(),
    stereoWidth(),
    reverbTail(),
    denseMusic(),
  ];
}

/** Curated, short subset for listening exports (keeps WAV output small). */
export function listeningFixtures() {
  return allFixtures().filter((f) =>
    ["silence", "quiet_sine", "reverb_tail", "vocal_like", "dense_music"].includes(f.name),
  );
}

export { SR };
