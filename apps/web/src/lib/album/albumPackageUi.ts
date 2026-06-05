import type { ResolvedAlbumPackage } from "./resolveAlbum";

export function formatPackageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function formatExtractFilename(trackNumber: number, title: string): string {
  const safeTitle = title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .trim()
    .slice(0, 80) || "Track";
  const num = String(trackNumber).padStart(2, "0");
  const base = `${num} - ${safeTitle}`;
  return base.toLowerCase().endsWith(".mp5") ? base : `${base}.mp5`;
}

export type AlbumIntegritySummary =
  | "ok"
  | "informational"
  | "sidecar-missing"
  | "hash-warning";

export function summarizeAlbumIntegrity(album: ResolvedAlbumPackage): AlbumIntegritySummary {
  if (album.packageKind === "embedded") {
    if (album.warnings.some((w) => /corrupt|integrity|hash/i.test(w.message))) {
      return "hash-warning";
    }
    return "ok";
  }
  if (album.missingCount > 0) return "sidecar-missing";
  const mismatch = album.tracks.some((t) => t.sidecarStatus === "found-mismatch");
  if (mismatch || album.warnings.length > 0) return "hash-warning";
  return album.tracks.some((t) => t.sidecarStatus === "found-no-hash")
    ? "informational"
    : "ok";
}

export function integrityStatusLabel(summary: AlbumIntegritySummary): string {
  switch (summary) {
    case "ok":
      return "Integrity OK";
    case "informational":
      return "Informational — some tracks lack embedded hashes";
    case "sidecar-missing":
      return "Sidecar files missing — add .mp5 files to play missing tracks";
    case "hash-warning":
      return "Integrity warning — review track hash or package warnings";
  }
}

export function packageTypeBadgeLabel(kind: ResolvedAlbumPackage["packageKind"]): string {
  return kind === "embedded" ? "Embedded album package" : "Manifest album package";
}

export function largeEmbeddedWarning(sizeBytes: number | undefined): string | null {
  if (sizeBytes == null) return null;
  const mb = sizeBytes / (1024 * 1024);
  if (mb < 48) return null;
  return `This embedded album is about ${mb.toFixed(0)} MiB. Loading and saving may take time and use significant browser memory.`;
}

export const LIBRARY_STORAGE_NOTE =
  "Browser storage is local to this device. Clearing site data removes saved albums.";

export const MANIFEST_SIDECAR_NOTE =
  "Manifest packages list sidecar .mp5 files. Keep the .mp5p and .mp5 files together when sharing.";
