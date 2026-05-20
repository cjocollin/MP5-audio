/** Read 16-bit PCM WAV for compatibility tests (mono/stereo, common rates). */
export function readWavPcm(bytes: Uint8Array): {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (riff !== "RIFF") throw new Error("Not a RIFF WAV");
  let offset = 12;
  let sampleRate = 44100;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    }
    if (id === "data") {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
  }
  const sampleCount = dataSize / 2;
  const samples = new Int16Array(
    bytes.buffer,
    bytes.byteOffset + dataOffset,
    sampleCount,
  );
  return { samples, sampleRate, channels };
}
