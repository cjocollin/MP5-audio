/** SHA-256 hex digest for Uint8Array (browser Web Crypto). */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  // No defensive copy — digest() snapshots the BufferSource synchronously, so
  // copying first only doubled peak heap on multi-MB fingerprint inputs.
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256HexFromArrayBuffer(buf: ArrayBuffer): Promise<string> {
  return sha256Hex(new Uint8Array(buf));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
