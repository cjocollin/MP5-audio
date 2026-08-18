#!/usr/bin/env node
// Phase 6 listening-set generator (scaffolding for human ABX/MUSHRA runs).
//
// Produces, under benchmarks/listening/<experimentId>/:
//   abx320/      A/B/X trial WAVs (C6 ABR 320 vs decoded reference) per fixture
//   mushra192/   reference, anchors (LAME CBR 128/320), candidate (C6 ABR 192)
//   mushra128/   same, candidate C6 ABR 128
//   protocol.json    preregistration record (experiment id, commit, fixtures,
//                    rates, hypotheses, scoring rules)
//   answers.template.json
//
// This tool ONLY prepares stimuli + scaffolding. Listening itself is a human
// activity; the results file is filled in by the listener protocol.
//
// Usage:
//   node tools/audio-lab/gen-listening-set.mjs [--experiment-id ID]
//       [--fixtures killers|dev|both] [--limit N]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadCodec, REPO_ROOT } from "./wasm.mjs";
import { encodeMp3Lame, cleanupTempDir, decodeToPcm } from "./pcm.mjs";
import { allKillers } from "./killers.mjs";
import { loadManifest, CORPUS_DIR } from "./corpus.mjs";

const EXCERPTS_PATH = join(REPO_ROOT, "benchmarks", "real-music", "excerpts.json");
const OUT_ROOT = join(REPO_ROOT, "benchmarks", "listening");

function parseArgs(argv) {
  const out = { experimentId: null, fixtures: "both", limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--experiment-id") out.experimentId = argv[++i];
    else if (a === "--fixtures") out.fixtures = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else throw new Error("unknown arg: " + a);
  }
  return out;
}

function writeWav(path, samples, channels, sampleRate) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2);
  }
  writeFileSync(path, buf);
}

/** Peak-normalize toward the reference so A/B comparisons are level-matched. */
function levelMatch(ref, cand) {
  let pr = 0;
  let pc = 0;
  for (let i = 0; i < ref.length; i++) {
    const a = Math.abs(ref[i]);
    const b = Math.abs(cand[i]);
    if (a > pr) pr = a;
    if (b > pc) pc = b;
  }
  if (pc === 0 || pr === 0 || pc === pr) return cand;
  const g = pr / pc;
  const out = new Int16Array(cand.length);
  for (let i = 0; i < cand.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(cand[i] * g)));
  }
  return out;
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function loadDevExcerpts(limit) {
  if (!existsSync(EXCERPTS_PATH)) return [];
  const doc = JSON.parse(readFileSync(EXCERPTS_PATH, "utf8"));
  const manifest = loadManifest();
  const byId = new Map(manifest.tracks.map((t) => [t.id, t]));
  const list = (doc.excerpts ?? []).filter((e) => e.role !== "held-out");
  const out = [];
  for (const ex of list) {
    const track = byId.get(ex.sourceId);
    if (!track) continue;
    const abs = join(CORPUS_DIR, ...track.relativePath.replace(/\\/g, "/").split("/"));
    if (!existsSync(abs)) continue;
    out.push({ id: ex.id, absolutePath: abs, startSec: ex.startSec, durationSec: ex.durationSec });
    if (limit && out.length >= limit) break;
  }
  return out;
}

function fixturesOf(args) {
  const fixtures = [];
  if (args.fixtures === "killers" || args.fixtures === "both") {
    for (const k of allKillers()) {
      fixtures.push({
        id: k.name,
        samples: k.samples,
        channels: k.channels,
        sampleRate: k.sampleRate,
      });
    }
  }
  if (args.fixtures === "dev" || args.fixtures === "both") {
    for (const ex of loadDevExcerpts(args.limit)) {
      const pcm = decodeToPcm(ex.absolutePath, {
        startSec: ex.startSec,
        durationSec: ex.durationSec,
      });
      if (pcm.samples.length === 0) continue;
      fixtures.push({ id: ex.id, samples: pcm.samples, channels: pcm.channels, sampleRate: pcm.sampleRate });
    }
  }
  return args.limit ? fixtures.slice(0, args.limit) : fixtures;
}

function lameBytes(samples, channels, sampleRate, kbps) {
  const enc = encodeMp3Lame(samples, channels, sampleRate, kbps);
  try {
    return decodeToPcm(enc.path);
  } finally {
    cleanupTempDir(enc.dir);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const codec = await loadCodec();
  if (typeof codec.encode_mp5c6_at !== "function") {
    throw new Error("encode_mp5c6_at missing — run pnpm wasm:build");
  }
  const experimentId =
    args.experimentId ??
    "c6-listen-" + new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outDir = join(OUT_ROOT, experimentId);
  const fixtures = fixturesOf(args);
  if (fixtures.length === 0) throw new Error("no fixtures resolved");

  const protocol = {
    schema: "mp5.listening.protocol.v1",
    experimentId,
    createdAt: new Date().toISOString(),
    gitCommit: gitCommit(),
    encoder: "CodecId 6 (MP5-C), ABR, profile 3 defaults (joint stereo + window switching)",
    fixtures: fixtures.map((f) => ({
      id: f.id,
      channels: f.channels,
      sampleRate: f.sampleRate,
      durationSec: f.samples.length / f.channels / f.sampleRate,
    })),
    arms: {
      abx320: {
        design: "ABX vs decoded reference, 16 trials/fixture",
        hypothesis:
          "listeners cannot identify X better than the binomial critical value at alpha=0.05 (transparency at 320)",
        passRule: "correct <= binomialCritical(16, 0.05) per fixture AND overall",
      },
      mushra192: {
        design: "MUSHRA: hidden reference, LAME CBR 320 anchor, LAME CBR 128 anchor, C6 ABR 192 candidate",
        hypothesis: "C6 ABR 192 scores non-inferior to LAME CBR 128 anchor (size-matched comparison)",
        passRule: "median candidate score >= median LAME-128 anchor score on >= 80% of fixtures, no fixture with systematic artifact reports (hiss/pre-echo/stereo collapse/clip/duration drift)",
      },
      mushra128: {
        design: "as mushra192 with C6 ABR 128 candidate",
        hypothesis: "C6 ABR 128 scores non-inferior to LAME CBR 128 anchor",
        passRule: "as mushra192; failure here MUST NOT block a qualified 320/192",
      },
    },
    resultsFile: "results.json (fill after listening; do not edit stimuli)",
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "protocol.json"), JSON.stringify(protocol, null, 2) + "\n");

  const answersTemplate = {
    experimentId,
    listener: "<name>",
    date: "",
    abx320: Object.fromEntries(
      fixtures.map((f) => [f.id, { correct: null, trials: 16 }]),
    ),
    mushra192: Object.fromEntries(
      fixtures.map((f) => [f.id, { hiddenRef: null, lame320: null, lame128: null, c6: null, notes: "" }]),
    ),
    mushra128: Object.fromEntries(
      fixtures.map((f) => [f.id, { hiddenRef: null, lame320: null, lame128: null, c6: null, notes: "" }]),
    ),
  };
  writeFileSync(
    join(outDir, "answers.template.json"),
    JSON.stringify(answersTemplate, null, 2) + "\n",
  );

  for (const f of fixtures) {
    const refPcm = {
      samples: f.samples,
      channels: f.channels,
      sampleRate: f.sampleRate,
    };
    for (const [dir, kbps] of [
      ["abx320", 320],
      ["mushra192", 192],
      ["mushra128", 128],
    ]) {
      const c6 = codec.decode_mp5c6(
        codec.encode_mp5c6_at(f.samples, f.channels, 2, f.sampleRate, kbps, 1),
      );
      const d = join(outDir, dir);
      mkdirSync(d, { recursive: true });
      const base = f.id.replace(/[^\w-]+/g, "_");
      if (dir === "abx320") {
        writeWav(join(d, `${base}__A_reference.wav`), refPcm.samples, f.channels, f.sampleRate);
        writeWav(
          join(d, `${base}__B_candidate_c6abr320.wav`),
          levelMatch(refPcm.samples, c6),
          f.channels,
          f.sampleRate,
        );
      } else {
        const lame128 = lameBytes(f.samples, f.channels, f.sampleRate, 128);
        const lame320 = lameBytes(f.samples, f.channels, f.sampleRate, 320);
        writeWav(join(d, `${base}__hidden_reference.wav`), refPcm.samples, f.channels, f.sampleRate);
        writeWav(join(d, `${base}__anchor_lame320.wav`), levelMatch(refPcm.samples, lame320.samples), f.channels, f.sampleRate);
        writeWav(join(d, `${base}__anchor_lame128.wav`), levelMatch(refPcm.samples, lame128.samples), f.channels, f.sampleRate);
        writeWav(
          join(d, `${base}__candidate_c6abr${kbps}.wav`),
          levelMatch(refPcm.samples, c6),
          f.channels,
          f.sampleRate,
        );
      }
    }
    process.stderr.write("  built stimuli for " + f.id + "\n");
  }

  console.log(
    JSON.stringify(
      { experimentId, outDir, fixtures: fixtures.length, protocol: join(outDir, "protocol.json") },
      null,
      2,
    ),
  );
}

const isCli =
  process.argv[1] &&
  String(process.argv[1]).replace(/\\/g, "/").endsWith("/gen-listening-set.mjs");
if (isCli) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
