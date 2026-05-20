import { MAX_META_VALUE } from "./constants.js";
import { Mp5SecurityError } from "./errors.js";
import type { MetaField } from "./types.js";

export function sanitizeMetadata(text: string): string {
  return text
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .slice(0, MAX_META_VALUE);
}

export function encodeMeta(fields: MetaField[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: number[] = [];
  for (const { key, value } of fields) {
    const k = enc.encode(sanitizeMetadata(key));
    const v = enc.encode(sanitizeMetadata(value));
    if (v.length > MAX_META_VALUE) {
      throw new Mp5SecurityError(`Meta value too long: ${key}`);
    }
    chunks.push(k.length & 0xff, (k.length >> 8) & 0xff);
    chunks.push(...k);
    chunks.push(v.length & 0xff, (v.length >> 8) & 0xff);
    chunks.push(...v);
  }
  return new Uint8Array(chunks);
}

export function decodeMeta(payload: Uint8Array): MetaField[] {
  const dec = new TextDecoder();
  const fields: MetaField[] = [];
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let o = 0;
  while (o + 4 <= payload.length) {
    const keyLen = view.getUint16(o, true);
    o += 2;
    if (o + keyLen + 2 > payload.length) break;
    const key = dec.decode(payload.subarray(o, o + keyLen));
    o += keyLen;
    const valLen = view.getUint16(o, true);
    o += 2;
    if (o + valLen > payload.length) break;
    const value = sanitizeMetadata(dec.decode(payload.subarray(o, o + valLen)));
    o += valLen;
    fields.push({ key, value });
  }
  return fields;
}
