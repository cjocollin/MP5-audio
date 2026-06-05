import {
  decodeEmbeddedFragment,
  type EmbeddedAlbumPackageIndex,
} from "@mp5/container";
import { headDurationMs } from "./albumDuration";
import { parseMp5MetadataPrefix } from "./parseMp5MetadataPrefix";

const METADATA_PROBE_BYTES = 3 * 1024 * 1024;

async function readEmbeddedTrackPrefixBytes(
  source: File | Blob,
  index: EmbeddedAlbumPackageIndex,
  trackId: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const entry = index.tracks.find((t) => t.trackId === trackId);
  if (!entry?.fragments.length) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const ref of entry.fragments) {
    if (total >= maxBytes) break;
    const slice = source.slice(ref.recordOffset, ref.recordOffset + ref.recordLength);
    const recordBytes = new Uint8Array(await slice.arrayBuffer());
    const decoded = decodeEmbeddedFragment(recordBytes);
    if (!decoded) continue;
    parts.push(decoded.payload);
    total += decoded.payload.length;
  }
  if (!parts.length) return new Uint8Array(0);
  const out = new Uint8Array(Math.min(total, maxBytes));
  let o = 0;
  for (const p of parts) {
    const take = Math.min(p.length, maxBytes - o);
    out.set(p.subarray(0, take), o);
    o += take;
    if (o >= maxBytes) break;
  }
  return out;
}

export async function readEmbeddedTrackMetadataPrefix(
  source: File | Blob,
  index: EmbeddedAlbumPackageIndex,
  trackId: string,
): Promise<ReturnType<typeof parseMp5MetadataPrefix>> {
  const bytes = await readEmbeddedTrackPrefixBytes(source, index, trackId, METADATA_PROBE_BYTES);
  if (!bytes.length) return { meta: [] };
  return parseMp5MetadataPrefix(bytes);
}

export async function readEmbeddedTrackDurationMs(
  source: File | Blob,
  index: EmbeddedAlbumPackageIndex,
  trackId: string,
): Promise<number | null> {
  const meta = await readEmbeddedTrackMetadataPrefix(source, index, trackId);
  return meta.head ? headDurationMs(meta.head) : null;
}

export async function resolveEmbeddedAlbumDurations(
  source: File | Blob,
  index: EmbeddedAlbumPackageIndex,
  trackIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const trackId of trackIds) {
    const ms = await readEmbeddedTrackDurationMs(source, index, trackId);
    if (ms != null) out[trackId] = ms;
  }
  return out;
}
