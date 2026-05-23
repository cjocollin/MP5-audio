import {
  auditAlbmPackageManifest,
  auditEmbeddedAlbumPackage,
  indexEmbeddedAlbumPackage,
  isEmbeddedMp5pBytes,
  parseAlbmPackageJson,
  verifyEmbeddedPackageIntegrity,
} from "@mp5/container";
import type { ResolvedAlbumPackage } from "./resolveAlbum";
import { enrichTracksSidecarIntegrity } from "../fingerprint/sidecar";
import {
  enrichResolvedAlbum,
  resolveAlbumTracks,
  resolveEmbeddedAlbumPackage,
} from "./resolveAlbum";
import { isAlbumPackageFileName } from "./createAlbumPackage";
import type { PlaylistTrack } from "../../store/playerStore";
import {
  ingestMp5Files,
  isMp5FileName,
  type IngestProgressCallback,
  type IngestResult,
} from "../../player/playlistUtils";
import { USER_ERRORS } from "../userFacingErrors";

export interface AlbumIngestResult {
  album: ResolvedAlbumPackage | null;
  mp5: IngestResult;
  manifestError?: string;
  manifestName?: string;
}

export function partitionDroppedFiles(files: File[]): {
  mp5: File[];
  manifests: File[];
  other: File[];
} {
  const mp5: File[] = [];
  const manifests: File[] = [];
  const other: File[] = [];
  for (const f of files) {
    if (isMp5FileName(f.name)) mp5.push(f);
    else if (isAlbumPackageFileName(f.name)) manifests.push(f);
    else other.push(f);
  }
  return { mp5, manifests, other };
}

async function ingestEmbeddedManifestFile(
  manifestFile: File,
  existingTracks: PlaylistTrack[],
  onMp5Progress?: IngestProgressCallback,
): Promise<AlbumIngestResult> {
  const buf = await manifestFile.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!isEmbeddedMp5pBytes(bytes)) {
    return {
      album: null,
      mp5: { tracks: [], dropErrors: [], addedCount: 0, skippedCount: 0, unreadableCount: 0 },
      manifestError: USER_ERRORS.albumManifestInvalid,
      manifestName: manifestFile.name,
    };
  }
  let index;
  try {
    index = indexEmbeddedAlbumPackage(bytes);
  } catch {
    return {
      album: null,
      mp5: { tracks: [], dropErrors: [], addedCount: 0, skippedCount: 0, unreadableCount: 0 },
      manifestError: USER_ERRORS.albumManifestInvalid,
      manifestName: manifestFile.name,
    };
  }
  const integrity = verifyEmbeddedPackageIntegrity(bytes);
  const resolved = resolveEmbeddedAlbumPackage(index, {
    manifestName: manifestFile.name,
    file: manifestFile,
  });
  const warnings = [
    ...auditAlbmPackageManifest(index.manifest),
    ...auditEmbeddedAlbumPackage(index).map((message) => ({
      path: "package",
      message,
    })),
  ];
  if (!integrity.valid) {
    warnings.push({
      path: "integrity",
      message: `${integrity.issues.length} embedded fragment/integrity issue(s) — some tracks may fail to load`,
    });
  }
  const album = enrichResolvedAlbum(resolved, { warnings });
  return {
    album,
    mp5: { tracks: [], dropErrors: [], addedCount: 0, skippedCount: 0, unreadableCount: 0 },
    manifestName: manifestFile.name,
  };
}

export async function ingestAlbumPackageFiles(
  files: File[],
  existingTracks: PlaylistTrack[] = [],
  onMp5Progress?: IngestProgressCallback,
): Promise<AlbumIngestResult> {
  const { mp5, manifests } = partitionDroppedFiles(files);
  const mp5Result = await ingestMp5Files(mp5, onMp5Progress);

  if (!manifests.length) {
    return { album: null, mp5: mp5Result };
  }

  const manifestFile = manifests[0]!;
  const head = new Uint8Array(await manifestFile.slice(0, 4).arrayBuffer());
  if (isEmbeddedMp5pBytes(head)) {
    return ingestEmbeddedManifestFile(manifestFile, existingTracks, onMp5Progress);
  }

  let text: string;
  try {
    text = await manifestFile.text();
  } catch {
    return {
      album: null,
      mp5: mp5Result,
      manifestError: USER_ERRORS.albumManifestUnreadable,
      manifestName: manifestFile.name,
    };
  }

  const { manifest, errors } = parseAlbmPackageJson(text);
  if (!manifest) {
    return {
      album: null,
      mp5: mp5Result,
      manifestError: errors[0]?.message ?? USER_ERRORS.albumManifestInvalid,
      manifestName: manifestFile.name,
    };
  }

  const combined: PlaylistTrack[] = [...existingTracks];
  for (const t of mp5Result.tracks) {
    if (!combined.some((c) => c.id === t.id)) combined.push(t);
  }
  const resolved = resolveAlbumTracks(manifest, combined);
  const withSidecar = await enrichTracksSidecarIntegrity(resolved.tracks);
  const album = enrichResolvedAlbum(
    { ...resolved, tracks: withSidecar },
    {
      manifestName: manifestFile.name,
      warnings: auditAlbmPackageManifest(manifest),
    },
  );

  return {
    album,
    mp5: mp5Result,
    manifestName: manifestFile.name,
  };
}
