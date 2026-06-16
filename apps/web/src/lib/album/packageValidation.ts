import {
  auditAlbmPackageManifest,
  indexEmbeddedAlbumPackage,
  parseAlbmPackageJson,
  verifyEmbeddedPackageIntegrity,
  type AlbmPackageManifest,
} from "@mp5/container";
import type { BatchAlbumExportTarget } from "./batchAlbumMetadata";

/** Track ids must be safe to use as map keys and never look like paths. */
const UNSAFE_TRACK_ID = /[<>:"/\\|?*\u0000-\u001f]/;

/** Embedded packages above this size trigger a "heavy package" advisory. */
export const HUGE_EMBEDDED_WARN_BYTES = 80 * 1024 * 1024;

/** Above this size we skip deep (per-fragment CRC) validation in the browser. */
export const DEEP_VERIFY_MAX_BYTES = 64 * 1024 * 1024;

export interface PreflightTrack {
  trackId: string;
  /** Sidecar present (manifest) or embeddable bytes available (embedded). */
  hasPayload: boolean;
  byteLength: number;
  title?: string;
}

export interface PackagePreflight {
  /** false => export should be blocked (package would be invalid). */
  ok: boolean;
  blockers: string[];
  warnings: string[];
  totalBytes: number;
}

/**
 * Validate a package before export. Blockers make the package invalid and
 * should stop export; warnings are advisory and must not block harmless cases.
 */
export function preflightPackageExport(args: {
  exportTarget: BatchAlbumExportTarget;
  manifest: AlbmPackageManifest | null;
  tracks: PreflightTrack[];
}): PackagePreflight {
  const { exportTarget, manifest, tracks } = args;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (exportTarget === "individual") {
    if (tracks.length === 0) blockers.push("No completed tracks to export.");
    const totalBytes = tracks.reduce((s, t) => s + (t.hasPayload ? t.byteLength : 0), 0);
    return { ok: blockers.length === 0, blockers, warnings, totalBytes };
  }

  if (!manifest) {
    blockers.push("Could not build the album manifest.");
    return { ok: false, blockers, warnings, totalBytes: 0 };
  }
  if (!manifest.album.title?.trim()) {
    blockers.push("Album needs a title before packaging.");
  }
  if (manifest.tracks.length < 2) {
    blockers.push("Album packages need at least two tracks.");
  }

  const seen = new Set<string>();
  for (const ref of manifest.tracks) {
    if (!ref.trackId || UNSAFE_TRACK_ID.test(ref.trackId)) {
      blockers.push(`Unsafe track id: ${ref.trackId || "(empty)"}`);
    } else if (seen.has(ref.trackId)) {
      blockers.push(`Duplicate track id: ${ref.trackId}`);
    }
    seen.add(ref.trackId);
  }

  const byId = new Map(tracks.map((t) => [t.trackId, t]));
  let totalBytes = 0;
  let missingPayloads = 0;
  for (const ref of manifest.tracks) {
    const t = byId.get(ref.trackId);
    if (!t || !t.hasPayload) {
      missingPayloads += 1;
      continue;
    }
    totalBytes += t.byteLength;
  }
  if (exportTarget === "embedded" && missingPayloads > 0) {
    blockers.push(`${missingPayloads} track(s) have no audio payload to embed.`);
  } else if (exportTarget === "manifest" && missingPayloads > 0) {
    warnings.push(`${missingPayloads} track(s) missing sidecar files — keep all .mp5 files together.`);
  }

  const missingTitles = manifest.tracks.filter((r) => !r.title?.trim()).length;
  if (missingTitles > 0) warnings.push(`${missingTitles} track(s) missing a title.`);
  if (!manifest.album.artist && !manifest.album.albumArtist) {
    warnings.push("Album artist is empty.");
  }

  if (exportTarget === "embedded" && totalBytes > HUGE_EMBEDDED_WARN_BYTES) {
    warnings.push(
      `Embedded package is about ${Math.round(totalBytes / (1024 * 1024))} MB — large packages use significant browser memory and may be slow to download.`,
    );
  }
  if (exportTarget === "manifest") {
    warnings.push("Manifest .mp5p references sidecar .mp5 files — they must travel together.");
  }

  return { ok: blockers.length === 0, blockers, warnings, totalBytes };
}

export interface PackageVerification {
  valid: boolean;
  summary: string;
  warnings: string[];
  trackCount: number;
  /** Whether deep per-fragment validation ran (vs. cheap header/manifest only). */
  deep: boolean;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Validate an exported embedded package. Always indexes the header/manifest/
 * directory cheaply; only runs per-fragment CRC checks for packages small
 * enough to scan without freezing the browser.
 */
export function verifyExportedEmbeddedPackage(
  bytes: Uint8Array,
  expectedTrackCount: number,
): PackageVerification {
  let index;
  try {
    index = indexEmbeddedAlbumPackage(bytes);
  } catch (e) {
    return {
      valid: false,
      summary: `Package validation failed: ${errMessage(e)}`,
      warnings: [],
      trackCount: 0,
      deep: false,
    };
  }

  const warnings: string[] = [];
  const trackCount = index.tracks.length;
  if (trackCount !== expectedTrackCount) {
    warnings.push(`Expected ${expectedTrackCount} track(s), package contains ${trackCount}.`);
  }

  if (bytes.byteLength > DEEP_VERIFY_MAX_BYTES) {
    warnings.push(
      "Large package — deep fragment validation skipped in the browser. Verify with CLI: pnpm validate:mp5p <file> --profile package.",
    );
    return {
      valid: true,
      summary: "Package header and manifest validated",
      warnings,
      trackCount,
      deep: false,
    };
  }

  const report = verifyEmbeddedPackageIntegrity(bytes);
  if (!report.valid) {
    return {
      valid: false,
      summary: `Package validation found ${report.issues.length} issue(s).`,
      warnings: report.issues.slice(0, 5).map((i) => i.message),
      trackCount,
      deep: true,
    };
  }
  return {
    valid: true,
    summary: "Package validation passed",
    warnings,
    trackCount,
    deep: true,
  };
}

/** Validate an exported manifest package (JSON) cheaply. */
export function verifyExportedManifest(
  json: string,
  expectedTrackCount: number,
): PackageVerification {
  const { manifest, errors } = parseAlbmPackageJson(json);
  if (!manifest || errors.length) {
    return {
      valid: false,
      summary: `Manifest validation failed: ${errors[0]?.message ?? "invalid manifest"}`,
      warnings: [],
      trackCount: 0,
      deep: false,
    };
  }
  const warnings = auditAlbmPackageManifest(manifest).map((w) => `${w.path}: ${w.message}`);
  const trackCount = manifest.tracks.length;
  if (trackCount !== expectedTrackCount) {
    warnings.push(`Expected ${expectedTrackCount} track(s), manifest lists ${trackCount}.`);
  }
  return { valid: true, summary: "Manifest validation passed", warnings, trackCount, deep: false };
}
