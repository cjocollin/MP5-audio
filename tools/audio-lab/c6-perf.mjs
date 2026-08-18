#!/usr/bin/env node
// Phase 7 C6 perf budget measurement (desktop proxy; browser worker numbers
// are expected to be within ~2x of these — recorded, not assumed).
//
// Budgets (plan, Phase 7): decode >= 10x RT desktop / >= 3x lower-tier;
// encode >= 2x RT @320; peak memory budget; first audio < 250 ms with index.
//
// Usage: node tools/audio-lab/c6-perf.mjs [--out path.json] [--seconds 6]
import { cpus, platform, arch, totalmem } from "node:os";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadCodec, REPO_ROOT } from "./wasm.mjs";

const DEFAULT_OUT = join(REPO_ROOT, "benchmarks", "audio-quality", "c6-perf.json");

function parseArgs(argv) {
  const out = { out: DEFAULT_OUT, seconds: 6 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out.out = argv[++i];
    else if (argv[i] === "--seconds") out.seconds = Number(argv[++i]);
    else throw new Error("unknown arg: " + argv[i]);
  }
  return out;
}

/** Dense-ish stereo signal (busy enough that rate control is constrained). */
function signal(frames, ch) {
  const out = new Int16Array(frames * ch);
  let rng = 0x13579bdf;
  for (let i = 0; i < frames; i++) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const n = ((rng >>> 8) / 2 ** 24 - 0.5) * 5000;
    const v = Math.sin(i * 0.061) * 9000 + Math.sin(i * 0.013) * 6000 + Math.sin(i * 0.111) * 2500 + n;
    const q = Math.max(-32768, Math.min(32767, Math.round(v)));
    for (let c = 0; c < ch; c++) out[i * ch + c] = q * (c === 0 ? 1 : 0.9);
  }
  return out;
}

function bench(fn, iters) {
  // warmup
  fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return (performance.now() - t0) / iters;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const codec = await loadCodec();
  const SR = 44100;
  const frames = SR * args.seconds;
  const src = signal(frames, 2);
  const seconds = frames / SR;

  const mem0 = process.memoryUsage().heapUsed;

  const encDefaultMs = bench(
    () => codec.encode_mp5c6(src, 2, 2, SR),
    5,
  );
  const enc320Ms = bench(
    () => codec.encode_mp5c6_at(src, 2, 2, SR, 320, 1),
    5,
  );
  const stream = codec.encode_mp5c6(src, 2, 2, SR);
  const decMs = bench(() => codec.decode_mp5c6(stream), 10);
  const seekMs = bench(() => codec.decode_mp5c6_range(stream, 1024 * 5, 1024 * 2), 20);

  const mem1 = process.memoryUsage().heapUsed;
  const peakMemEstimateBytes = Math.max(0, mem1 - mem0) + stream.length * 8;

  const cpu = cpus()?.[0];
  const result = {
    schema: "mp5.c6-perf.v1",
    measuredAt: new Date().toISOString(),
    machine: {
      os: platform() + " " + arch(),
      cpuModel: cpu?.model ?? null,
      cpuCount: cpus()?.length ?? null,
      memoryBytes: totalmem(),
      nodeVersion: process.version,
      note: "Node+WASM desktop proxy; browser worker not directly measured",
    },
    gitCommit: (() => {
      try {
        return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
      } catch {
        return null;
      }
    })(),
    signalSeconds: seconds,
    streamBytes: stream.length,
    encodeDefaultMs: encDefaultMs,
    encodeAbr320Ms: enc320Ms,
    decodeMs: decMs,
    seekFirstAudioMs: seekMs,
    realtime: {
      encodeDefault: (seconds * 1000) / encDefaultMs,
      encodeAbr320: (seconds * 1000) / enc320Ms,
      decode: (seconds * 1000) / decMs,
    },
    peakMemEstimateBytes,
    budgets: {
      encode2xRt320: { required: 2.0, measured: (seconds * 1000) / enc320Ms, pass: (seconds * 1000) / enc320Ms >= 2.0 },
      decode10xRtDesktop: { required: 10.0, measured: (seconds * 1000) / decMs, pass: (seconds * 1000) / decMs >= 10.0 },
      firstAudio250ms: { required: 250, measured: seekMs, pass: seekMs <= 250 },
    },
  };

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result.realtime, null, 2));
  console.log("budgets:", JSON.stringify(result.budgets, null, 2));
  console.log("wrote " + args.out);
  const failed = Object.values(result.budgets).some((b) => !b.pass);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
