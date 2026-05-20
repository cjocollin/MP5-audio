import { describe, it, expect } from "vitest";
import { crc32, parseMp5, writeMp5, CodecId } from "@mp5/container";

function writeChunk(fourcc: string, payload: Uint8Array, withCrc = true): Uint8Array {
  const header = new Uint8Array(16);
  const hv = new DataView(header.buffer);
  for (let i = 0; i < 4; i++) header[i] = fourcc.charCodeAt(i);
  hv.setUint32(4, payload.length, true);
  if (withCrc) {
    hv.setUint16(8, 1, true);
    hv.setUint32(12, crc32(payload), true);
  }
  const out = new Uint8Array(header.length + payload.length);
  out.set(header, 0);
  out.set(payload, header.length);
  return out;
}

describe("unknown optional chunk", () => {
  it("stores unknown fourcc in optional map", () => {
    const base = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 0n,
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(0) }],
    });
    const custom = new TextEncoder().encode("future");
    const chunk = writeChunk("FUTR", custom);
    const combined = new Uint8Array(base.length + chunk.length);
    combined.set(base, 0);
    combined.set(chunk, base.length);
    const p = parseMp5(combined);
    expect(p.optional.get("FUTR")).toEqual(custom);
  });
});
