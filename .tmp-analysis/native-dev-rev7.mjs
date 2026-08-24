import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CORPUS_DIR, corpusAbsolutePath, loadManifest } from "../tools/audio-lab/corpus.mjs";
import { decodeToPcm } from "../tools/audio-lab/pcm.mjs";

const old = JSON.parse(readFileSync(".tmp-analysis/abr128-dev-calibration.json", "utf8"));
const excerptDoc = JSON.parse(readFileSync("benchmarks/real-music/excerpts.json", "utf8"));
const manifest = loadManifest();
const excerpts = new Map(excerptDoc.excerpts.map((row) => [row.id, row]));
const tracks = new Map(manifest.tracks.map((row) => [row.id, row]));
const inPath = ".tmp-analysis/native-dev-rev7-in.raw";
const outPath = ".tmp-analysis/native-dev-rev7-out.raw";
const streamPath = ".tmp-analysis/native-dev-rev7.c6stream";

function samplesOf(path) {
  const bytes = readFileSync(path);
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

function snrDb(source, decoded) {
  let signal = 0;
  let error = 0;
  for (let i = 0; i < source.length; i++) {
    signal += source[i] * source[i];
    const delta = source[i] - decoded[i];
    error += delta * delta;
  }
  return 10 * Math.log10(signal / Math.max(error, 1e-12));
}

const rows = [];
try {
  for (const prior of old.rows) {
    const excerpt = excerpts.get(prior.id);
    const track = excerpt && tracks.get(excerpt.sourceId);
    if (!excerpt || !track || track.role !== "dev") throw new Error(`unsealed dev excerpt missing: ${prior.id}`);
    const pcm = decodeToPcm(corpusAbsolutePath(track, CORPUS_DIR), {
      startSec: excerpt.startSec,
      durationSec: excerpt.durationSec,
    });
    if (pcm.channels !== 2) throw new Error(`${prior.id}: expected stereo, got ${pcm.channels}`);
    writeFileSync(inPath, Buffer.from(pcm.samples.buffer, pcm.samples.byteOffset, pcm.samples.byteLength));
    execFileSync(
      join(process.cwd(), "target/release/c6_ab.exe"),
      [inPath, outPath, "2", String(pcm.sampleRate), "1", "1", "1", streamPath],
      {
        env: { ...process.env, C6_ABR: "128", C6_PROTECT_SCALE: "1.1" },
        stdio: "ignore",
      },
    );
    const decoded = samplesOf(outPath);
    const stream = readFileSync(streamPath);
    const value = snrDb(pcm.samples, decoded);
    rows.push({
      id: prior.id,
      encoderRevision: stream.readUInt16LE(18),
      rev6SnrDb: prior.snrDb,
      rev7SnrDb: value,
      deltaDb: value - prior.snrDb,
    });
    console.log(`${prior.id}: ${value.toFixed(6)} dB (${(value - prior.snrDb).toFixed(6)} dB)`);
  }
} finally {
  for (const path of [inPath, outPath, streamPath]) {
    try { unlinkSync(path); } catch {}
  }
}

const deltas = rows.map((row) => row.deltaDb).sort((a, b) => a - b);
const result = {
  label: "rev7-protect-ledger-joint-energy256-high-native",
  heldOutUsed: false,
  rows,
  meanDeltaDb: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
  medianDeltaDb: deltas[Math.floor(deltas.length / 2)],
  minimumDeltaDb: deltas[0],
  maximumDeltaDb: deltas.at(-1),
};
writeFileSync(".tmp-analysis/abr128-dev-rev7-native.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
