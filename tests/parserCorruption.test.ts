import { describe, it, expect } from "vitest";
import { parseMp5, writeMp5, CodecId, crc32 } from "@mp5/container";

describe("parser corruption edge cases", () => {
  it("rejects bad magic", () => {
    const bad = new Uint8Array(32);
    bad.set([0x58, 0x58, 0x58, 0x58], 0);
    expect(() => parseMp5(bad)).toThrow(/magic/i);
  });

  it("rejects HEAD CRC failure", () => {
    const buf = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 0n,
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(2) }],
    });
    const corrupted = new Uint8Array(buf);
    corrupted[corrupted.length - 1] ^= 0xff;
    expect(() => parseMp5(corrupted)).toThrow();
  });

  it("skips optional chunk with bad CRC", () => {
    const buf = writeMp5({
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
      optional: new Map([["MOOD", new TextEncoder().encode("ok")]]),
    });
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let off = 12;
    while (off + 16 <= buf.length) {
      const fourcc = String.fromCharCode(
        view.getUint8(off),
        view.getUint8(off + 1),
        view.getUint8(off + 2),
        view.getUint8(off + 3),
      );
      if (fourcc === "MOOD") {
        view.setUint32(off + 12, 0, true);
        break;
      }
      const size = view.getUint32(off + 4, true);
      off += 16 + size;
    }
    const p = parseMp5(buf);
    expect(p.warnings.some((w) => w.includes("MOOD"))).toBe(true);
    expect(p.optional.has("MOOD")).toBe(false);
  });
});
