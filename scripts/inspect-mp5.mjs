#!/usr/bin/env node
/**
 * Inspect an .mp5 file (human-readable).
 * Usage: pnpm inspect:mp5 <path-to-file.mp5>
 */
import { readFileSync, statSync, existsSync } from "fs";
import { basename, resolve } from "path";
import { parseMp5, CodecId } from "../packages/mp5-container/dist/index.js";

const PRESET_NAMES = ["Low", "Standard", "High", "Extreme"];
const CODEC_NAMES = {
  [CodecId.PCM]: "PCM",
  [CodecId.MP5C]: "MP5-C",
  [CodecId.MP5L]: "MP5-L",
  [CodecId.MP5H]: "MP5-H",
};

const DECODE_PATH = {
  [CodecId.PCM]: "PCM (container passthrough)",
  [CodecId.MP5C]: "MP5-C WASM decode (experimental)",
  [CodecId.MP5L]: "MP5-L WASM decode",
  [CodecId.MP5H]: "MP5-H WASM decode",
};

function mp5cVersion(audi) {
  if (!audi?.length || audi[0] !== 0x43) return "n/a";
  const v = audi[1];
  if (v === 2) return "v2 (legacy)";
  if (v === 3) return "v3 (mid/side, fixed step)";
  if (v === 4) return "v4 (current — L/R + adaptive step)";
  return `unknown (${v})`;
}

function listChunks(parsed) {
  const chunks = ["HEAD"];
  if (parsed.meta?.length) chunks.push("META");
  if (parsed.cover?.length) chunks.push("COVR");
  if (parsed.audioFrames?.length) chunks.push("AUDI");
  if (parsed.seek?.length) chunks.push("SEEK");
  if (parsed.waveform?.length) chunks.push("WAVE");
  if (parsed.info?.length) chunks.push("INFO");
  if (parsed.corr?.length) chunks.push("CORR");
  for (const k of parsed.optional?.keys?.() ?? []) chunks.push(k);
  return chunks;
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: pnpm inspect:mp5 <path-to-file.mp5>");
    process.exit(1);
  }
  const path = resolve(arg);
  if (!existsSync(path)) {
    console.error("File not found:", path);
    process.exit(1);
  }

  const buf = readFileSync(path);
  const parsed = parseMp5(buf);
  const head = parsed.head;
  if (!head) {
    console.error("Missing HEAD chunk");
    process.exit(1);
  }

  const audi = parsed.audioFrames[0]?.data;
  const encoder = parsed.info.find((i) => i.key === "encoder")?.value ?? "(none)";
  const pcmBytes = Number(head.totalSamples) * head.channels * (head.bitsPerSample / 8);
  const duration = Number(head.totalSamples) / head.sampleRate;
  const ratio = buf.length / pcmBytes;

  console.log("");
  console.log("MP5 Inspector");
  console.log("=============");
  console.log("File:", path);
  console.log("Name:", basename(path));
  console.log("File size:", buf.length, "bytes");
  console.log("");
  console.log("Container");
  console.log("  Magic: MP5A");
  console.log("  Chunks:", listChunks(parsed).join(", "));
  console.log("");
  console.log("HEAD");
  console.log("  codec_id:", head.codecId, `(${CODEC_NAMES[head.codecId] ?? "?"})`);
  console.log("  preset:", head.presetId, `(${PRESET_NAMES[head.presetId] ?? "—"})`);
  console.log("  sample_rate:", head.sampleRate, "Hz");
  console.log("  channels:", head.channels);
  console.log("  bit_depth:", head.bitsPerSample);
  console.log("  total_samples:", head.totalSamples.toString());
  console.log("  duration:", duration.toFixed(2), "s");
  console.log("");
  console.log("AUDI");
  console.log("  payload size:", audi?.length ?? 0, "bytes");
  if (audi?.length) {
    console.log(
      "  magic bytes:",
      Array.from(audi.slice(0, 8))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
    );
    if (head.codecId === CodecId.MP5C) {
      console.log("  MP5-C bitstream version:", mp5cVersion(audi));
      const kind =
        audi[0] === 0x43 && (audi[1] === 2 || audi[1] === 3)
          ? `MP5-C ${mp5cVersion(audi)} bitstream`
          : "unexpected MP5-C header";
      console.log("  payload kind:", kind);
    } else if (head.codecId === CodecId.PCM) {
      console.log("  payload kind: raw PCM");
    }
  }
  console.log("");
  console.log("INFO");
  console.log("  encoder:", encoder);
  console.log("");
  console.log("Compression (vs estimated PCM in container)");
  console.log("  estimated PCM:", pcmBytes, "bytes");
  console.log("  file / PCM ratio:", ratio.toFixed(4));
  console.log("");
  console.log("Player decode path:", DECODE_PATH[head.codecId] ?? "unknown");
  if (head.codecId === CodecId.MP5C && audi?.[1] === 2) {
    console.log("");
    console.log("Note: v2 bitstream — current encoder uses v3. Playback supported via legacy decode.");
  }
  console.log("");
}

main();
