import type { Mp5IndexProgress, Mp5ParseProgress, Mp5ParseStage } from "@mp5/container";

export type IngestLoadStage =
  | "idle"
  | "loading_mp5"
  | "scanning_chunks"
  | "preparing_full_mix"
  | "loading_metadata"
  | "reading_audio"
  | "indexing_stems"
  | "checking_integrity"
  | "ready"
  | "decoding_audio";

export function ingestStageLabel(stage: IngestLoadStage, detail?: string): string {
  switch (stage) {
    case "loading_mp5":
      return detail ?? "Loading MP5…";
    case "scanning_chunks":
      return detail ?? "Scanning chunks…";
    case "preparing_full_mix":
      return detail ?? "Preparing full mix…";
    case "loading_metadata":
      return detail ?? "Loading optional metadata…";
    case "reading_audio":
      return detail ?? "Reading audio…";
    case "indexing_stems":
      return detail ?? "Indexing stems…";
    case "checking_integrity":
      return detail ?? "Checking integrity…";
    case "decoding_audio":
      return detail ?? "Decoding audio…";
    case "ready":
      return "Ready";
    default:
      return "";
  }
}

export function mapIndexProgressToIngestStage(p: Mp5IndexProgress): IngestLoadStage {
  switch (p.stage) {
    case "identify":
      return "loading_mp5";
    case "scanning_chunks":
      return "scanning_chunks";
    case "basic_playback":
      return "preparing_full_mix";
    case "optional_metadata":
      return "loading_metadata";
    case "done":
      return "indexing_stems";
    default:
      return "loading_mp5";
  }
}

export function indexStageDetail(p: Mp5IndexProgress): string | undefined {
  if (p.stage === "scanning_chunks" && p.chunksScanned > 0) {
    return `Scanning chunks (${p.chunksScanned})…`;
  }
  if (
    p.stdfFragmentCount > 0 &&
    (p.stage === "scanning_chunks" || p.stage === "optional_metadata" || p.stage === "done")
  ) {
    return `Indexed ${p.stdfFragmentCount} STDF fragment(s)…`;
  }
  return undefined;
}

export function mapParseProgressToIngestStage(p: Mp5ParseProgress): IngestLoadStage {
  switch (p.stage) {
    case "reading":
      return "loading_mp5";
    case "parsing_chunks":
      return "reading_audio";
    case "indexing_stems":
      return "indexing_stems";
    case "done":
      return "ready";
    default:
      return "loading_mp5";
  }
}

export function parseStageDetail(p: Mp5ParseProgress): string | undefined {
  if (p.stage === "parsing_chunks" && p.chunksParsed > 0) {
    return `Parsing chunks (${p.chunksParsed})…`;
  }
  if (p.stage === "indexing_stems" && p.stdfFragmentCount > 0) {
    return `Indexing stems (${p.stdfFragmentCount} STDF fragments)…`;
  }
  return undefined;
}
