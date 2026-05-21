import { auditAlbmPackageManifest } from "@mp5/container";
import { listLibraryRecords, loadLibraryEntry, libraryEntryToFile } from "../localLibrary/api";
import { albumTrackBasename } from "@mp5/container";
import type { SavedAlbumPackage } from "../localLibrary/albumLibrary";
import { usePlayerStore } from "../../store/playerStore";
import { ingestMp5Files } from "../../player/playlistUtils";
import { enrichResolvedAlbum, resolveAlbumTracks } from "./resolveAlbum";

/** Load library .mp5 files referenced by a saved album and open the player. */
export async function openSavedAlbumInPlayer(saved: SavedAlbumPackage): Promise<{
  album: ReturnType<typeof resolveAlbumTracks> & { manifestName?: string; warnings: import("@mp5/container").AlbmAuditWarning[] };
  filesLoaded: number;
  missingRefs: string[];
}> {
  const records = await listLibraryRecords();
  const files: File[] = [];
  const missingRefs: string[] = [];

  for (const ref of saved.manifest.tracks) {
    const base = albumTrackBasename(ref.file).toLowerCase();
    const rec = records.find(
      (r) => r.filename.toLowerCase() === base && !r.summary.parseError,
    );
    if (!rec) {
      missingRefs.push(ref.file);
      continue;
    }
    const entry = await loadLibraryEntry(rec.id);
    if (!entry) {
      missingRefs.push(ref.file);
      continue;
    }
    files.push(await libraryEntryToFile(entry));
  }

  const store = usePlayerStore.getState();
  const mp5Result = await ingestMp5Files(files);
  const combined = [...store.tracks];
  for (const t of mp5Result.tracks) {
    if (!combined.some((c) => c.id === t.id)) combined.push(t);
  }
  if (mp5Result.tracks.length) store.appendTracks(mp5Result.tracks);

  const resolved = resolveAlbumTracks(saved.manifest, combined);
  const album = enrichResolvedAlbum(resolved, {
    manifestName: saved.name,
    warnings: auditAlbmPackageManifest(saved.manifest),
  });

  store.setPendingAlbumPackage(album);
  store.setActiveTab("player");
  return { album, filesLoaded: files.length, missingRefs };
}
