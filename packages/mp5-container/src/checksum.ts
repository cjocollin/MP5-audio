import { yieldToEventLoop } from "./scheduling.js";

/** CRC32-IEEE */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * CRC32 with periodic yields so multi‑MB checksums do not freeze the UI thread.
 */
export async function crc32Async(
  data: Uint8Array,
  opts?: {
    chunkBytes?: number;
    yieldToMain?: () => Promise<void>;
  },
): Promise<number> {
  const chunkBytes = Math.max(64 * 1024, opts?.chunkBytes ?? 512 * 1024);
  const yieldFn = opts?.yieldToMain ?? yieldToEventLoop;

  let crc = 0xffffffff;
  for (let i = 0; i < data.length; ) {
    const end = Math.min(data.length, i + chunkBytes);
    for (; i < end; i++) {
      crc = TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
    }
    if (i < data.length) await yieldFn();
  }
  return (crc ^ 0xffffffff) >>> 0;
}
