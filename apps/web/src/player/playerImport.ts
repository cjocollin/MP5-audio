import { usePlayerStore } from "../store/playerStore";
import { ingestAlbumPackageFiles } from "../lib/album/ingestAlbumPackage";
import { recordRecentFileOpen } from "../lib/localLibrary/recentLibrary";
import { ingestMp5Files, type IngestResult } from "./playlistUtils";

/** Load MP5 files into the player queue and switch to the Player tab. */
export async function importMp5ToPlayer(
  files: File[],
  opts?: { playFirst?: boolean },
): Promise<IngestResult> {
  const result = await ingestMp5Files(files);
  const store = usePlayerStore.getState();
  const prevLen = store.tracks.length;

  if (result.tracks.length > 0) {
    store.appendTracks(result.tracks);
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".mp5")) continue;
      recordRecentFileOpen(file);
    }
    if (opts?.playFirst) {
      const firstNew = prevLen;
      store.setCurrentIndex(firstNew);
      store.setPlaying(true);
    }
  }

  store.setActiveTab("player");
  return result;
}

/** Load an .mp5p album package into the player album view. */
export async function importAlbumPackageToPlayer(file: File): Promise<void> {
  const store = usePlayerStore.getState();
  recordRecentFileOpen(file);
  const ingest = await ingestAlbumPackageFiles([file], store.tracks);
  if (ingest.album) {
    store.setPendingAlbumPackage(ingest.album);
  }
  if (ingest.mp5.tracks.length) {
    store.appendTracks(ingest.mp5.tracks);
  }
  store.setActiveTab("player");
}
