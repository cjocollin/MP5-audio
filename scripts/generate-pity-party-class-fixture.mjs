#!/usr/bin/env node
/**
 * Synthetic "Pity Party class" regression fixture — no copyrighted audio.
 * - MP5-L full mix + STDF v1 segmented stems (forced small fragment target)
 * - 10 stems, NO instrumental (karaoke uses mute-vocals path)
 * - lead_vocals + background_vocals
 * - synced lyrics, sections, VISU
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
  setStdfFragmentPayloadTargetForTests,
  resetStdfFragmentPayloadTarget,
  setStdaSafeMaxBytesForTests,
  resetStdaSafeMaxBytesForTests,
} = await import(pathToFileURL(join(root, "packages/mp5-container/dist/index.js")).href);

const wasmDir = join(root, "apps/web/src/wasm/pkg");
const mod = await import(pathToFileURL(join(wasmDir, "mp5_codec.js")).href);
await mod.default(readFileSync(join(wasmDir, "mp5_codec_bg.wasm")));

const sampleRate = 44100;
const channels = 2;
const durationSec = 12;
const frames = Math.floor(sampleRate * durationSec);

function peaksFromInterleaved(samples, ch) {
  const frameCount = samples.length / ch;
  const peaks = [];
  const step = Math.max(1, Math.floor(frameCount / 128));
  for (let i = 0; i < frameCount; i += step) {
    let max = 0;
    for (let c = 0; c < ch; c++) {
      max = Math.max(max, Math.abs(samples[i * ch + c] ?? 0));
    }
    peaks.push(max / 32768);
  }
  return peaks;
}

function interleave(channels) {
  const n = channels[0].length;
  const out = new Int16Array(n * channels.length);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < channels.length; c++) {
      out[i * channels.length + c] = channels[c][i] ?? 0;
    }
  }
  return out;
}

function synthDrums(frameCount, sr) {
  const out = new Int16Array(frameCount * 2);
  const beat = Math.floor(sr * 0.45);
  for (let i = 0; i < frameCount; i++) {
    const hit = i % beat < Math.floor(sr * 0.04);
    const t = i / sr;
    const env = hit ? 1 : 0.12;
    const l = Math.sin(t * 90 * 2 * Math.PI) * 5000 * env;
    const r = Math.sin(t * 130 * 2 * Math.PI) * 4200 * env;
    out[i * 2] = Math.round(l);
    out[i * 2 + 1] = Math.round(r);
  }
  return out;
}

function synthTone(frameCount, sr, hz, amp, pan = 0) {
  const out = new Int16Array(frameCount * 2);
  for (let i = 0; i < frameCount; i++) {
    const s = Math.sin((i * hz * 2 * Math.PI) / sr) * amp;
    const l = Math.round(s * (1 - pan));
    const r = Math.round(s * (1 + pan));
    out[i * 2] = l;
    out[i * 2 + 1] = r;
  }
  return out;
}

function mix(...parts) {
  const n = parts[0].length;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const p of parts) s += p[i] ?? 0;
    out[i] = Math.max(-32768, Math.min(32767, s));
  }
  return out;
}

const drums = synthDrums(frames, sampleRate);
const bass = synthTone(frames, sampleRate, 55, 4200, -0.2);
const guitar = synthTone(frames, sampleRate, 196, 2800, 0.15);
const piano = synthTone(frames, sampleRate, 262, 2200, 0);
const synths = synthTone(frames, sampleRate, 330, 1800, 0.25);
const strings = synthTone(frames, sampleRate, 440, 1600, -0.1);
const percussion = synthDrums(frames, sampleRate);
const effects = synthTone(frames, sampleRate, 880, 900, 0.3);
const leadVocals = synthTone(frames, sampleRate, 523, 3200, 0);
const bgVocals = synthTone(frames, sampleRate, 392, 2400, 0.1);

const fullMix = mix(drums, bass, guitar, piano, synths, strings, percussion, effects, leadVocals, bgVocals);
const backingOnly = mix(drums, bass, guitar, piano, synths, strings, percussion, effects);

function encodeStemFrame(samples) {
  return mod.encode_mp5l(samples, channels);
}

const stemDefs = [
  { id: "pp-drums", name: "Drums", type: "drums", pcm: drums },
  { id: "pp-bass", name: "Bass", type: "bass", pcm: bass },
  { id: "pp-guitar", name: "Guitar", type: "guitar", pcm: guitar },
  { id: "pp-piano", name: "Piano", type: "piano", pcm: piano },
  { id: "pp-synths", name: "Synths", type: "synths", pcm: synths },
  { id: "pp-strings", name: "Strings", type: "strings", pcm: strings },
  { id: "pp-perc", name: "Percussion", type: "percussion", pcm: percussion },
  { id: "pp-fx", name: "Vocal FX", type: "effects", pcm: effects },
  { id: "pp-lead", name: "Lead Vocal", type: "lead_vocals", pcm: leadVocals },
  { id: "pp-bg", name: "BG Vocal", type: "background_vocals", pcm: bgVocals },
];

const durationSamples = frames;

const demoSections = encodeSect({
  version: 1,
  source: "regression",
  sections: [
    { sectionId: "s1", type: "intro", startMs: 0, endMs: 4000, title: "Intro", source: "user" },
    { sectionId: "s2", type: "verse", startMs: 4000, endMs: 9000, title: "Verse A", source: "user" },
    { sectionId: "s3", type: "pre_chorus", startMs: 9000, endMs: 12000, title: "Pre", source: "user" },
    { sectionId: "s4", type: "chorus", startMs: 12000, endMs: 17000, title: "Chorus", source: "user" },
    { sectionId: "s5", type: "bridge", startMs: 17000, endMs: 19000, title: "Bridge", source: "user" },
    { sectionId: "s6", type: "verse", startMs: 19000, endMs: 21000, title: "Verse B", source: "user" },
    { sectionId: "s7", type: "outro", startMs: 21000, endMs: 22000, title: "Outro", source: "user" },
  ],
});

const demoLyrics = encodeLyrc({
  source: "regression",
  unsynced: "Synthetic pity party class\nVerse and chorus flow\nLate vocal join test",
  synced: [
    { timeMs: 0, text: "Regression intro line", section: "Intro" },
    { timeMs: 4000, text: "Verse section one", section: "Verse" },
    { timeMs: 9000, text: "Building to chorus", section: "Pre" },
    { timeMs: 12000, text: "Chorus peak here", section: "Chorus" },
    { timeMs: 17000, text: "Bridge moment", section: "Bridge" },
    { timeMs: 19000, text: "Final verse", section: "Verse" },
    { timeMs: 21000, text: "Outro fade", section: "Outro" },
  ],
});

const demoVisu = encodeVisu({
  themeName: "It's My Party (synthetic)",
  primaryColor: "#e11d48",
  accentColor: "#f472b6",
  backgroundColor: "#1a0a12",
  moodLabel: "dramatic",
  visualIntensity: "medium",
  playerStyle: "cinematic",
  source: "user",
});

setStdaSafeMaxBytesForTests(4 * 1024 * 1024);
setStdfFragmentPayloadTargetForTests(256 * 1024);

const stemBundles = stemDefs.map((s) => ({
  stemId: s.id,
  stemName: s.name,
  stemType: s.type,
  codecId: CodecId.MP5L,
  sampleRate,
  channels,
  durationSamples,
  frameData: encodeStemFrame(s.pcm),
  defaultVolume: 1,
}));

const { optional, extraChunks, manifest, report } = buildStemOptionalChunks(stemBundles);
resetStdfFragmentPayloadTarget();
resetStdaSafeMaxBytesForTests();

if (manifest.storageMode !== "stdf-v1") {
  console.warn("WARN: expected stdf-v1 storage; got", manifest.storageMode);
}

const mixBitstream = mod.encode_mp5l(fullMix, channels);
const out = writeMp5({
  head: {
    codecId: CodecId.MP5L,
    channels,
    bitsPerSample: 16,
    presetId: 0,
    sampleRate,
    totalSamples: BigInt(frames),
    encoderVersion: 1,
  },
  meta: [
    { key: "title", value: "Pity Party class (synthetic regression)" },
    { key: "artist", value: "MP5 Regression Harness" },
    { key: "album", value: "STDF Karaoke QA" },
  ],
  audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: mixBitstream }],
  seek: [{ sampleOffset: 0n, byteOffset: 0n }],
  waveform: peaksFromInterleaved(fullMix, channels),
  info: [
    {
      key: "encoder",
      value: "Synthetic Pity Party class — STDF v1, 10 stems, no instrumental, LYRC/SECT/VISU",
    },
  ],
  optional: new Map([
    ...optional.entries(),
    ["LYRC", demoLyrics],
    ["SECT", demoSections],
    ["HOOK", encodeHook({ sectionId: "s4", startMs: 12000, endMs: 17000, label: "Chorus" })],
    [
      "HILT",
      encodeHilt({
        source: "regression",
        highlights: [{ startMs: 12000, endMs: 15000, label: "Chorus hook", useCase: "share" }],
      }),
    ],
    ["VISU", demoVisu],
  ]),
  extraChunks,
});

const outPath = join(outDir, "demo_pity_party_class.mp5");
writeFileSync(outPath, out);

console.log(`Wrote ${outPath} (${out.length} bytes)`);
console.log(`  stems: ${manifest.stems.length}, storage: ${manifest.storageMode}`);
console.log(`  STDF fragments: ${report.fragmentCount}, duration: ${durationSec}s`);
console.log(`  instrumental: ${manifest.stems.some((s) => s.stemType === "instrumental") ? "yes" : "no"}`);
console.log(
  "  karaoke path: mute_vocals (no instrumental stem)",
);
