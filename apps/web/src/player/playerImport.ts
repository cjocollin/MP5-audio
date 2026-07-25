import { usePlayerStore, withoutDefaultDemoTracks } from "../store/playerStore";
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
  const prevLen = withoutDefaultDemoTracks(store.tracks).length;

  if (result.tracks.length > 0) {
    store.appendTracks(result.tracks);
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".mp5")) continue;
      try {
        recordRecentFileOpen(file);
      } catch {
        /* recents are best-effort — storage failure must not abort the import */
      }
    }
    if (opts?.playFirst) {
      const currentTracks = usePlayerStore.getState().tracks;
      const firstNewId = result.tracks[0]?.id;
      const firstNew = firstNewId
        ? currentTracks.findIndex((track) => track.id === firstNewId)
        : prevLen;
      store.setCurrentIndex(firstNew);
      // Signal play intent through the owned, track-keyed channel. setPlaying(true)
      // here was cancelled by loadFile's "not requested" guard (the playFirst-drop
      // bug); the player consumes this only when THIS track's audio starts.
      if (firstNewId) {
        store.setPendingPlayTrackId(firstNewId);
      } else {
        store.setPlaying(true);
      }
    }
  }

  store.setActiveTab("player");
  return result;
}

/** Load an .mp5p album package into the player album view. */
export async function importAlbumPackageToPlayer(file: File): Promise<void> {
  const store = usePlayerStore.getState();
  try {
    recordRecentFileOpen(file);
  } catch {
    /* recents are best-effort — storage failure must not abort the album open */
  }
  const ingest = await ingestAlbumPackageFiles([file], withoutDefaultDemoTracks(store.tracks));
  if (ingest.album) {
    store.setPendingAlbumPackage(ingest.album);
  }
  if (ingest.mp5.tracks.length) {
    store.appendTracks(ingest.mp5.tracks);
  }
  store.setActiveTab("player");
}
