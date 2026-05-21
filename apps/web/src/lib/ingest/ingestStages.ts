import type { Mp5ParseProgress, Mp5ParseStage } from "@mp5/container";

export type IngestLoadStage =
  | "idle"
  | "loading_mp5"
  | "reading_audio"
  | "indexing_stems"
  | "checking_integrity"
  | "ready"
  | "decoding_audio";

export function ingestStageLabel(stage: IngestLoadStage, detail?: string): string {
  switch (stage) {
    case "loading_mp5":
      return detail ?? "Loading MP5…";
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
