import { usePlayerStore } from "../store/playerStore";
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
    if (opts?.playFirst) {
      const firstNew = prevLen;
      store.setCurrentIndex(firstNew);
      store.setPlaying(true);
    }
  }

  store.setActiveTab("player");
  return result;
}
