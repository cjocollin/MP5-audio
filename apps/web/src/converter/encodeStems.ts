import {
  buildStemOptionalChunks,
  type StemBundleInput,
  type StemExportSizeReport,
  type StemType,
} from "@mp5/container";
import { CodecId } from "@mp5/container";
import { getCodec, isWasmCodecReady } from "../wasm/codec";
import { Mp5SecurityError } from "@mp5/container";
import type { PendingStemPcm } from "./stemValidation";
import { USER_ERRORS } from "../lib/userFacingErrors";

export interface EncodeStemsResult {
  optional: Map<string, Uint8Array>;
  extraChunks: { fourcc: string; payload: Uint8Array }[];
  warnings: string[];
  report?: StemExportSizeReport;
}

export async function encodeStemsForExport(
  stems: PendingStemPcm[],
): Promise<EncodeStemsResult> {
  if (!stems.length) {
    return { optional: new Map(), extraChunks: [], warnings: [] };
  }

  const wasmReady = isWasmCodecReady();
  const warnings: string[] = [];
  if (!wasmReady) {
    warnings.push("WASM unavailable — stems stored as PCM reference (larger files).");
  }

  const codec = wasmReady ? await getCodec() : null;
  const bundles: StemBundleInput[] = [];

  for (const stem of stems) {
    const ch = stem.channels;
    let frameData: Uint8Array;
    let codecId: number;

    if (wasmReady && codec) {
      frameData = codec.encode_mp5l(stem.samples, ch);
      codecId = CodecId.MP5L;
    } else {
      frameData = new Uint8Array(stem.samples.buffer, stem.samples.byteOffset, stem.samples.byteLength);
      codecId = CodecId.PCM;
    }

    const durationSamples = Math.floor(stem.samples.length / ch);
    bundles.push({
      stemId: stem.id,
      stemName: stem.name.trim() || stem.fileName,
      stemType: stem.stemType as StemType,
      codecId,
      sampleRate: stem.sampleRate,
      channels: ch,
      durationSamples,
      frameData,
      defaultVolume: stem.defaultVolume,
      explicitContent: stem.explicitContent,
    });
  }

  try {
    const { optional, extraChunks, report } = buildStemOptionalChunks(bundles);
    if (report.chosenStorage === "stdf-v1") {
      warnings.push(
        `Large embedded stems (~${Math.round(report.totalStemFrameBytes / (1024 * 1024))} MB) — using segmented STDF storage (${report.fragmentCount} fragments).`,
      );
    }
    return { optional, extraChunks, warnings, report };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof Mp5SecurityError || /Chunk payload exceeds|67108864/i.test(msg)) {
      throw new Error(USER_ERRORS.stemChunkTooLarge);
    }
    throw e;
  }
}
