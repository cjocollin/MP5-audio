/** SHA-256 hex digest for Uint8Array (browser Web Crypto). */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  // No defensive copy — digest() snapshots the BufferSource synchronously, so
  // copying first only doubled peak heap on multi-MB fingerprint inputs.
  // Cast narrows Uint8Array<ArrayBufferLike> (possibly SharedArrayBuffer-backed
  // per TS, which digest() rejects) to the ArrayBuffer-backed view callers pass.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data as Uint8Array<ArrayBuffer>,
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256HexFromArrayBuffer(buf: ArrayBuffer): Promise<string> {
  return sha256Hex(new Uint8Array(buf));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
