import { Mp5ParseError, Mp5SecurityError } from "./errors.js";

export const MAX_COVER_SIZE = 2 * 1024 * 1024;
const COVR_MAGIC = new Uint8Array([0x43, 0x56, 0x31, 0x01]); // "CV1\x01"

export interface CoverArt {
  mime: string;
  data: Uint8Array;
}

function sniffMime(data: Uint8Array): string {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  if (data.length >= 6) {
    const h = String.fromCharCode(...data.subarray(0, 6));
    if (h === "GIF87a" || h === "GIF89a") return "image/gif";
  }
  if (data.length >= 12) {
    const w = String.fromCharCode(...data.subarray(8, 12));
    if (w === "WEBP") return "image/webp";
  }
  return "application/octet-stream";
}

export function encodeCover(art: CoverArt): Uint8Array {
  if (!art.data.length) {
    throw new Mp5SecurityError("Cover data is empty");
  }
  if (art.data.length > MAX_COVER_SIZE) {
    throw new Mp5SecurityError(`Cover exceeds ${MAX_COVER_SIZE} bytes`);
  }
  const mime = art.mime.slice(0, 64);
  const mimeBytes = new TextEncoder().encode(mime);
  if (mimeBytes.length > 255) {
    throw new Mp5SecurityError("Cover MIME type too long");
  }
  const out = new Uint8Array(COVR_MAGIC.length + 1 + mimeBytes.length + art.data.length);
  out.set(COVR_MAGIC, 0);
  out[COVR_MAGIC.length] = mimeBytes.length;
  out.set(mimeBytes, COVR_MAGIC.length + 1);
  out.set(art.data, COVR_MAGIC.length + 1 + mimeBytes.length);
  return out;
}

export function decodeCover(payload: Uint8Array): CoverArt | null {
  if (!payload.length) return null;
  if (payload.length > MAX_COVER_SIZE + 300) {
    throw new Mp5ParseError("COVR chunk too large");
  }

  const hasHeader =
    payload.length >= COVR_MAGIC.length + 2 &&
    COVR_MAGIC.every((b, i) => payload[i] === b);

  if (hasHeader) {
    const mimeLen = payload[COVR_MAGIC.length]!;
    const mimeStart = COVR_MAGIC.length + 1;
    if (mimeStart + mimeLen > payload.length) {
      throw new Mp5ParseError("COVR MIME length invalid");
    }
    const mime = new TextDecoder().decode(payload.subarray(mimeStart, mimeStart + mimeLen));
    const data = payload.subarray(mimeStart + mimeLen);
    if (!data.length) return null;
    return { mime: mime || sniffMime(data), data };
  }

  return { mime: sniffMime(payload), data: payload };
}
