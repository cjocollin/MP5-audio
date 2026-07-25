/**
 * Int16 view over PCM byte data, corrupt-safe.
 *
 * Frame payloads are often `subarray` views into the file buffer, so their
 * `byteOffset` can be odd — and `Int16Array` requires 2-byte alignment. An odd
 * `byteLength` (a truncated/corrupt PCM stream) would also make `byteLength / 2`
 * fractional and throw `RangeError`. Realign via copy when needed, and floor the
 * sample count so a dangling half-sample is dropped instead of crashing.
 */
export function alignedInt16(bytes: Uint8Array): Int16Array {
  const aligned = bytes.byteOffset % 2 === 0 ? bytes : bytes.slice();
  const sampleCount = Math.floor(aligned.byteLength / 2);
  return new Int16Array(aligned.buffer, aligned.byteOffset, sampleCount);
}
