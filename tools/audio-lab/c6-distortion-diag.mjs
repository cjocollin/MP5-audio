// Distortion diagnostic: compare C6 encode configurations across fixtures to
// isolate what the "distorted / stripped / filtered out" reports come from.
//
// Configs: p2 (no js/win/psycho), p3 default (js+win), p3 no-joint (win only),
// p3+psycho (js+win+psycho). Metrics: bytes, fullSnrDb, quietWindowSnrDb,
// worst1sSnrDb, sideSnrDb (stereo side-channel), trimmed-max NMR.
import { loadCodec } from "./wasm.mjs";
import { computeMetrics } from "./metrics.mjs";
import { allKillers } from "./killers.mjs";
import { loadManifest, CORPUS_DIR } from "./corpus.mjs";
import { decodeToPcm } from "./pcm.mjs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const codec = await loadCodec();
const SR = 44100;

function sideSnrDb(src, dec) {
  const n = Math.min(src.length, dec.length) >> 1;
  let sig = 0, err = 0;
  for (let i = 0; i < n; i++) {
    const s = (src[i * 2] - src[i * 2 + 1]) / 2;
    const d = (dec[i * 2] - dec[i * 2 + 1]) / 2;
    sig += s * s;
    err += (s - d) * (s - d);
  }
  return err < 1e-12 ? Infinity : 10 * Math.log10(sig / err);
}

const configs = {
  p2: (s, ch, sr) => codec.encode_mp5c6_opt(s, ch, 2, sr, 0, 0, false, false, false),
  p3_default: (s, ch, sr) => codec.encode_mp5c6(s, ch, 2, sr),
  p3_win_only: (s, ch, sr) => codec.encode_mp5c6_opt(s, ch, 2, sr, 0, 0, false, true, false),
  p3_joint_only: (s, ch, sr) => codec.encode_mp5c6_opt(s, ch, 2, sr, 0, 0, true, false, false),
  p3_psycho: (s, ch, sr) => codec.encode_mp5c6_opt(s, ch, 2, sr, 0, 0, true, true, true),
};

const fixtures = [];
for (const k of allKillers()) {
  fixtures.push({ id: k.name, samples: k.samples, channels: k.channels, sampleRate: k.sampleRate });
}
// A few quiet/HF-heavy dev excerpts for real-music evidence.
try {
  const manifest = loadManifest();
  const doc = JSON.parse(readFileSync(join(process.cwd(), "benchmarks/real-music/excerpts.json"), "utf8"));
  const byId = new Map(manifest.tracks.map((t) => [t.id, t]));
  for (const id of ["ex_reverb_tails", "ex_cymbals_hats", "ex_vocals", "ex_sparse_quiet", "ex_wide_stereo"]) {
    const ex = doc.excerpts.find((e) => e.id === id);
    const track = ex && byId.get(ex.sourceId);
    if (!track) continue;
    const abs = join(CORPUS_DIR, ...track.relativePath.replace(/\\/g, "/").split("/"));
    if (!existsSync(abs)) continue;
    const pcm = decodeToPcm(abs, { startSec: ex.startSec, durationSec: ex.durationSec });
    if (pcm.samples.length) {
      fixtures.push({ id, samples: pcm.samples, channels: pcm.channels, sampleRate: pcm.sampleRate });
    }
  }
} catch (e) {
  console.error("dev excerpts unavailable:", e.message);
}

console.log(
  "fixture".padEnd(26),
  "config".padEnd(14),
  "bytes".padStart(8),
  "fullSnr".padStart(8),
  "quietSnr".padStart(9),
  "worst1s".padStart(8),
  "sideSnr".padStart(8),
  "nmrTrim".padStart(8),
);
for (const f of fixtures) {
  const dur = f.samples.length / f.channels / f.sampleRate;
  for (const [name, enc] of Object.entries(configs)) {
    const stream = enc(f.samples, f.channels, f.sampleRate);
    const dec = codec.decode_mp5c6(stream);
    const m = computeMetrics(f.samples, dec, f.channels, f.sampleRate);
    const nmr = JSON.parse(codec.nmr_screen_wasm(f.samples, dec, f.channels, f.sampleRate));
    const fmt = (v, w) =>
      (v == null ? "n/a" : v === Infinity ? "inf" : v.toFixed(1)).padStart(w);
    console.log(
      f.id.padEnd(26),
      name.padEnd(14),
      String(stream.length).padStart(8),
      fmt(m.fullSnrDb, 8),
      fmt(m.quietWindowSnrDb, 9),
      fmt(m.worst1sSnrDb, 8),
      fmt(sideSnrDb(f.samples, dec), 8),
      fmt(nmr.trimmed_max_nmr_db ?? nmr.maxNmrDb, 8),
    );
  }
  console.log("-".repeat(90));
  void dur;
}
