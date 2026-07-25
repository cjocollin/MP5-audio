import {
  CodecId,
  parseMp5,
  validateParsedFile,
  writeMp5,
  type CodecIdValue,
} from "@mp5/container";
import { convertToMp5, type OutputCodec } from "./convertToMp5";
import { buildExportMetadataBundle, type ExportMetadataBundle } from "./buildExportBundles";
import { generateWaveform } from "./generateWaveform";
import type { ManualMetadataEdits } from "./manualMetadata";
import { buildOverridesFromEdits } from "./manualMetadata";
import type { SourceMetadata } from "./extractSourceMetadata";
import { encodeStemsForExport } from "./encodeStems";
import type { PendingStemPcm } from "./stemValidation";
import { attachFingerprintOptional } from "../lib/fingerprint/build";
import { encodeMp5lV4Progressive } from "./encodeMp5lV4Progressive";
import { getCodec, isWasmCodecReady } from "../wasm/codec";

export type ExportPhase =
  | "building-waveform"
  | "encoding"
  | "writing-metadata"
  | "validating"
  | "ready";

export const EXPORT_PHASE_LABELS: Record<ExportPhase, string> = {
  "building-waveform": "Building waveform and seek data…",
  encoding: "Encoding MP5-L v4…",
  "writing-metadata": "Writing metadata chunks…",
  validating: "Validating exported MP5…",
  ready: "Ready to download",
};

/** Approximate overall progress when each phase begins. Encoding is the long pole. */
export const EXPORT_PHASE_PERCENT: Record<ExportPhase, number> = {
  "building-waveform": 8,
  "writing-metadata": 20,
  encoding: 35,
  validating: 85,
  ready: 100,
};

export const LOAD_PHASE_LABELS = {
  decoding: "Decoding source audio…",
  extracting: "Extracting metadata…",
} as const;

export interface ExportPipelineInput {
  pcm: { samples: Int16Array; sampleRate: number; channels: number };
  extracted: SourceMetadata;
  edits: ManualMetadataEdits;
  codec: OutputCodec;
  preset: number;
  sourceBytes?: number;
  stems?: PendingStemPcm[];
}

export interface ExportPipelineResult {
  mp5: Uint8Array;
  bundle: ExportMetadataBundle;
  exportCodec: OutputCodec;
  fingerprintWarning?: string;
}

function phaseLabel(codec: OutputCodec, phase: ExportPhase): string {
  if (phase === "encoding" && codec === "mp5l_v4") {
    return "Encoding MP5-L v4 (lossless · bit-exact · no silent v3 fallback)…";
  }
  if (phase === "encoding" && codec === "mp5l") {
    return "Encoding MP5-L v3 (lossless · lab/legacy)…";
  }
  if (phase === "encoding" && codec === "pcm") {
    return "Encoding PCM reference export…";
  }
  if (phase === "encoding") {
    return `Encoding ${codec.toUpperCase()}…`;
  }
  return EXPORT_PHASE_LABELS[phase];
}

/** Lets the browser paint between phases when the pipeline runs on the main thread. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function runExportPipeline(
  input: ExportPipelineInput,
  onPhase: (phase: ExportPhase, label: string, percent: number) => void,
): Promise<ExportPipelineResult> {
  const report = (phase: ExportPhase, label?: string) => {
    onPhase(phase, label ?? phaseLabel(input.codec, phase), EXPORT_PHASE_PERCENT[phase]);
    return yieldToEventLoop();
  };

  await report("building-waveform");
  const wave = generateWaveform(input.pcm.samples, input.pcm.channels);
  const overrides = buildOverridesFromEdits(input.edits);
  const bundle = buildExportMetadataBundle(input.extracted, overrides, {
    peak: wave.peak,
    rms: wave.rms,
  });

  await report("writing-metadata");

  let optional = bundle.optional;
  let extraChunks: { fourcc: string; payload: Uint8Array }[] | undefined;
  let fingerprintWarning: string | undefined;

  const hasStems = !!input.stems?.length;
  const stemPromise = hasStems
    ? encodeStemsForExport(input.stems!, {
        samples: input.pcm.samples,
        sampleRate: input.pcm.sampleRate,
        channels: input.pcm.channels,
      })
    : null;

  await report("encoding");

  let mp5: Uint8Array;

  // Default L v4 + stems: encode mix ∥ stems, then one container write.
  if (input.codec === "mp5l_v4" && stemPromise && isWasmCodecReady()) {
    const codec = await getCodec();
    const ch = input.pcm.channels;
    const [stemResult, bitstream] = await Promise.all([
      stemPromise,
      Promise.resolve(
        encodeMp5lV4Progressive(codec, input.pcm.samples, ch, (done, total) => {
          if (total > 0) {
            const pct =
              EXPORT_PHASE_PERCENT.encoding +
              Math.floor((done / total) * (EXPORT_PHASE_PERCENT.validating - EXPORT_PHASE_PERCENT.encoding - 1));
            onPhase("encoding", phaseLabel(input.codec, "encoding"), pct);
          }
        }),
      ),
    ]);
    optional = new Map(optional);
    for (const [k, v] of stemResult.optional) optional.set(k, v);
    extraChunks = stemResult.extraChunks;
    if (stemResult.warnings.length) {
      fingerprintWarning = stemResult.warnings.join(" ");
    }
    if (bitstream.length < 2 || bitstream[0] !== 0x4c || bitstream[1] !== 4) {
      throw new Error(
        "MP5-L v4 encode failed — no v3 fallback by design. " +
          "Retry as MP5-L v3 (lab) for a legacy lossless file.",
      );
    }
    const totalSamples = BigInt(Math.floor(input.pcm.samples.length / ch));
    mp5 = writeMp5({
      head: {
        codecId: CodecId.MP5L as CodecIdValue,
        channels: ch,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: input.pcm.sampleRate,
        totalSamples,
        encoderVersion: 1,
      },
      meta: bundle.metaFields,
      cover: bundle.cover,
      audioFrames: [{ frameIndex: 0, streamType: 0, flags: 0, data: bitstream }],
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      waveform: wave.peaks,
      info: [{ key: "encoder", value: "MP5-L WASM v4 (lossless · default · bit-exact)" }],
      optional,
      extraChunks,
    });
  } else {
    if (stemPromise) {
      const stemResult = await stemPromise;
      optional = new Map(optional);
      for (const [k, v] of stemResult.optional) optional.set(k, v);
      extraChunks = stemResult.extraChunks;
      if (stemResult.warnings.length) {
        fingerprintWarning = stemResult.warnings.join(" ");
      }
    }
    mp5 = await convertToMp5({
      samples: input.pcm.samples,
      sampleRate: input.pcm.sampleRate,
      channels: input.pcm.channels,
      codec: input.codec,
      preset: input.preset,
      metaFields: bundle.metaFields,
      cover: bundle.cover,
      optional,
      extraChunks,
      waveformPeaks: wave.peaks,
      onEncodeProgress: (done, total) => {
        if (total > 0) {
          const pct =
            EXPORT_PHASE_PERCENT.encoding +
            Math.floor((done / total) * (EXPORT_PHASE_PERCENT.validating - EXPORT_PHASE_PERCENT.encoding - 1));
          onPhase("encoding", phaseLabel(input.codec, "encoding"), pct);
        }
      },
    });
  }

  await report("validating");
  let validated = parseMp5(mp5);
  // parseMp5 already validates structure; keep a light check for writer bugs.
  validateParsedFile(validated, 16);

  if (input.codec === "mp5l" || input.codec === "mp5l_v4") {
    const fpOptional = new Map(optional);
    const fpNote = await attachFingerprintOptional(fpOptional, {
      parsed: validated,
      fileBytes: mp5,
      pcmSamples: input.pcm.samples,
      pcmChannels: input.pcm.channels,
    });
    if (fpNote.warning) {
      fingerprintWarning = fingerprintWarning
        ? `${fingerprintWarning} ${fpNote.warning}`
        : fpNote.warning;
    } else if (fpOptional.has("FING")) {
      // One rewrite with FING/HASH; skip a second parse+validate (writer is trusted here).
      mp5 = writeMp5({
        head: validated.head!,
        meta: validated.meta,
        cover: validated.coverArt,
        audioFrames: validated.audioFrames,
        seek: validated.seek,
        waveform: validated.waveform,
        info: validated.info,
        corr: validated.corr,
        optional: fpOptional,
        extraChunks: validated.stdfFragments.map((payload) => ({
          fourcc: "STDF",
          payload,
        })),
      });
    }
  }

  await report("ready", "Export complete — ready to download");

  return { mp5, bundle, exportCodec: input.codec, fingerprintWarning };
}
