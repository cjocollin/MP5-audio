import { readFileSync, writeFileSync } from "node:fs";
import { loadCodec } from "../tools/audio-lab/wasm.mjs";

const sampleRate = 48_000;
const channels = 2;
const sourceBytes = readFileSync(".tmp-analysis/src48.raw");
const source = new Int16Array(
  sourceBytes.buffer,
  sourceBytes.byteOffset,
  sourceBytes.byteLength / 2,
);
const codec = await loadCodec();
const dipStart = 8 * sampleRate * channels;
const dipEnd = 8.75 * sampleRate * channels;
const durationSeconds = source.length / channels / sampleRate;
const tiers = [];
let referenceNmr;
let encoderRevision;
for (const targetKbps of [128, 192, 320]) {
  const stream = codec.encode_mp5c6_at(source, channels, 2, sampleRate, targetKbps, 1);
  const revision = stream[18] | (stream[19] << 8);
  encoderRevision ??= revision;
  if (revision !== encoderRevision) throw new Error("encoder revision changed between tiers");
  const decoded = codec.decode_mp5c6(stream);
  let signal = 0;
  let error = 0;
  let dipError = 0;
  for (let i = 0; i < source.length; i++) {
    signal += source[i] * source[i];
    const delta = source[i] - decoded[i];
    error += delta * delta;
    if (i >= dipStart && i < dipEnd) dipError += delta * delta;
  }
  tiers.push({
    targetKbps,
    streamBytes: stream.length,
    measuredKbps: stream.length * 8 / durationSeconds / 1000,
    fullSnrDb: 10 * Math.log10(signal / Math.max(error, 1e-12)),
    quietDipErrorDbfs: 10 * Math.log10(
      Math.max(dipError / (dipEnd - dipStart), 1e-12) / (32768 * 32768),
    ),
  });
  if (targetKbps === 128) {
    referenceNmr = JSON.parse(codec.nmr_screen_wasm(source, decoded, channels, sampleRate));
    writeFileSync(".tmp-analysis/mp5c6-rev7-final-abr128.c6stream", stream);
    writeFileSync(
      ".tmp-analysis/mp5c6-rev7-final-abr128.raw",
      new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength),
    );
  }
}

const tier128 = tiers[0];
const summary = {
  encoderRevision,
  implementation: "shipping WASM encode_mp5c6_at",
  sampleRate,
  channels,
  durationSeconds,
  ...tier128,
  tiers,
  referenceNmr,
  nmrPass: null,
  nmrPassBasis: "pending permanent Rust NMR regression screens; full-reference max/mean are informational",
  heldOutUsed: false,
};

writeFileSync(
  ".tmp-analysis/abr128-final-rev7-summary.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
