import { auditAlbmPackageManifest, indexEmbeddedAlbumPackage } from "@mp5/container";
import { usePlayerStore } from "../../store/playerStore";
import { ingestMp5Files } from "../../player/playlistUtils";
import { enrichResolvedAlbum, resolveAlbumTracks, resolveEmbeddedAlbumPackage } from "./resolveAlbum";
import type { BatchAlbumExportResult } from "./buildAlbumFromBatchItems";
import { downloadAlbumManifest } from "./createAlbumPackage";
import { downloadBlob } from "../performance/downloadBlob";

/** Open a freshly exported batch album package in the player album view. */
export async function openBatchExportInPlayer(result: BatchAlbumExportResult): Promise<void> {
  if (!result.ok || !result.manifest) {
    throw new Error(result.message ?? "Nothing to open.");
  }
  const store = usePlayerStore.getState();
  const filename = result.packageFilename ?? `${result.manifest.album.title}.mp5p`;

  if (result.exportTarget === "embedded" && result.packageBytes) {
    const file = new File([result.packageBytes.slice().buffer], filename, {
      type: "application/octet-stream",
    });
    const index = indexEmbeddedAlbumPackage(result.packageBytes);
    const resolved = resolveEmbeddedAlbumPackage(index, { manifestName: filename, file });
    const album = enrichResolvedAlbum(resolved, {
      manifestName: filename,
      warnings: auditAlbmPackageManifest(result.manifest),
    });
    store.setPendingAlbumPackage(album);
    store.setActiveTab("player");
    return;
  }

  if (result.exportTarget === "manifest" && result.playableTracks?.length) {
    const mp5Result = await ingestMp5Files(result.playableTracks.map((t) => t.file!).filter(Boolean));
    if (mp5Result.tracks.length) store.appendTracks(mp5Result.tracks);
    const combined = [...store.tracks];
    for (const t of mp5Result.tracks) {
      if (!combined.some((c) => c.id === t.id)) combined.push(t);
    }
    const resolved = resolveAlbumTracks(result.manifest, combined);
    const album = enrichResolvedAlbum(resolved, {
      manifestName: filename,
      warnings: auditAlbmPackageManifest(result.manifest),
    });
    store.setPendingAlbumPackage(album);
    store.setActiveTab("player");
    return;
  }

  throw new Error("Could not open this export in the player.");
}

export function redownloadBatchExport(result: BatchAlbumExportResult): void {
  if (!result.ok || !result.manifest) return;
  const filename = result.packageFilename ?? `${result.manifest.album.title}.mp5p`;
  if (result.exportTarget === "embedded" && result.packageBytes) {
    downloadBlob(
      new Blob([result.packageBytes.slice().buffer], { type: "application/octet-stream" }),
      filename.endsWith(".mp5p") ? filename : `${filename}.mp5p`,
    );
    return;
  }
  if (result.exportTarget === "manifest") {
    downloadAlbumManifest(result.manifest, filename);
  }
}
