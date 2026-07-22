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

export interface EncodeStemsMixPcm {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
}

/** Bit-exact Int16 PCM equality (same length required). */
export function pcmSamplesEqual(a: Int16Array, b: Int16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function encodeStemsForExport(
  stems: PendingStemPcm[],
  mix?: EncodeStemsMixPcm,
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
  let aliasCount = 0;

  for (const stem of stems) {
    const ch = stem.channels;
    const durationSamples = Math.floor(stem.samples.length / ch);

    const canAlias =
      !!mix &&
      mix.sampleRate === stem.sampleRate &&
      mix.channels === ch &&
      pcmSamplesEqual(stem.samples, mix.samples);

    if (canAlias) {
      aliasCount++;
      bundles.push({
        stemId: stem.id,
        stemName: stem.name.trim() || stem.fileName,
        stemType: stem.stemType as StemType,
        codecId: CodecId.MP5L,
        sampleRate: stem.sampleRate,
        channels: ch,
        durationSamples,
        frameData: new Uint8Array(0),
        defaultVolume: stem.defaultVolume,
        explicitContent: stem.explicitContent,
        codingMode: "alias",
        refTarget: "AUDI",
      });
      continue;
    }

    let frameData: Uint8Array;
    let codecId: number;

    if (wasmReady && codec) {
      frameData = codec.encode_mp5l_v4(stem.samples, ch);
      codecId = CodecId.MP5L;
    } else {
      frameData = new Uint8Array(
        stem.samples.buffer,
        stem.samples.byteOffset,
        stem.samples.byteLength,
      );
      codecId = CodecId.PCM;
    }

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

  if (aliasCount > 0) {
    warnings.push(
      `Omitted duplicate stem data for ${aliasCount} stem(s) identical to the full mix (AUDI alias).`,
    );
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
