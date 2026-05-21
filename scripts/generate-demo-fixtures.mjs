#!/usr/bin/env node
/**
 * Generate small synthetic demo fixtures (no copyrighted audio).
 * Requires: pnpm --filter @mp5/container build && pnpm wasm:build
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test-fixtures");
mkdirSync(outDir, { recursive: true });

const {
  CodecId,
  writeMp5,
  buildStemOptionalChunks,
  encodeLyrc,
  encodeSect,
  encodeHook,
  encodeHilt,
  encodeVisu,
} = await import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);

const wasmDir = join(root, "apps/web/src/wasm/pkg");
const mod = await import(pathToFileURL(join(wasmDir, "mp5_codec.js")).href);
await mod.default(readFileSync(join(wasmDir, "mp5_codec_bg.wasm")));

const sampleRate = 44100;
const channels = 1;
const durationSec = 2.0;
const n = Math.floor(sampleRate * durationSec);

function synthTone() {
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = Math.round(
      Math.sin((i * 440 * 2 * Math.PI) / sampleRate) * 8000,
    );
  }
  return samples;
}

function peaksFromSamples(samples, ch) {
  const frames = samples.length / ch;
  const peaks = [];
  const step = Math.max(1, Math.floor(frames / 128));
  for (let i = 0; i < frames; i += step) {
    let max = 0;
    for (let c = 0; c < ch; c++) {
      max = Math.max(max, Math.abs(samples[i * ch + c] ?? 0));
    }
    peaks.push(max / 32768);
  }
  return peaks;
}

const samples = synthTone();
const peaks = peaksFromSamples(samples, channels);
const totalSamples = BigInt(n);

const pcmBytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
const pcmMp5 = writeMp5({
  head: {
    codecId: CodecId.PCM,
    channels,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate,
    totalSamples,
    encoderVersion: 1,
  },
  meta: [
    { key: "title", value: "Demo tone (PCM reference)" },
    { key: "artist", value: "MP5 Alpha Demo" },
  ],
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: pcmBytes }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaks,
  info: [{ key: "encoder", value: "PCM (reference / debug · uncompressed)" }],
});

const mp5lBitstream = mod.encode_mp5l(samples, channels);
if (mp5lBitstream[0] !== 0x4c || mp5lBitstream[1] !== 3) {
  throw new Error(`Expected MP5-L v3, got ${mp5lBitstream[0]} ${mp5lBitstream[1]}`);
}
const mp5lMp5 = writeMp5({
  head: {
    codecId: CodecId.MP5L,
    channels,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate,
    totalSamples,
    encoderVersion: 1,
  },
  meta: [
    { key: "title", value: "Demo tone (MP5-L v3)" },
    { key: "artist", value: "MP5 Alpha Demo" },
  ],
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: mp5lBitstream }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaks,
  info: [{ key: "encoder", value: "MP5-L WASM v3 (lossless · bit-exact)" }],
});

const mp5cBitstream = mod.encode_mp5c(samples, channels, 2);
const mp5cMp5 = writeMp5({
  head: {
    codecId: CodecId.MP5C,
    channels,
    bitsPerSample: 16,
    presetId: 2,
    sampleRate,
    totalSamples,
    encoderVersion: 1,
  },
  meta: [
    { key: "title", value: "Demo tone (MP5-C lab)" },
    { key: "artist", value: "MP5 Alpha Demo" },
  ],
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: mp5cBitstream }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaks,
  info: [{ key: "encoder", value: "MP5-C WASM v5.1 (experimental / lab · may hiss)" }],
});

/** Synthetic stems: drums (pulses), bass (low sine), melody (440 Hz) — summed for full mix. */
function synthDrums(n, sampleRate) {
  const out = new Int16Array(n);
  const beat = Math.floor(sampleRate * 0.5);
  for (let i = 0; i < n; i++) {
    const inBeat = i % beat < Math.floor(sampleRate * 0.05);
    const t = i / sampleRate;
    const env = inBeat ? 1 : 0.15;
    out[i] = Math.round(Math.sin(t * 120 * 2 * Math.PI) * 6000 * env);
  }
  return out;
}

function synthSine(n, sampleRate, hz, amp) {
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.round(Math.sin((i * hz * 2 * Math.PI) / sampleRate) * amp);
  }
  return out;
}

function mixStems(...parts) {
  const n = parts[0].length;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const p of parts) s += p[i] ?? 0;
    out[i] = Math.max(-32768, Math.min(32767, s));
  }
  return out;
}

const stemDurationSec = 1.5;
const stemN = Math.floor(sampleRate * stemDurationSec);
const stemTotal = BigInt(stemN);

const drumsPcm = synthDrums(stemN, sampleRate);
const bassPcm = synthSine(stemN, sampleRate, 55, 5000);
const melodyPcm = synthSine(stemN, sampleRate, 440, 3500);
const mixPcm = mixStems(drumsPcm, bassPcm, melodyPcm);
const stemPeaks = peaksFromSamples(mixPcm, channels);

function encodeStemFrame(samples) {
  return mod.encode_mp5l(samples, channels);
}

const instrumentalPcm = mixStems(drumsPcm, bassPcm);

const demoSections = encodeSect({
  version: 1,
  source: "demo",
  sections: [
    { sectionId: "sect-1", type: "intro", startMs: 0, endMs: 300, title: "Opening", source: "user" },
    { sectionId: "sect-2", type: "verse", startMs: 300, endMs: 600, title: "Verse 1", source: "user" },
    { sectionId: "sect-3", type: "chorus", startMs: 600, endMs: 900, title: "First chorus", source: "user" },
    { sectionId: "sect-4", type: "hook", startMs: 900, endMs: 1200, title: "Main hook", source: "user" },
    { sectionId: "sect-5", type: "outro", startMs: 1200, endMs: 1500, title: "Closing", source: "user" },
  ],
});

const demoHook = encodeHook({
  sectionId: "sect-4",
  startMs: 900,
  endMs: 1200,
  label: "Main hook",
});

const demoHilt = encodeHilt({
  source: "demo",
  highlights: [
    { startMs: 300, endMs: 600, label: "Verse preview", useCase: "preview" },
    { startMs: 600, endMs: 900, label: "Chorus peak", useCase: "emotional_peak" },
    { startMs: 900, endMs: 1200, label: "Hook share clip", useCase: "share" },
  ],
});

const demoVisu = encodeVisu({
  themeName: "Calm demo",
  primaryColor: "#6366f1",
  accentColor: "#8b5cf6",
  backgroundColor: "#1e1b4b",
  moodLabel: "calm",
  visualIntensity: "low",
  playerStyle: "calm",
  source: "app",
});

const demoSyncedLyrics = encodeLyrc({
  source: "demo",
  unsynced: "MP5 demo starts\nVerse and chorus flow\nHook then outro",
  synced: [
    { timeMs: 0, text: "MP5 demo starts", section: "Intro" },
    { timeMs: 300, text: "Verse and chorus flow", section: "Verse" },
    { timeMs: 600, text: "First chorus rises", section: "Chorus" },
    { timeMs: 900, text: "Main hook plays", section: "Hook" },
    { timeMs: 1200, text: "Smart audio, playing clean", section: "Outro" },
  ],
});

const stemBundles = [
  { id: "stem-drums", name: "Demo Drums", type: "drums", pcm: drumsPcm },
  { id: "stem-bass", name: "Demo Bass", type: "bass", pcm: bassPcm },
  { id: "stem-vocals", name: "Demo Vocals", type: "lead_vocals", pcm: melodyPcm },
  {
    id: "stem-instrumental",
    name: "Demo Instrumental",
    type: "instrumental",
    pcm: instrumentalPcm,
  },
].map((s) => ({
  stemId: s.id,
  stemName: s.name,
  stemType: s.type,
  codecId: CodecId.MP5L,
  sampleRate,
  channels,
  durationSamples: stemN,
  frameData: encodeStemFrame(s.pcm),
  defaultVolume: 1,
}));

const { optional: stemOptional } = buildStemOptionalChunks(stemBundles);
const mixBitstream = mod.encode_mp5l(mixPcm, channels);
const stemsMp5 = writeMp5({
  head: {
    codecId: CodecId.MP5L,
    channels,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate,
    totalSamples: stemTotal,
    encoderVersion: 1,
  },
  meta: [
    { key: "title", value: "Demo song map (MP5-L v3)" },
    { key: "artist", value: "MP5 Alpha Demo" },
    { key: "genre", value: "Synthetic demo" },
  ],
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: mixBitstream }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: stemPeaks,
  info: [
    {
      key: "encoder",
      value: "MP5-L WASM v3 + STEM/STDA + LYRC + SECT/HOOK/HILT/VISU (synthetic)",
    },
  ],
  optional: new Map([
    ...stemOptional.entries(),
    ["LYRC", demoSyncedLyrics],
    ["SECT", demoSections],
    ["HOOK", demoHook],
    ["HILT", demoHilt],
    ["VISU", demoVisu],
  ]),
});

const files = [
  ["demo_pcm_reference_tone.mp5", pcmMp5],
  ["demo_mp5l_v3_tone.mp5", mp5lMp5],
  ["demo_mp5c_lab_tone.mp5", mp5cMp5],
  ["demo_mp5l_v3_stems.mp5", stemsMp5],
  ["validation_pcm_slice.mp5", pcmMp5],
  ["validation_mp5l_v3.mp5", mp5lMp5],
];

for (const [name, buf] of files) {
  const path = join(outDir, name);
  writeFileSync(path, buf);
  console.log(`Wrote ${path} (${buf.length} bytes)`);
}

console.log(
  "\nDemo fixtures ready — demo_mp5l_v3_stems.mp5 (stems + LYRC + SECT/HOOK/HILT/VISU), no copyrighted material.",
);
