import type { BatchAlbumExportTarget } from "./batchAlbumMetadata";

export type PackageMode = "manifest" | "embedded";

export interface PackageModeGuidance {
  mode: PackageMode;
  title: string;
  summary: string;
  pros: string[];
  cons: string[];
}

export const MANIFEST_GUIDANCE: PackageModeGuidance = {
  mode: "manifest",
  title: "Manifest .mp5p",
  summary: "A small index file that references your separate .mp5 track files.",
  pros: ["Smaller package file", "Easy to inspect or edit", "Lightweight to share the index"],
  cons: ["Needs the sidecar .mp5 files alongside it", "Not self-contained — files can get separated"],
};

export const EMBEDDED_GUIDANCE: PackageModeGuidance = {
  mode: "embedded",
  title: "Embedded .mp5p",
  summary: "A single self-contained file with every track packed inside.",
  pros: ["Self-contained — one file to share", "Best for finished album packages"],
  cons: [
    "Can be very large",
    "May use significant browser memory and storage",
  ],
};

export function packageGuidance(mode: PackageMode): PackageModeGuidance {
  return mode === "embedded" ? EMBEDDED_GUIDANCE : MANIFEST_GUIDANCE;
}

export function guidanceForTarget(target: BatchAlbumExportTarget): PackageModeGuidance | null {
  if (target === "manifest") return MANIFEST_GUIDANCE;
  if (target === "embedded") return EMBEDDED_GUIDANCE;
  return null;
}

/** Concise, honest reminders shown on the export review step. */
export const EXPORT_REVIEW_NOTES = {
  mp5lRecommended: "MP5-L v4 is the recommended lossless, bit-exact default.",
  mp5cLabOnly: "MP5-C is an experimental lab codec — not recommended for distribution.",
  browserLocal: "All processing happens locally in your browser — nothing is uploaded.",
  keepOriginals: "Keep your original source files backed up — exports do not replace them.",
  noClaims:
    "MP5 makes no claim to beat MP3, AAC, Opus, or FLAC, and performs no rights or legal verification.",
} as const;
