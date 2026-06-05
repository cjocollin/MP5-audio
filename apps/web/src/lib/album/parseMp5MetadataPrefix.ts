import {
  CHUNK_FLAG_CRC,
  CHUNK_HEADER_SIZE,
  FILE_HEADER_SIZE,
  MAGIC_STR,
  MAJOR_VERSION,
  crc32,
  decodeCover,
  decodeMeta,
  parseHead,
  type Mp5File,
} from "@mp5/container";

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/** Parse HEAD / COVR / META from a prefix; stops cleanly when data ends mid-chunk. */
export function parseMp5MetadataPrefix(buffer: ArrayBuffer | Uint8Array): Pick<
  Mp5File,
  "head" | "coverArt" | "cover" | "meta"
> {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const out: Pick<Mp5File, "head" | "coverArt" | "cover" | "meta"> = { meta: [] };
  if (data.length < FILE_HEADER_SIZE) return out;

  const magic = readFourCC(new DataView(data.buffer, data.byteOffset), 0);
  if (magic !== MAGIC_STR || data[4] !== MAJOR_VERSION) return out;

  let offset = FILE_HEADER_SIZE;
  while (offset + CHUNK_HEADER_SIZE <= data.length) {
    const hv = new DataView(data.buffer, data.byteOffset + offset);
    const fourcc = readFourCC(hv, 0);
    const payloadSize = hv.getUint32(4, true);
    const flags = hv.getUint16(8, true);
    const storedCrc = hv.getUint32(12, true);
    const payloadStart = offset + CHUNK_HEADER_SIZE;
    const payloadEnd = payloadStart + payloadSize;
    if (payloadEnd > data.length) break;

    const payload = data.slice(payloadStart, payloadEnd);
    offset = payloadEnd;

    if (flags & CHUNK_FLAG_CRC) {
      if (crc32(payload) !== storedCrc) continue;
    }

    switch (fourcc) {
      case "HEAD":
        out.head = parseHead(payload);
        break;
      case "META":
        out.meta = decodeMeta(payload);
        break;
      case "COVR": {
        out.cover = payload;
        try {
          const art = decodeCover(payload);
          if (art) out.coverArt = art;
        } catch {
          /* skip bad cover */
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}
