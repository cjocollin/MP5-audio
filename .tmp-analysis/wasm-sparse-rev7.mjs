import { readFileSync } from "node:fs";
import { CORPUS_DIR, corpusAbsolutePath, loadManifest } from "../tools/audio-lab/corpus.mjs";
import { decodeToPcm } from "../tools/audio-lab/pcm.mjs";
import { loadCodec } from "../tools/audio-lab/wasm.mjs";

const excerpt = JSON.parse(readFileSync("benchmarks/real-music/excerpts.json", "utf8"))
  .excerpts.find((row) => row.id === "ex_sparse_quiet");
const track = loadManifest().tracks.find((row) => row.id === excerpt.sourceId);
if (!track || track.role !== "dev") throw new Error("ex_sparse_quiet is not an unsealed dev row");
const pcm = decodeToPcm(corpusAbsolutePath(track, CORPUS_DIR), {
  startSec: excerpt.startSec,
  durationSec: excerpt.durationSec,
});
const codec = await loadCodec();
const stream = codec.encode_mp5c6_at(pcm.samples, pcm.channels, 2, pcm.sampleRate, 128, 1);
const decoded = codec.decode_mp5c6(stream);
let signal = 0;
let error = 0;
for (let i = 0; i < pcm.samples.length; i++) {
  signal += pcm.samples[i] * pcm.samples[i];
  const delta = pcm.samples[i] - decoded[i];
  error += delta * delta;
}
console.log(JSON.stringify({
  encoderRevision: stream[18] | (stream[19] << 8),
  bytes: stream.length,
  snrDb: 10 * Math.log10(signal / error),
}, null, 2));
