#!/usr/bin/env node
// MP5 Audio Quality Lab — CLI entry point.
//
//   node run.mjs bench [--group all|mp5l|mp5c|mp5c-vnext|mp5h] [--source f.wav ...]
//   node run.mjs quality-report
//   node run.mjs export-listening [--set full|mp5c|vnext] [--source f.wav]
//   node run.mjs null-test
//   node run.mjs inspect --files a.mp5 b.mp5 ...        (or --files @config)
//   node run.mjs compare-files --reference r.mp5 --candidate c.mp5
//   node run.mjs compare-set  --reference r.mp5 --candidates a.mp5 b.mp5 ...
//   node run.mjs hiss-report  [--reference r.mp5 --candidates ...]
//
// Reports → benchmarks/audio-quality/. Generated reports, listening WAVs, and the
// local/ reference report are git-ignored; only this tooling is committed.
// No telemetry. No copyrighted audio is read into the repo or committed.
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loadCodec, REPO_ROOT } from "./wasm.mjs";
import { allFixtures, listeningFixtures } from "./fixtures.mjs";
import { buildModes, modesForGroup } from "./codecs.mjs";
import { computeMetrics, nullTest } from "./metrics.mjs";
import { writeJson, writeCsv, writeMarkdown, writeQualityReport } from "./report.mjs";
import { readWav, writeWavPcm16 } from "./wav.mjs";
import { selfTest } from "./mp5file.mjs";
import {
  inspectFiles, writeInspectReport,
  compareFiles, writeCompareReport,
  buildHissRows, writeHissReport,
} from "./compare.mjs";

const OUT_DIR = join(REPO_ROOT, "benchmarks", "audio-quality");
const CONFIG = join(REPO_ROOT, "tools", "audio-lab", "lab.config.json");

// Descriptive listening filenames (Task 7 layout).
const LISTEN_NAME = {
  pcm: "pcm_reference",
  mp5l: "mp5l",
  "mp5c-high": "mp5c_current_high",
  "mp5c-extreme": "mp5c_current_extreme",
  "mp5c2-lab": "mp5c_vnext_block_high",
  "mp5c2-extreme": "mp5c_vnext_block_extreme",
  "mp5c2-subblock": "mp5c_vnext_subblock_high",
  "mp5c2-bandquiet": "mp5c_vnext_bandquiet_high",
  "mp5c2-bandquiet-extreme": "mp5c_vnext_bandquiet_extreme",
  "mp5c2-smooth": "mp5c_vnext_smooth_high",
  "mp5c2-smooth-extreme": "mp5c_vnext_smooth_extreme",
  "mp5c2-shaped-extreme": "mp5c_vnext_shaped_extreme",
  "mp5c2-native-extreme": "mp5c_vnext_native_extreme",
  "mp5h-high": "mp5h_high",
  "mp5h-extreme": "mp5h_extreme",
};
const LISTEN_SETS = {
  full: Object.keys(LISTEN_NAME),
  mp5c: ["pcm", "mp5l", "mp5c-high", "mp5c-extreme"],
  vnext: ["pcm", "mp5l", "mp5c-high", "mp5c-extreme", "mp5c2-bandquiet-extreme", "mp5c2-smooth-extreme", "mp5c2-shaped-extreme"],
};

function parseArgs(argv) {
  const args = { _: [], group: "all", set: "full", source: [], reference: null, candidates: [], files: [], out: OUT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--group") args.group = argv[++i];
    else if (a === "--set") args.set = argv[++i];
    else if (a === "--source") args.source.push(argv[++i]);
    else if (a === "--reference") args.reference = argv[++i];
    else if (a === "--candidate") args.candidates.push(argv[++i]);
    else if (a === "--candidates") { while (argv[i + 1] && !argv[i + 1].startsWith("--")) args.candidates.push(argv[++i]); }
    else if (a === "--files") { while (argv[i + 1] && !argv[i + 1].startsWith("--")) args.files.push(argv[++i]); }
    else if (a === "--out") args.out = argv[++i];
    else args._.push(a);
  }
  return args;
}

function readConfig() {
  if (!existsSync(CONFIG)) return {};
  try { return JSON.parse(readFileSync(CONFIG, "utf8")); } catch { return {}; }
}

// Expand @config tokens for .wav source lists.
function expandSources(paths) {
  const out = [];
  for (const p of paths) {
    if (p === "@config") {
      const cfg = readConfig();
      for (const s of cfg.sources ?? []) if (existsSync(s)) out.push(s);
    } else out.push(p);
  }
  return out;
}

// Expand @config for .mp5 file lists (keys: referenceMp5, candidateMp5).
function expandMp5(list, kind) {
  const out = [];
  for (const p of list) {
    if (p === "@config") {
      const cfg = readConfig();
      const arr = kind === "reference" ? [cfg.referenceMp5].filter(Boolean) : (cfg.candidateMp5 ?? []);
      for (const s of arr) if (existsSync(s)) out.push(s);
    } else if (existsSync(p)) out.push(p);
    else console.error(`  (skipping missing file: ${p})`);
  }
  return out;
}

function loadSources(paths) {
  return expandSources(paths).map((p) => {
    if (!existsSync(p)) throw new Error(`--source not found: ${p}`);
    const { samples, channels, sampleRate } = readWav(p);
    const name = p.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
    return { name, category: "user-local", samples, channels, sampleRate, note: p };
  });
}

function gateSelfTest(codec) {
  const r = selfTest(codec);
  if (!r.ok) throw new Error(`PIPELINE SELF-TEST FAILED (${r.reason}). Refusing to report metrics — fix the decode contract first.`);
  console.error(`  ✓ pipeline self-test: MP5-L container round-trip bit-exact (${r.frames} frames)`);
}

function benchRows(fixtures, modes) {
  const rows = [];
  for (const fx of fixtures) {
    const pcmBytes = fx.samples.length * 2;
    for (const mode of modes) {
      const t0 = performance.now();
      const enc = mode.encode(fx.samples, fx.channels);
      const t1 = performance.now();
      let dec;
      try { dec = mode.decode(enc); }
      catch (e) {
        rows.push({ fixture: fx.name, category: fx.category, mode: mode.label, modeId: mode.id, bytes: enc.length, ratioVsPcm: enc.length / pcmBytes, encodeMs: t1 - t0, decodeMs: null, bitExact: false, error: String(e), clippingCount: 0, durationMatch: false });
        console.error(`  ✗ ${fx.name} / ${mode.id}: decode failed: ${e}`);
        continue;
      }
      const t2 = performance.now();
      const m = computeMetrics(fx.samples, dec, fx.channels, fx.sampleRate);
      rows.push({ fixture: fx.name, category: fx.category, mode: mode.label, modeId: mode.id, bytes: enc.length, ratioVsPcm: enc.length / pcmBytes, encodeMs: t1 - t0, decodeMs: t2 - t1, ...m });
    }
    console.error(`  ✓ ${fx.name}`);
  }
  return rows;
}

async function cmdBench(args) {
  const codec = await loadCodec();
  const modes = modesForGroup(buildModes(codec), args.group);
  const fixtures = args.source.length ? loadSources(args.source) : allFixtures();
  console.error(`Audio lab bench — group=${args.group}, ${fixtures.length} fixtures, ${modes.length} modes`);
  const rows = benchRows(fixtures, modes);
  const generatedAt = new Date().toISOString();
  const stem = `report-${args.group}`;
  writeJson(join(args.out, `${stem}.json`), { generatedAt, group: args.group, rows });
  writeCsv(join(args.out, `${stem}.csv`), rows);
  writeMarkdown(join(args.out, `${stem}.md`), {
    title: `MP5 Audio Quality Bench — ${args.group}`, generatedAt, rows,
    notes: [
      "Synthetic fixtures only; user-local --source files are never committed.",
      "MP5-C/MP5-H are lossy/hybrid: judge by quiet-window SNR + silence residual, not full-song SNR.",
    ],
  });
  console.error(`\nWrote ${stem}.{json,csv,md} to benchmarks/audio-quality/`);
  return rows;
}

async function cmdQualityReport(args) {
  const rows = await cmdBench({ ...args, group: args.group === "all" ? "all" : args.group });
  const generatedAt = new Date().toISOString();
  writeQualityReport(join(args.out, "QUALITY_REPORT.md"), { generatedAt, rows });
  console.error("Wrote QUALITY_REPORT.md to benchmarks/audio-quality/");
}

async function cmdExportListening(args) {
  const codec = await loadCodec();
  const all = buildModes(codec);
  const ids = LISTEN_SETS[args.set] ?? LISTEN_SETS.full;
  const modes = ids.map((id) => all.find((m) => m.id === id)).filter(Boolean);
  const local = args.source.length > 0;
  const fixtures = local ? loadSources(args.source) : listeningFixtures();
  const base = join(args.out, local ? "local-listening" : "listening");
  console.error(`Exporting listening set "${args.set}" — ${fixtures.length} ${local ? "local sources" : "fixtures"} × ${modes.length} modes (git-ignored)`);
  for (const fx of fixtures) {
    for (const mode of modes) {
      let dec;
      try { dec = mode.decode(mode.encode(fx.samples, fx.channels)); }
      catch (e) { console.error(`  ✗ ${fx.name}/${mode.id}: ${e}`); continue; }
      const frames = Math.min(fx.samples.length, dec.length);
      const fname = `${LISTEN_NAME[mode.id] ?? mode.id}.wav`;
      writeWavPcm16(join(base, fx.name, fname), dec.subarray(0, frames), fx.channels, fx.sampleRate);
    }
    console.error(`  ✓ ${fx.name} → ${join(base, fx.name)}`);
  }
  console.error(`\nListening WAVs under ${base} (not committed).`);
}

async function cmdNullTest(args) {
  const codec = await loadCodec();
  const all = buildModes(codec);
  const modes = all.filter((m) => ["mp5l", "mp5c-high", "mp5h-high", "mp5c2-lab"].includes(m.id));
  const fixtures = args.source.length ? loadSources(args.source) : allFixtures();
  const results = [];
  for (const fx of fixtures) {
    for (const mode of modes) {
      const dec = mode.decode(mode.encode(fx.samples, fx.channels));
      results.push({ fixture: fx.name, mode: mode.id, ...nullTest(fx.samples, dec, fx.channels, fx.sampleRate) });
    }
  }
  const generatedAt = new Date().toISOString();
  let md = "# MP5 Null-Test Report\n\n";
  md += `_Generated ${generatedAt}. Original PCM vs decoded output. Synthetic fixtures only._\n\n`;
  md += "| Fixture | Mode | Max diff | RMS diff | Non-zero | Digital silence | Worst windows (s @ maxdiff) |\n";
  md += "|---------|------|---------:|---------:|---------:|:---------------:|------------------------------|\n";
  for (const r of results) {
    const worst = r.worstWindows.map((w) => `${w.offsetSec}s@${w.maxDiff}`).join(", ");
    md += `| ${r.fixture} | ${r.mode} | ${r.maxDiff} | ${r.rmsDiff.toFixed(6)} | ${r.nonZeroSamples} | ${r.digitalSilence ? "✅" : "—"} | ${worst} |\n`;
  }
  md += "\n**Expected:** MP5-L → max diff 0 everywhere. MP5-H+CORR → max diff 0 (frame-padded). MP5-C → non-zero (lossy). MP5-C vNext → max diff 0 on silent/sustained-quiet fixtures.\n";
  writeJson(join(args.out, "null-test.json"), { generatedAt, results });
  writeFileSync(join(args.out, "NULL_TEST.md"), md);
  console.error("Wrote NULL_TEST.md + null-test.json to benchmarks/audio-quality/");
}

async function cmdInspect(args) {
  const codec = await loadCodec();
  gateSelfTest(codec);
  const files = expandMp5(args.files.length ? args.files : ["@config"], "all");
  if (!files.length) { console.error("No .mp5 files to inspect (pass --files ... or set referenceMp5/candidateMp5 in lab.config.json)."); return; }
  const entries = inspectFiles(codec, files);
  const md = writeInspectReport(entries);
  const out = join(args.out, "local", "IS_THIS_A_CULT_REFERENCE_REPORT.md");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md);
  console.error(`\nWrote ${out} (git-ignored, local only).`);
  for (const e of entries) console.error(`  ${e.file}: ${e.codecName} preset ${e.presetId} ${e.channels}ch ${e.durationSec.toFixed(1)}s ×PCM ${e.ratioVsPcm?.toFixed(3)} decode=${e.decodeOk ? "ok" : "FAIL"}`);
}

async function cmdCompare(args) {
  const codec = await loadCodec();
  gateSelfTest(codec);
  const refList = expandMp5(args.reference ? [args.reference] : ["@config"], "reference");
  if (!refList.length) throw new Error("No reference .mp5 (pass --reference r.mp5 or set referenceMp5 in lab.config.json).");
  const cands = expandMp5(args.candidates.length ? args.candidates : ["@config"], "candidate");
  if (!cands.length) throw new Error("No candidate .mp5 (pass --candidate/--candidates or set candidateMp5 in lab.config.json).");
  console.error(`Comparing ${cands.length} candidate(s) vs reference ${refList[0].split(/[\\/]/).pop()}`);
  const result = compareFiles(codec, refList[0], cands);
  const md = writeCompareReport(result);
  writeFileSync(join(args.out, "compare-report.md"), md);
  writeJson(join(args.out, "compare-report.json"), result);
  console.error(`\nWrote compare-report.{md,json} to benchmarks/audio-quality/ (git-ignored).`);
  for (const c of result.candidates) {
    if (c.error) console.error(`  ${c.file}: ERROR ${c.error}`);
    else if (c.skipped) console.error(`  ${c.file}: SKIPPED ${c.skipped}`);
    else console.error(`  ${c.file}: full ${num(c.metrics.fullSnrDb)} / quiet ${num(c.metrics.quietWindowSnrDb)} / tail ${num(c.hiss.tailSnrDb)} dB → hiss risk ${c.hissRisk}`);
  }
  return result;
}

async function cmdHissReport(args) {
  const codec = await loadCodec();
  gateSelfTest(codec);
  const modeIds = [
    "pcm",
    "mp5l",
    "mp5c-high",
    "mp5c-extreme",
    "mp5c2-extreme",
    "mp5c2-bandquiet-extreme",
    "mp5c2-smooth-nocoalesce-extreme",
    "mp5c2-smooth-extreme",
    "mp5c2-native-extreme",
    "mp5c2-shaped-extreme",
    "mp5h-high",
    "mp5h-extreme",
  ];
  const all = buildModes(codec);
  const modes = modeIds.map((id) => all.find((m) => m.id === id)).filter(Boolean);
  console.error(`Hiss report — ${modes.length} modes over synthetic fixtures`);
  const rows = buildHissRows(allFixtures(), modes);

  // optional local reference section
  let referenceResult = null;
  const refList = expandMp5(args.reference ? [args.reference] : ["@config"], "reference");
  const cands = expandMp5(args.candidates.length ? args.candidates : ["@config"], "candidate");
  if (refList.length && cands.length) {
    console.error(`  + local reference: ${cands.length} candidates vs ${refList[0].split(/[\\/]/).pop()}`);
    referenceResult = compareFiles(codec, refList[0], cands);
  } else {
    console.error("  (no local reference files — synthetic-only report)");
  }
  const generatedAt = new Date().toISOString();
  writeFileSync(join(args.out, "MP5C_HISS_REPORT.md"), writeHissReport({ generatedAt, rows, referenceResult }));
  writeJson(join(args.out, "mp5c-hiss-report.json"), { generatedAt, rows, referenceResult });
  console.error(`\nWrote MP5C_HISS_REPORT.md + mp5c-hiss-report.json to benchmarks/audio-quality/ (git-ignored).`);
}

async function cmdValidateVnextRef(args) {
  const codec = await loadCodec();
  gateSelfTest(codec);
  const { writeMp5, CodecId, parseMp5 } = await import("../../packages/mp5-container/dist/index.js");
  const refList = expandMp5(args.reference ? [args.reference] : ["@config"], "reference");
  if (!refList.length) {
    console.error("no local MP5-L reference (pass --reference or set referenceMp5 in lab.config.json) — skipping");
    return null;
  }
  const ref = refList[0];
  const buf = readFileSync(ref);
  const parsed = parseMp5(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const pcm = codec.decode_mp5l(parsed.audioFrames[0].data);
  const ch = parsed.head.channels;
  const frames = Number(parsed.head.totalSamples);
  const sr = parsed.head.sampleRate;
  console.error(`decoded ${pcm.length} samples, ${ch} ch, ${frames} frames from ${ref.split(/[\\/]/).pop()}`);
  // Phase 4.4: timeboxed protect-scale experiment (default + widened).
  const scales = [1.0, 1.25, 1.5, 2.0, 3.0];
  const hasProtect = typeof codec.encode_mp5c_vnext_protect === "function";
  mkdirSync(join(args.out, "local"), { recursive: true });
  const trials = [];
  for (const scale of scales) {
    const vnext = hasProtect
      ? codec.encode_mp5c_vnext_protect(pcm, ch, 3, scale)
      : codec.encode_mp5c_vnext(pcm, ch, 3);
    const outPath = join(
      args.out,
      "local",
      `vnext_extreme_protect_${String(scale).replace(".", "p")}.mp5`,
    );
    const bytes = writeMp5({
      head: {
        codecId: CodecId.MP5C2,
        channels: ch,
        bitsPerSample: 16,
        presetId: 3,
        sampleRate: sr,
        totalSamples: BigInt(frames),
        encoderVersion: 1,
      },
      meta: [],
      audioFrames: [{ frameIndex: 0, chunkType: 0, flags: 0, data: vnext }],
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      waveform: [],
      info: [{ key: "encoder", value: `mp5c2-vnext-extreme-protect-${scale}` }],
    });
    writeFileSync(outPath, bytes);
    const ratio = bytes.length / (pcm.length * 2);
    const result = compareFiles(codec, ref, [outPath]);
    const c = result.candidates[0];
    const trial = {
      protectScale: scale,
      hissRisk: c.hissRisk,
      fullSnrDb: c.metrics?.fullSnrDb,
      quietWindowSnrDb: c.metrics?.quietWindowSnrDb,
      tailSnrDb: c.hiss?.tailSnrDb,
      contentBitExact: c.metrics?.contentBitExact,
      ratioVsPcm: ratio,
      bytes: bytes.length,
      error: c.error,
    };
    trials.push(trial);
    console.error(
      `  protect=${scale}: tail=${num(trial.tailSnrDb, 1)} dB risk=${trial.hissRisk} size=${ratio.toFixed(3)}x PCM`,
    );
    if (!hasProtect) break;
  }
  const tailScore = (t) => {
    if (t.hissRisk === "low") return 1e9;
    const v = t.tailSnrDb;
    if (v === "inf" || v === Infinity) return 1e8;
    return typeof v === "number" ? v : -1;
  };
  const best = [...trials].sort((a, b) => tailScore(b) - tailScore(a))[0];
  const reachedLow = trials.some(
    (t) => t.hissRisk === "low" || t.tailSnrDb === "inf" || (typeof t.tailSnrDb === "number" && t.tailSnrDb >= 40),
  );
  const summary = {
    reachedLow,
    best,
    trials,
    verdict: reachedLow
      ? "green: real-track tail >=40 dB / hiss risk low"
      : "wall: cannot reach >=40 dB tail SNR without documenting size cost; stop size-tuning until redesign",
  };
  console.log(JSON.stringify(summary, null, 2));
  writeJson(join(args.out, "vnext-real-track-gate.json"), summary);
  return summary;
}

function num(v, d = 1) {
  if (v === null || v === undefined) return "—";
  if (v === "inf") return "∞";
  return typeof v === "number" ? v.toFixed(d) : String(v);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] ?? "bench";
  try {
    if (cmd === "bench") await cmdBench(args);
    else if (cmd === "quality-report") await cmdQualityReport(args);
    else if (cmd === "export-listening") await cmdExportListening(args);
    else if (cmd === "null-test") await cmdNullTest(args);
    else if (cmd === "inspect") await cmdInspect(args);
    else if (cmd === "compare-files" || cmd === "compare-set" || cmd === "compare") await cmdCompare(args);
    else if (cmd === "hiss-report") await cmdHissReport(args);
    else if (cmd === "validate-vnext-ref") await cmdValidateVnextRef(args);
    else { console.error(`Unknown command: ${cmd}`); process.exit(2); }
  } catch (e) {
    console.error(`audio-lab error: ${e.message ?? e}`);
    process.exit(1);
  }
}

main();
