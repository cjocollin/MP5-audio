import { auditAlbmPackageManifest } from "@mp5/container";
import type { SavedEmbeddedAlbumPackage } from "../localLibrary/embeddedAlbumLibrary";
import { indexSavedEmbeddedAlbum } from "../localLibrary/embeddedAlbumLibrary";
import { usePlayerStore } from "../../store/playerStore";
import { enrichResolvedAlbum, resolveEmbeddedAlbumPackage } from "./resolveAlbum";

/** Open a saved embedded .mp5p from library storage in the player album view. */
export async function openSavedEmbeddedAlbumInPlayer(
  saved: SavedEmbeddedAlbumPackage,
): Promise<{ album: ReturnType<typeof resolveEmbeddedAlbumPackage> }> {
  const indexed = await indexSavedEmbeddedAlbum(saved);
  if (!indexed) {
    throw new Error("Saved embedded album data is missing from browser storage.");
  }
  const resolved = resolveEmbeddedAlbumPackage(indexed.index, {
    manifestName: saved.name,
    file: indexed.file,
  });
  const album = enrichResolvedAlbum(resolved, {
    manifestName: saved.name,
    warnings: auditAlbmPackageManifest(saved.manifest),
  });
  const store = usePlayerStore.getState();
  store.setPendingAlbumPackage(album);
  store.setActiveTab("player");
  return { album };
}
