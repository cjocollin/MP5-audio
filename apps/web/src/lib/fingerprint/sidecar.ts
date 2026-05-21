import { normalizeSha256Hex } from "@mp5/container";
import type { AlbmTrackRef } from "@mp5/container";
import type { ResolvedAlbumTrack } from "../album/resolveAlbum";
import { sha256HexFromArrayBuffer } from "./sha256";

export type SidecarIntegrityStatus =
  | "missing"
  | "found-verified"
  | "found-mismatch"
  | "found-no-hash";

export async function sidecarStatusForTrack(
  ref: AlbmTrackRef,
  file: File | undefined,
): Promise<SidecarIntegrityStatus> {
  if (!file) return "missing";
  const expected = normalizeSha256Hex(ref.fileSha256);
  if (!expected) return "found-no-hash";
  try {
    const actual = await sha256HexFromArrayBuffer(await file.arrayBuffer());
    return actual === expected ? "found-verified" : "found-mismatch";
  } catch {
    return "found-no-hash";
  }
}

export async function enrichTracksSidecarIntegrity(
  tracks: ResolvedAlbumTrack[],
): Promise<ResolvedAlbumTrack[]> {
  return Promise.all(
    tracks.map(async (t) => {
      if (t.missing) {
        return { ...t, sidecarStatus: "missing" as const };
      }
      const status = await sidecarStatusForTrack(t.ref, t.playlistTrack?.file);
      return { ...t, sidecarStatus: status };
    }),
  );
}
