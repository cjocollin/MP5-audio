/** SHA-256 hex digest (Web Crypto — Node 18+ and browsers). */
export async function sha256HexDigest(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) {
    throw new Error("SHA-256 requires Web Crypto (crypto.subtle.digest)");
  }
  const copy = data.slice();
  const digest = await subtle.digest("SHA-256", copy);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
