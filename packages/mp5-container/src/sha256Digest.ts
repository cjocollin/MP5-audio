/** SHA-256 hex digest (Web Crypto — Node 18+ and browsers). */
export async function sha256HexDigest(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) {
    throw new Error("SHA-256 requires Web Crypto (crypto.subtle.digest)");
  }
  // No defensive copy: crypto.subtle.digest() takes its own snapshot of the
  // BufferSource synchronously (WebCrypto "get a copy of the bytes"), so a
  // pre-copy only doubled peak heap — on integrity checks that hash 27-42 MB
  // AUDI/PCM buffers that was tens of MB of pure waste per verify.
  // The cast narrows Uint8Array<ArrayBufferLike> (which TS says could be
  // SharedArrayBuffer-backed, and digest() rejects) to the ArrayBuffer-backed
  // view every caller here actually passes — narrowing, not re-copying.
  const digest = await subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
