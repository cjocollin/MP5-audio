import { parseMp5, validateParsedFile, writeMp5 } from "@mp5/container";
import { convertToMp5, type OutputCodec } from "./convertToMp5";
import { buildExportMetadataBundle, type ExportMetadataBundle } from "./buildExportBundles";
import { generateWaveform } from "./generateWaveform";
import type { ManualMetadataEdits } from "./manualMetadata";
import { buildOverridesFromEdits } from "./manualMetadata";
import type { SourceMetadata } from "./extractSourceMetadata";
import { encodeStemsForExport } from "./encodeStems";
import type { PendingStemPcm } from "./stemValidation";
import { attachFingerprintOptional } from "../lib/fingerprint/build";

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
  if (input.stems?.length) {
    const stemResult = await encodeStemsForExport(input.stems, {
      samples: input.pcm.samples,
      sampleRate: input.pcm.sampleRate,
      channels: input.pcm.channels,
    });
    optional = new Map(optional);
    for (const [k, v] of stemResult.optional) optional.set(k, v);
    extraChunks = stemResult.extraChunks;
    if (stemResult.warnings.length) {
      fingerprintWarning = stemResult.warnings.join(" ");
    }
  }

  await report("encoding");
  let mp5 = await convertToMp5({
    samples: input.pcm.samples,
    sampleRate: input.pcm.sampleRate,
    channels: input.pcm.channels,
    codec: input.codec,
    preset: input.preset,
    metaFields: bundle.metaFields,
    cover: bundle.cover,
    optional,
    extraChunks,
  });

  await report("validating");
  let validated = parseMp5(mp5);
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
      validated = parseMp5(mp5);
      validateParsedFile(validated, 16);
    }
  }

  await report("ready", "Export complete — ready to download");

  return { mp5, bundle, exportCodec: input.codec, fingerprintWarning };
}
