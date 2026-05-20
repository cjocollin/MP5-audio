import { CodecId, type Mp5File } from "@mp5/container";
import type { ExportMetadataBundle } from "./buildExportBundles";
import type { OutputCodec } from "./convertToMp5";
import { codecLabel } from "../lib/codecDisplay";

export interface ExportSummary {
  filename: string;
  codecLabel: string;
  exportCodec: OutputCodec;
  outputBytes: number;
  sourceBytes?: number;
  containerVsPcmPercent?: number;
  hasMetaTags: boolean;
  hasCoverArt: boolean;
  hasLyrics: boolean;
  hasContentGuidance: boolean;
}

export function buildExportSummary(args: {
  filename: string;
  exportCodec: OutputCodec;
  outputBytes: number;
  sourceBytes?: number;
  bundle: ExportMetadataBundle;
  validated: Mp5File;
}): ExportSummary {
  const head = args.validated.head;
  const metaCount = args.bundle.metaFields.filter((f) => f.value?.trim()).length;
  const hasMetaTags = metaCount > 0;
  const hasCoverArt = !!(
    args.bundle.cover?.data.length ||
    args.validated.coverArt?.data.length ||
    args.validated.cover?.length
  );
  const hasLyrics = args.validated.optional.has("LYRC") || !!args.bundle.lyrics?.unsynced;
  const hasContentGuidance =
    args.validated.optional.has("EXPL") ||
    args.validated.optional.has("SAFE") ||
    args.validated.optional.has("SENS") ||
    args.validated.optional.has("RECV");

  let containerVsPcmPercent: number | undefined;
  if (head && args.outputBytes > 0) {
    const pcmBytes =
      Number(head.totalSamples) * head.channels * (head.bitsPerSample / 8);
    if (pcmBytes > 0) {
      containerVsPcmPercent = (args.outputBytes / pcmBytes) * 100;
    }
  }

  return {
    filename: args.filename,
    codecLabel: codecLabel(head?.codecId ?? CodecId.PCM),
    exportCodec: args.exportCodec,
    outputBytes: args.outputBytes,
    sourceBytes: args.sourceBytes,
    containerVsPcmPercent,
    hasMetaTags,
    hasCoverArt,
    hasLyrics,
    hasContentGuidance,
  };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
