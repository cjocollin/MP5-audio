import { formatBytes } from "../../converter/exportSummary";
import type { BatchAlbumExportTarget } from "./batchAlbumMetadata";
import type { PackageVerification } from "./packageValidation";

/** Strip anything that looks like a local filesystem path from diagnostics text. */
export function redactLocalPaths(text: string): string {
  return text
    .replace(/[a-zA-Z]:\\[^\s"']+/g, "<path>")
    .replace(/(?:\/[^\s"'/]+){2,}\/?/g, "<path>");
}

const TARGET_LABELS: Record<BatchAlbumExportTarget, string> = {
  individual: "Individual .mp5 files",
  manifest: "Manifest .mp5p package",
  embedded: "Embedded .mp5p package",
};

export function exportTargetLabel(target: BatchAlbumExportTarget): string {
  return TARGET_LABELS[target];
}

export interface PackageSummaryInput {
  mode: BatchAlbumExportTarget;
  albumTitle: string;
  albumArtist?: string;
  trackCount: number;
  packageFilename?: string;
  totalBytes?: number;
  warnings?: string[];
  verification?: PackageVerification;
}

/**
 * Build a copyable, path-free summary of a package export. Only basenames are
 * included (callers pass basenames), so no local paths leak.
 */
export function buildPackageSummaryText(input: PackageSummaryInput): string {
  const lines = [
    "MP5 album package export",
    `Mode: ${exportTargetLabel(input.mode)}`,
    `Album: ${input.albumTitle || "(untitled)"}`,
  ];
  if (input.albumArtist?.trim()) lines.push(`Artist: ${input.albumArtist.trim()}`);
  lines.push(`Tracks: ${input.trackCount}`);
  if (input.packageFilename) lines.push(`File: ${input.packageFilename}`);
  if (input.totalBytes != null) lines.push(`Size: ${formatBytes(input.totalBytes)}`);
  lines.push("Codec: MP5-L v4 (lossless)");
  if (input.verification) {
    lines.push(`Validation: ${input.verification.valid ? input.verification.summary : `FAILED — ${input.verification.summary}`}`);
    for (const w of input.verification.warnings) lines.push(`  - ${w}`);
  }
  for (const w of input.warnings ?? []) lines.push(`Warning: ${w}`);
  lines.push("Processed locally in-browser; no upload.");
  return redactLocalPaths(lines.join("\n"));
}

export interface SingleExportSummaryInput {
  filename: string;
  codecLabel: string;
  outputBytes: number;
  sourceBytes?: number;
  hasMetaTags: boolean;
  hasCoverArt: boolean;
  hasLyrics: boolean;
  stemCount: number;
}

/** Path-free copyable summary for a single .mp5 export. */
export function buildSingleExportSummaryText(s: SingleExportSummaryInput): string {
  const lines = [
    "MP5 export",
    `File: ${s.filename}`,
    `Codec: ${s.codecLabel}`,
    `Output size: ${formatBytes(s.outputBytes)}`,
  ];
  if (s.sourceBytes != null) lines.push(`Source size: ${formatBytes(s.sourceBytes)}`);
  lines.push(`Metadata: ${s.hasMetaTags ? "yes" : "no"}`);
  lines.push(`Cover art: ${s.hasCoverArt ? "yes" : "no"}`);
  lines.push(`Lyrics: ${s.hasLyrics ? "yes" : "no"}`);
  lines.push(`Stems: ${s.stemCount > 0 ? s.stemCount : "none"}`);
  lines.push("Processed locally in-browser; no upload.");
  return redactLocalPaths(lines.join("\n"));
}

export interface ExportDiagnosticsContext {
  exportMode?: string;
  codecPreset?: string;
  trackCount?: number;
  packageType?: string;
  warningCount?: number;
  lastExportError?: string;
}

/** Format export context for the diagnostics report; paths are redacted. */
export function formatExportDiagnostics(ctx: ExportDiagnosticsContext): string[] {
  const lines: string[] = [];
  if (ctx.exportMode) lines.push(`Export mode: ${ctx.exportMode}`);
  if (ctx.codecPreset) lines.push(`Export codec/preset: ${ctx.codecPreset}`);
  if (ctx.trackCount != null) lines.push(`Export tracks: ${ctx.trackCount}`);
  if (ctx.packageType) lines.push(`Package type: ${ctx.packageType}`);
  if (ctx.warningCount != null) lines.push(`Export warnings: ${ctx.warningCount}`);
  if (ctx.lastExportError) lines.push(`Last export error: ${redactLocalPaths(ctx.lastExportError)}`);
  return lines;
}
