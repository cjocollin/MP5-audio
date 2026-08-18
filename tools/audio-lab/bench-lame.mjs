#!/usr/bin/env node
// LAME-matched benchmark harness (Phase 3) + Phase 4.4 size gates.
//
// Same decoded PCM -> MP5 (CodecId 6 when available, else encode_mp5c_vnext_mdct)
// + libmp3lame CBR 128/192/320 (optional V0). Tag-stripped, delay-aligned.
//
// Mandatory three-figure report on every MP5 row (MP5C_NEXT_SPEC section 4.4).
// Phase 4.3 flipped RATE_CONTROL_READY: --rate N encodes MP5-C at a
// deterministic ABR/CBR target and --gate enforces the Phase 4.4 size gate
// (MP5 total <= LAME CBR at the matched rate, +2% tolerance) plus the
// +-3% rate-accuracy bar.
//
// Usage:
//   node tools/audio-lab/bench-lame.mjs [--excerpts id,id|all|dev]
//       [--preset 2] [--v0] [--out path.json]
//       [--rate 128|192|320] [--rate-mode abr|cbr|off] [--gate]
//       [--allow-held-out --held-out-reason "..."]
//       [--killers] [--excerpt-limit N]
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { cpus, platform, arch, totalmem, freemem } from "node:os";
import { dirname, join } from "node:path";
import { loadCodec, REPO_ROOT } from "./wasm.mjs";
import {
  decodeToPcm,
  encodeMp3Lame,
  cleanupTempDir,
  getFfmpegVersions,
} from "./pcm.mjs";
import { alignDecoded } from "./align.mjs";
import { walkUnitMixJs, threeFigureReport, mergeMix } from "./unitMix.mjs";
import {
  loadManifest,
  CORPUS_DIR,
  assertCorpusAccess,
} from "./corpus.mjs";
import {
  RATE_CONTROL_READY,
  mp5RateLabel,
  matchedBitrateVerdict,
} from "./claimFlags.mjs";
import { computeMetrics } from "./metrics.mjs";
import { allKillers } from "./killers.mjs";

const EXCERPTS_PATH = join(REPO_ROOT, "benchmarks", "real-music", "excerpts.json");
const DEFAULT_OUT = join(
  REPO_ROOT,
  "benchmarks",
  "audio-quality",
  "lame-matched-bench.json",
);
const LAME_CBR = [128, 192, 320];
const WASM_PKG = join(
  REPO_ROOT,
  "apps",
  "web",
  "src",
  "wasm",
  "pkg",
  "mp5_codec_bg.wasm",
);

function parseArgs(argv) {
  const out = {
    excerpts: "dev",
    preset: 2,
    v0: false,
    out: DEFAULT_OUT,
    allowHeldOut: false,
    heldOutReason: null,
    killers: false,
    excerptLimit: null,
    rate: null,
    rateMode: "abr",
    gate: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--excerpts") out.excerpts = argv[++i];
    else if (a === "--preset") out.preset = Number(argv[++i]);
    else if (a === "--v0") out.v0 = true;
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--allow-held-out") out.allowHeldOut = true;
    else if (a === "--held-out-reason") out.heldOutReason = argv[++i];
    else if (a === "--killers") out.killers = true;
    else if (a === "--excerpt-limit") out.excerptLimit = Number(argv[++i]);
    else if (a === "--rate") out.rate = Number(argv[++i]);
    else if (a === "--rate-mode") out.rateMode = argv[++i];
    else if (a === "--gate") out.gate = true;
    else throw new Error("unknown arg: " + a);
  }
  if (out.rate != null && (!Number.isFinite(out.rate) || out.rate <= 0)) {
    throw new Error("--rate must be a positive kbps number");
  }
  if (!["abr", "cbr", "off"].includes(out.rateMode)) {
    throw new Error("--rate-mode must be abr|cbr|off");
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

function wasmPkgHash() {
  if (!existsSync(WASM_PKG)) return null;
  return createHash("sha256").update(readFileSync(WASM_PKG)).digest("hex");
}

function reproducibilityHeader(corpusManifestId) {
  const ff = getFfmpegVersions();
  const cpu = cpus()?.[0];
  return {
    gitCommit: gitCommit(),
    os: platform() + " " + arch(),
    nodeVersion: process.version,
    cpuModel: cpu?.model ?? null,
    cpuCount: cpus()?.length ?? null,
    memoryBytes: { total: totalmem(), free: freemem() },
    ffmpeg: ff,
    libmp3lame: {
      via: "ffmpeg -c:a libmp3lame",
      enabled: ff.libmp3lameEnabled,
      note: ff.libmp3lameNote,
      claimedVersion: null,
      recordedFrom: ff.ffmpegVersionLine,
    },
    wasmPkgSha256: wasmPkgHash(),
    corpusManifestId,
    rateControlReady: RATE_CONTROL_READY,
    generatedAt: new Date().toISOString(),
  };
}

export function encodeMp5Lossy(codec, samples, channels, sampleRate, preset, rateOpts) {
  if (rateOpts?.kbps != null && typeof codec.encode_mp5c6_at === "function") {
    const mode = rateOpts.mode ?? "abr";
    const modeId = mode === "cbr" ? 2 : mode === "off" ? 0 : 1;
    return {
      bytes: codec.encode_mp5c6_at(
        samples,
        channels,
        preset,
        sampleRate,
        rateOpts.kbps,
        modeId,
      ),
      encoderId: "encode_mp5c6_at",
      encoderLabel: `CodecId 6 ${mode.toUpperCase()} ${rateOpts.kbps} (encode_mp5c6_at)`,
      rateTargetKbps: rateOpts.kbps,
      rateMode: mode,
    };
  }
  if (typeof codec.encode_mp5c6 === "function") {
    return {
      bytes: codec.encode_mp5c6(samples, channels, preset, sampleRate),
      encoderId: "encode_mp5c6",
      encoderLabel: "CodecId 6 (encode_mp5c6)",
    };
  }
  if (typeof codec.encode_mp5c6_at === "function") {
    return {
      bytes: codec.encode_mp5c6_at(samples, channels, preset, sampleRate),
      encoderId: "encode_mp5c6_at",
      encoderLabel: "CodecId 6 (encode_mp5c6_at)",
    };
  }
  for (const name of ["encode_mp5c_codec6", "encode_mp5c_next"]) {
    if (typeof codec[name] === "function") {
      return {
        bytes: codec[name](samples, channels, preset, sampleRate),
        encoderId: name,
        encoderLabel: "CodecId 6 alias (" + name + ")",
      };
    }
  }
  if (typeof codec.encode_mp5c_vnext_mdct === "function") {
    return {
      bytes: codec.encode_mp5c_vnext_mdct(samples, channels, preset),
      encoderId: "encode_mp5c_vnext_mdct",
      encoderLabel:
        "FALLBACK encode_mp5c_vnext_mdct (CodecId 6 container export not yet in WASM)",
    };
  }
  throw new Error(
    "No MP5 lossy encoder available (need encode_mp5c6* or encode_mp5c_vnext_mdct)",
  );
}

export function decodeMp5Lossy(codec, bytes, encoderId) {
  if (encoderId.startsWith("encode_mp5c6") || encoderId.includes("codec6")) {
    if (typeof codec.decode_mp5c6 === "function") return codec.decode_mp5c6(bytes);
  }
  if (typeof codec.decode_mp5c_vnext === "function") {
    return codec.decode_mp5c_vnext(bytes);
  }
  if (typeof codec.decode_mp5c3 === "function") return codec.decode_mp5c3(bytes);
  throw new Error("No MP5 lossy decoder available");
}

export function inspectMix(codec, bytes) {
  const js = walkUnitMixJs(bytes);
  let rust = null;
  const rustAvailable = typeof codec.inspect_unit_mix === "function";
  if (rustAvailable) {
    try {
      rust = normalizeRustMix(codec.inspect_unit_mix(bytes));
    } catch (e) {
      rust = { error: String(e.message ?? e) };
    }
  }
  return { js, rust, rustAvailable };
}

/** Map Rust inspect_unit_mix tag keys → JS TAG_NAMES. */
const RUST_TAG_TO_JS = {
  lossless_l: "lossless_L",
  lossless_b: "lossless_B",
  mdct: "mdct_M",
  legacy_lossy: "legacy_lossy_C",
  signal_relative: "signal_relative_F",
};

function normalizeRustMix(raw) {
  // WASM currently returns a JSON string from inspect_unit_mix.
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;

  const unitsByTag = {};
  const framesByTag = {};
  const payloadBytesByTag = {};

  if (obj.tags && typeof obj.tags === "object") {
    for (const [rustTag, tallies] of Object.entries(obj.tags)) {
      if (rustTag === "unknown") continue;
      const jsTag = RUST_TAG_TO_JS[rustTag] ?? rustTag;
      const u = Number(tallies?.units ?? 0);
      const f = Number(tallies?.frames ?? 0);
      const b = Number(tallies?.payload_bytes ?? tallies?.payloadBytes ?? 0);
      if (u) unitsByTag[jsTag] = (unitsByTag[jsTag] ?? 0) + u;
      if (f) framesByTag[jsTag] = (framesByTag[jsTag] ?? 0) + f;
      if (b) payloadBytesByTag[jsTag] = (payloadBytesByTag[jsTag] ?? 0) + b;
    }
  } else {
    const srcUnits = obj.unitsByTag ?? obj.units_by_tag ?? {};
    const srcFrames = obj.framesByTag ?? obj.frames_by_tag ?? {};
    const srcBytes = obj.payloadBytesByTag ?? obj.payload_bytes_by_tag ?? {};
    for (const [k, v] of Object.entries(srcUnits)) {
      const jsTag = RUST_TAG_TO_JS[k] ?? k;
      unitsByTag[jsTag] = Number(v);
    }
    for (const [k, v] of Object.entries(srcFrames)) {
      const jsTag = RUST_TAG_TO_JS[k] ?? k;
      framesByTag[jsTag] = Number(v);
    }
    for (const [k, v] of Object.entries(srcBytes)) {
      const jsTag = RUST_TAG_TO_JS[k] ?? k;
      payloadBytesByTag[jsTag] = Number(v);
    }
  }

  return {
    units: Number(obj.total_units ?? obj.units ?? 0),
    totalFrames: Number(obj.total_frames ?? obj.totalFrames ?? 0),
    totalPayloadBytes: Number(
      obj.total_payload_bytes ?? obj.totalPayloadBytes ?? 0,
    ),
    unitsByTag,
    framesByTag,
    payloadBytesByTag,
    _raw: obj,
  };
}

function encodeAndMeasureLame(samples, channels, sampleRate, bitrateKbps, vbrQuality) {
  const enc = encodeMp3Lame(samples, channels, sampleRate, bitrateKbps, {
    vbrQuality,
  });
  try {
    const decoded = decodeToPcm(enc.path);
    const aligned = alignDecoded(samples, decoded.samples, channels);
    const metrics = computeMetrics(
      aligned.reference,
      aligned.candidate,
      channels,
      sampleRate,
    );
    return {
      bitrateKbps: bitrateKbps ?? null,
      vbrQuality: vbrQuality ?? null,
      bytes: enc.bytes.length,
      lagFrames: aligned.lagFrames,
      lagCorrelation: aligned.correlation,
      metrics: summarizeMetrics(metrics),
    };
  } finally {
    cleanupTempDir(enc.dir);
  }
}

function summarizeMetrics(m) {
  return {
    fullSnrDb: m.fullSnrDb === Infinity ? "inf" : m.fullSnrDb,
    quietWindowSnrDb:
      m.quietWindowSnrDb === Infinity ? "inf" : m.quietWindowSnrDb,
    worst1sSnrDb: m.worst1sSnrDb === Infinity ? "inf" : m.worst1sSnrDb,
    contentBitExact: m.contentBitExact,
    durationMatch: m.durationMatch,
    peakError: m.peakError,
    rmsError: m.rmsError,
  };
}

function metricDeltas(mp5m, lamem) {
  const num = (v) => (v === "inf" || v === Infinity ? 999 : Number(v));
  return {
    fullSnrDb: num(mp5m.fullSnrDb) - num(lamem.fullSnrDb),
    quietWindowSnrDb: num(mp5m.quietWindowSnrDb) - num(lamem.quietWindowSnrDb),
  };
}

function loadExcerpts(args, manifest) {
  if (!existsSync(EXCERPTS_PATH)) {
    throw new Error("excerpts manifest missing: " + EXCERPTS_PATH);
  }
  const doc = JSON.parse(readFileSync(EXCERPTS_PATH, "utf8"));
  let list = doc.excerpts ?? [];
  if (args.excerpts === "dev") {
    list = list.filter((e) => e.role !== "held-out");
  } else if (args.excerpts !== "all") {
    const ids = new Set(
      args.excerpts
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    list = list.filter((e) => ids.has(e.id));
  }
  if (args.excerptLimit != null) list = list.slice(0, args.excerptLimit);

  const byId = new Map(manifest.tracks.map((t) => [t.id, t]));
  const resolved = [];
  for (const ex of list) {
    const track = byId.get(ex.sourceId);
    if (!track) {
      console.error(
        "  skip excerpt " + ex.id + ": unknown sourceId " + ex.sourceId,
      );
      continue;
    }
    const abs = join(
      CORPUS_DIR,
      ...track.relativePath.replace(/\\/g, "/").split("/"),
    );
    if (!existsSync(abs)) {
      console.error(
        "  skip excerpt " + ex.id + ": missing file " + track.relativePath,
      );
      continue;
    }
    resolved.push({ ...ex, track, absolutePath: abs });
  }
  return { doc, excerpts: resolved };
}

function measureExcerpt(codec, excerpt, args) {
  const { samples, channels, sampleRate } = decodeToPcm(excerpt.absolutePath, {
    startSec: excerpt.startSec,
    durationSec: excerpt.durationSec,
  });
  const durationSec = samples.length / channels / sampleRate;
  const pcmBytes = samples.length * 2;
  if (!(durationSec > 0)) {
    // A source shorter than the excerpt window must not abort the run.
    console.error(
      `  skip ${excerpt.id}: source yielded 0 samples (${excerpt.absolutePath})`,
    );
    return null;
  }

  const t0 = performance.now();
  const enc = encodeMp5Lossy(codec, samples, channels, sampleRate, args.preset, {
    kbps: args.rate,
    mode: args.rateMode,
  });
  const t1 = performance.now();
  const decoded = decodeMp5Lossy(codec, enc.bytes, enc.encoderId);
  const t2 = performance.now();

  const alignedMp5 = alignDecoded(samples, decoded, channels, 256);
  const mp5Metrics = summarizeMetrics(
    computeMetrics(
      alignedMp5.reference,
      alignedMp5.candidate,
      channels,
      sampleRate,
    ),
  );

  const mixInfo = inspectMix(codec, enc.bytes);
  const three = threeFigureReport(mixInfo.js, durationSec, {
    audiBytes: enc.bytes.length,
    fileBytes: enc.bytes.length,
  });
  if (!three.ok) {
    throw new Error(
      "three-figure report failed for " + excerpt.id + ": " + three.error,
    );
  }

  const operatingKbps = three.codedPathBitrateKbps;
  const achievedTotalKbps = (enc.bytes.length * 8) / 1000 / durationSec;
  const rateAccuracyPct =
    enc.rateTargetKbps != null
      ? (100 * (achievedTotalKbps - enc.rateTargetKbps)) / enc.rateTargetKbps
      : null;
  const mp5Row = {
    encoderId: enc.encoderId,
    encoderLabel: enc.encoderLabel,
    rateTargetKbps: enc.rateTargetKbps ?? null,
    rateMode: enc.rateMode ?? null,
    achievedTotalKbps,
    rateAccuracyPct,
    encodeMs: t1 - t0,
    decodeMs: t2 - t1,
    rateLabel:
      enc.rateTargetKbps != null
        ? `${enc.rateMode?.toUpperCase()} ${enc.rateTargetKbps}`
        : mp5RateLabel(operatingKbps),
    totalAudiBytes: enc.bytes.length,
    pcmBytes,
    lagFrames: alignedMp5.lagFrames,
    lagCorrelation: alignedMp5.correlation,
    metrics: mp5Metrics,
    threeFigures: {
      codedPathBitrateKbps: three.codedPathBitrateKbps,
      protectedSamplePct: three.protectedSamplePct,
      protectedBytePct: three.protectedBytePct,
      protectBytes: three.protectBytes,
      totalSizeBytes: three.totalFileBytes ?? three.totalAudiBytes,
      mdctSamplePct: three.mdctSamplePct,
      mdctBytePct: three.mdctBytePct,
    },
    unitMixJs: three.unitMix,
    unitMixRust: mixInfo.rust,
    rustInspectAvailable: mixInfo.rustAvailable,
  };

  const lameAnchors = {};
  const deltas = {};
  for (const br of LAME_CBR) {
    const row = encodeAndMeasureLame(samples, channels, sampleRate, br, null);
    lameAnchors["cbr_" + br] = row;
    const d = metricDeltas(mp5Metrics, row.metrics);
    d.mp5AudiBytes = enc.bytes.length;
    d.lameBytes = row.bytes;
    d.sizeRatioMp5OverLame = enc.bytes.length / row.bytes;
    deltas["vs_lame_cbr_" + br] = d;
  }
  if (args.v0) {
    const row = encodeAndMeasureLame(samples, channels, sampleRate, null, 0);
    lameAnchors.v0 = row;
    const d = metricDeltas(mp5Metrics, row.metrics);
    d.mp5AudiBytes = enc.bytes.length;
    d.lameBytes = row.bytes;
    d.sizeRatioMp5OverLame = enc.bytes.length / row.bytes;
    deltas.vs_lame_v0 = d;
  }

  const verdicts = {};
  for (const br of LAME_CBR) {
    verdicts["matched_" + br] = matchedBitrateVerdict({
      mp5Kbps: operatingKbps,
      lameKbps: br,
      metricDeltas: deltas["vs_lame_cbr_" + br],
    });
  }

  return {
    excerptId: excerpt.id,
    sourceId: excerpt.sourceId,
    startSec: excerpt.startSec,
    durationSec,
    why: excerpt.why,
    tags: excerpt.tags,
    role: excerpt.track.role,
    sampleRate,
    channels,
    mp5: mp5Row,
    lameAnchors,
    informationalDeltasVsLame: deltas,
    matchedBitrateVerdicts: verdicts,
  };
}

function measureKiller(codec, killer, args) {
  const { samples, channels, sampleRate, name } = killer;
  const durationSec = samples.length / channels / sampleRate;
  const enc = encodeMp5Lossy(codec, samples, channels, sampleRate, args.preset, {
    kbps: args.rate,
    mode: args.rateMode,
  });
  const decoded = decodeMp5Lossy(codec, enc.bytes, enc.encoderId);
  const aligned = alignDecoded(samples, decoded, channels, 256);
  const metrics = summarizeMetrics(
    computeMetrics(aligned.reference, aligned.candidate, channels, sampleRate),
  );
  const mixInfo = inspectMix(codec, enc.bytes);
  const three = threeFigureReport(mixInfo.js, durationSec, {
    audiBytes: enc.bytes.length,
    fileBytes: enc.bytes.length,
  });
  if (!three.ok) {
    throw new Error(
      "three-figure failed for killer " + name + ": " + three.error,
    );
  }
  const achievedTotalKbps = (enc.bytes.length * 8) / 1000 / durationSec;
  const rateAccuracyPct =
    enc.rateTargetKbps != null
      ? (100 * (achievedTotalKbps - enc.rateTargetKbps)) / enc.rateTargetKbps
      : null;
  const lameAnchors = {};
  const deltas = {};
  for (const br of LAME_CBR) {
    const row = encodeAndMeasureLame(samples, channels, sampleRate, br, null);
    lameAnchors["cbr_" + br] = row;
    deltas["vs_lame_cbr_" + br] = {
      mp5AudiBytes: enc.bytes.length,
      lameBytes: row.bytes,
      sizeRatioMp5OverLame: enc.bytes.length / row.bytes,
    };
  }
  const verdicts = {};
  for (const br of LAME_CBR) {
    verdicts["matched_" + br] = matchedBitrateVerdict({
      mp5Kbps: three.codedPathBitrateKbps,
      lameKbps: br,
      metricDeltas: deltas["vs_lame_cbr_" + br],
    });
  }
  return {
    excerptId: name,
    sourceId: "synthetic:" + name,
    startSec: 0,
    durationSec,
    why: killer.note,
    tags: [killer.category, "killer"],
    role: "dev",
    sampleRate,
    channels,
    mp5: {
      encoderId: enc.encoderId,
      encoderLabel: enc.encoderLabel,
      rateTargetKbps: enc.rateTargetKbps ?? null,
      rateMode: enc.rateMode ?? null,
      achievedTotalKbps,
      rateAccuracyPct,
      rateLabel:
        enc.rateTargetKbps != null
          ? `${enc.rateMode?.toUpperCase()} ${enc.rateTargetKbps}`
          : mp5RateLabel(three.codedPathBitrateKbps),
      totalAudiBytes: enc.bytes.length,
      metrics,
      threeFigures: {
        codedPathBitrateKbps: three.codedPathBitrateKbps,
        protectedSamplePct: three.protectedSamplePct,
        protectedBytePct: three.protectedBytePct,
        protectBytes: three.protectBytes,
        totalSizeBytes: three.totalFileBytes ?? three.totalAudiBytes,
        mdctSamplePct: three.mdctSamplePct,
        mdctBytePct: three.mdctBytePct,
      },
      unitMixJs: three.unitMix,
      rustInspectAvailable: mixInfo.rustAvailable,
    },
    lameAnchors,
    informationalDeltasVsLame: deltas,
    matchedBitrateVerdicts: verdicts,
  };
}

function aggregate(rows) {
  if (!rows.length) return null;
  let mix = null;
  let totalAudi = 0;
  let totalDur = 0;
  let totalPcm = 0;
  for (const r of rows) {
    totalAudi += r.mp5.totalAudiBytes;
    totalDur += r.durationSec;
    totalPcm += r.mp5.pcmBytes ?? 0;
    if (r.mp5.unitMixJs) {
      mix = mergeMix(mix, {
        units: r.mp5.unitMixJs.units,
        totalFrames: r.mp5.unitMixJs.totalFrames,
        totalPayloadBytes: r.mp5.unitMixJs.totalPayloadBytes,
        unitsByTag: r.mp5.unitMixJs.unitsByTag,
        framesByTag: r.mp5.unitMixJs.framesByTag,
        payloadBytesByTag: r.mp5.unitMixJs.payloadBytesByTag,
      });
    }
  }
  const three = threeFigureReport(mix, totalDur, {
    audiBytes: totalAudi,
    fileBytes: totalAudi,
  });
  return {
    excerptCount: rows.length,
    totalDurationSec: totalDur,
    totalPcmBytes: totalPcm,
    totalAudiBytes: totalAudi,
    rateLabel: three.ok ? mp5RateLabel(three.codedPathBitrateKbps) : null,
    threeFigures: three.ok
      ? {
          codedPathBitrateKbps: three.codedPathBitrateKbps,
          protectedSamplePct: three.protectedSamplePct,
          protectedBytePct: three.protectedBytePct,
          totalSizeBytes: three.totalFileBytes ?? three.totalAudiBytes,
          mdctSamplePct: three.mdctSamplePct,
          mdctBytePct: three.mdctBytePct,
        }
      : { error: three.error },
    matchedBitrateVerdictsBlocked: !RATE_CONTROL_READY,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest();
  const { excerpts } = loadExcerpts(args, manifest);

  const heldTracks = excerpts
    .filter((e) => e.track.role === "held-out" || e.role === "held-out")
    .map((e) => e.track);
  const seal = assertCorpusAccess(heldTracks, {
    allowHeldOut: args.allowHeldOut,
    heldOutReason: args.heldOutReason,
  });

  const codec = await loadCodec();
  const header = reproducibilityHeader(manifest.manifestId);
  const rows = [];

  console.error(
    "LAME-matched bench — " +
      excerpts.length +
      " excerpt(s), preset=" +
      args.preset +
      ", rateControlReady=" +
      RATE_CONTROL_READY,
  );

  for (const ex of excerpts) {
    process.stderr.write("  excerpt " + ex.id + "...");
    const row = measureExcerpt(codec, ex, args);
    if (!row) {
      process.stderr.write(" skipped\n");
      continue;
    }
    rows.push(row);
    const tf = row.mp5.threeFigures;
    process.stderr.write(
      " " +
        row.mp5.encoderId +
        " coded=" +
        tf.codedPathBitrateKbps.toFixed(1) +
        "kbps prot=" +
        tf.protectedSamplePct.toFixed(1) +
        "%/" +
        tf.protectedBytePct.toFixed(1) +
        "% size=" +
        tf.totalSizeBytes +
        " lag=" +
        row.mp5.lagFrames +
        "\n",
    );
  }

  if (args.killers) {
    for (const k of allKillers()) {
      process.stderr.write("  killer " + k.name + "...");
      const row = measureKiller(codec, k, args);
      rows.push(row);
      process.stderr.write(
        " coded=" +
          row.mp5.threeFigures.codedPathBitrateKbps.toFixed(1) +
          "kbps\n",
      );
    }
  }

  for (const r of rows) {
    const tf = r.mp5.threeFigures;
    if (
      tf.codedPathBitrateKbps == null ||
      tf.protectedSamplePct == null ||
      tf.protectedBytePct == null ||
      tf.totalSizeBytes == null
    ) {
      throw new Error("BUG: incomplete three-figure report on " + r.excerptId);
    }
    for (const [k, v] of Object.entries(r.matchedBitrateVerdicts ?? {})) {
      if (v.allowed && !RATE_CONTROL_READY) {
        throw new Error(
          "BUG: matched verdict allowed while rate control off (" + k + ")",
        );
      }
      if (v.verdict != null && !RATE_CONTROL_READY) {
        throw new Error(
          "BUG: non-null matched verdict while rate control off (" + k + ")",
        );
      }
    }
  }

  const artifact = {
    schema: "mp5.lameMatchedBench.v1",
    reproducibility: header,
    corpus: {
      manifestId: manifest.manifestId,
      counts: manifest.counts,
      shortfall: manifest.shortfall,
      seal,
    },
    claimDiscipline: {
      rateControlReady: RATE_CONTROL_READY,
      mp5RateWording:
        args.rate != null
          ? `${args.rateMode.toUpperCase()} ${args.rate}`
          : "operating point ~N kbps",
      matchedBitrateLameVerdicts: RATE_CONTROL_READY ? "allowed" : "forbidden",
    },
    config: {
      preset: args.preset,
      lameCbrKbps: LAME_CBR,
      lameV0: args.v0,
      excerptsSelector: args.excerpts,
      rateTargetKbps: args.rate,
      rateMode: args.rateMode,
      gate: args.gate,
    },
    rows,
    aggregate: aggregate(rows),
  };

  // Phase 4.4 size gates at the matched ladder: "tighten toward ±2% corpus /
  // disclose per-track protect overshoot" (plan). Evaluated only with --gate;
  // failures exit non-zero so CI/nightly can enforce.
  //
  // Gate structure:
  //  - corpus size gate: aggregate MP5 total bytes vs LAME CBR at the matched
  //    rate must be <= LAME + 2% (dev corpus when dev rows exist, else all rows).
  //  - rate overshoot: > +3% on any row fails, UNLESS the row is
  //    protect-dominated (bit-exact islands alone cost more than the whole
  //    target budget) — that overshoot is the protect tax, which the plan
  //    requires to be disclosed, never hidden or "optimized" away.
  //  - undershoot (quality ceiling reached) is disclosed per row, never padded.
  const gateFailures = [];
  const gateUndershoot = [];
  const gateProtect = [];
  let gateSummary = null;
  if (args.gate) {
    if (args.rate == null) {
      throw new Error("--gate requires --rate N (the matched ladder rate)");
    }
    const anchorKey = "cbr_" + args.rate;
    let sumMp5 = 0;
    let sumLame = 0;
    let sumMp5Dev = 0;
    let sumLameDev = 0;
    let devRows = 0;
    for (const r of rows) {
      const budgetBytes = ((args.rate * 1000) / 8) * r.durationSec;
      const protectBytes = r.mp5.threeFigures.protectBytes ?? 0;
      // Protect-dominated: bit-exact islands consume >= 80% of the target
      // budget, so the loud path cannot feasibly fit what remains. The
      // overshoot that follows is the protect tax — disclosed, never hidden.
      const protectDominated = protectBytes >= 0.8 * budgetBytes;
      const acc = r.mp5.rateAccuracyPct;
      if (acc == null) {
        gateFailures.push(r.excerptId + ": no rate accuracy (encoder had no target)");
      } else if (acc > 3) {
        if (protectDominated) {
          gateProtect.push(
            `${r.excerptId}: protect islands alone (${protectBytes} B, ${((100 * protectBytes) / budgetBytes).toFixed(0)}% of the ${args.rate} kbps budget) leave no feasible loud path; overshoot +${acc.toFixed(2)}% is the protect tax, disclosed`,
          );
        } else {
          gateFailures.push(
            `${r.excerptId}: rate overshoot +${acc.toFixed(2)}% exceeds +3% (target ${args.rate})`,
          );
        }
      } else if (acc < -3) {
        gateUndershoot.push(
          `${r.excerptId}: undershoot ${acc.toFixed(2)}% (quality ceiling; disclosed, not padded)`,
        );
      }
      const anchor = r.lameAnchors?.[anchorKey];
      if (anchor) {
        sumMp5 += r.mp5.totalAudiBytes;
        sumLame += anchor.bytes;
        if (!r.tags?.includes("killer")) {
          sumMp5Dev += r.mp5.totalAudiBytes;
          sumLameDev += anchor.bytes;
          devRows += 1;
        }
      }
    }
    const allRatio = sumLame > 0 ? sumMp5 / sumLame : null;
    const devRatio = sumLameDev > 0 ? sumMp5Dev / sumLameDev : null;
    gateSummary = {
      allRows: { rows: rows.length, ratio: allRatio },
      devCorpus: { rows: devRows, ratio: devRatio },
    };
    const gated = devRatio ?? allRatio;
    if (gated != null && gated > 1.02) {
      gateFailures.push(
        `corpus size ratio ${gated.toFixed(4)} exceeds LAME CBR ${args.rate} + 2%`,
      );
    }
    artifact.gateResult = {
      rate: args.rate,
      rateMode: args.rateMode,
      tolerance:
        "corpus size <= LAME CBR + 2%; rate overshoot <= +3% unless protect-dominated; undershoot disclosed, never padded",
      sizeRatios: gateSummary,
      failures: gateFailures,
      protectOvershootDisclosed: gateProtect,
      undershootDisclosed: gateUndershoot,
      pass: gateFailures.length === 0,
    };
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  console.error("\nWrote " + args.out);
  if (args.gate) {
    if (gateSummary) {
      console.error(
        `gate size ratios @ ${args.rate}: corpus(dev)=${gateSummary.devCorpus.ratio?.toFixed(4) ?? "n/a"} all=${gateSummary.allRows.ratio?.toFixed(4) ?? "n/a"}`,
      );
    }
    for (const line of gateProtect) console.error("protect tax: " + line);
    for (const line of gateUndershoot) console.error("undershoot: " + line);
    console.error(
      gateFailures.length === 0
        ? `GATE PASS @ ${args.rate} ${args.rateMode}: ${rows.length} row(s)`
        : `GATE FAIL @ ${args.rate} ${args.rateMode}:\n  - ${gateFailures.join("\n  - ")}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        out: args.out,
        excerpts: rows.length,
        aggregate: artifact.aggregate,
        encoderUsed: rows[0]?.mp5?.encoderLabel ?? null,
        claimDiscipline: artifact.claimDiscipline,
        gate: artifact.gateResult ?? null,
      },
      null,
      2,
    ),
  );
  if (args.gate && gateFailures.length > 0) {
    process.exit(1);
  }
}

// Only run CLI when this file is the entry point (tests import helpers).
const isCli =
  process.argv[1] &&
  String(process.argv[1]).replace(/\\/g, "/").endsWith("/bench-lame.mjs");
if (isCli) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
