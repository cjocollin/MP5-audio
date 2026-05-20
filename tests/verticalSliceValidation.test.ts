/**
 * Hard validation pass — PCM fallback vertical slice (no new product features).
 */
import { describe, it, expect } from "vitest";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import {
  CodecId,
  MAGIC_STR,
  MAJOR_VERSION,
  CHUNK_HEADER_SIZE,
  FILE_HEADER_SIZE,
  parseMp5,
  writeMp5,
  validateParsedFile,
  crc32,
  type AudioFrame,
} from "@mp5/container";

const FIXTURE_DIR = join(process.cwd(), "test-fixtures");
const FIXTURE_PATH = join(FIXTURE_DIR, "validation_pcm_slice.mp5");

function generatePcmMp5(): Uint8Array {
  const sampleRate = 44100;
  const durationSec = 0.25;
  const n = Math.floor(sampleRate * durationSec);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000);
  }
  const pcmBytes = new Uint8Array(samples.buffer);
  const frames: AudioFrame[] = [
    { frameIndex: 0, blockType: 0, flags: 0, data: pcmBytes },
  ];
  const peaks: number[] = [];
  const step = Math.max(1, Math.floor(n / 256));
  for (let i = 0; i < n; i += step) {
    peaks.push(Math.abs(samples[i]!) / 32768);
  }
  return writeMp5({
    head: {
      codecId: CodecId.PCM,
      channels: 1,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate,
      totalSamples: BigInt(n),
      encoderVersion: 1,
    },
    meta: [
      { key: "title", value: "Validation Tone" },
      { key: "artist", value: "MP5 Test Suite" },
      { key: "album", value: "Vertical Slice" },
    ],
    audioFrames: frames,
    seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    waveform: peaks,
    info: [{ key: "encoder", value: "MP5 validation PCM fallback" }],
    optional: new Map([["MOOD", new TextEncoder().encode('{"tags":["test"]}')]]),
  });
}

function decodePcmFromParsed(parsed: ReturnType<typeof parseMp5>): Int16Array {
  const frame = parsed.audioFrames[0]?.data;
  if (!frame) throw new Error("no frame");
  return new Int16Array(frame.slice().buffer, 0, frame.byteLength / 2);
}

function listChunkFourCCs(buf: Uint8Array): string[] {
  const fourccs: string[] = [];
  let offset = FILE_HEADER_SIZE;
  while (offset + CHUNK_HEADER_SIZE <= buf.length) {
    const fourcc = String.fromCharCode(
      buf[offset]!,
      buf[offset + 1]!,
      buf[offset + 2]!,
      buf[offset + 3]!,
    );
    const size = new DataView(buf.buffer, buf.byteOffset).getUint32(offset + 4, true);
    fourccs.push(fourcc);
    offset += CHUNK_HEADER_SIZE + size;
  }
  return fourccs;
}

describe("vertical slice validation (PCM fallback)", () => {
  const mp5 = generatePcmMp5();

  it("1. generates a valid .mp5 file on disk", () => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFileSync(FIXTURE_PATH, mp5);
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(readFileSync(FIXTURE_PATH).length).toBeGreaterThan(100);
  });

  it("2. uses official MP5A magic and chunk structure", () => {
    const magic = String.fromCharCode(mp5[0]!, mp5[1]!, mp5[2]!, mp5[3]!);
    expect(magic).toBe(MAGIC_STR);
    expect(mp5[4]).toBe(MAJOR_VERSION);
    const chunks = listChunkFourCCs(mp5);
    expect(chunks).toContain("HEAD");
    expect(chunks).toContain("META");
    expect(chunks).toContain("AUDI");
    expect(chunks.indexOf("HEAD")).toBeLessThan(chunks.indexOf("AUDI"));
  });

  it("3. parser reads file back", () => {
    const disk = readFileSync(FIXTURE_PATH);
    const parsed = parseMp5(disk);
    expect(parsed.head?.codecId).toBe(CodecId.PCM);
    expect(parsed.head?.sampleRate).toBe(44100);
    expect(parsed.audioFrames.length).toBeGreaterThan(0);
  });

  it("4. validator passes parsed file", () => {
    const parsed = parseMp5(mp5);
    expect(() => validateParsedFile(parsed, 8)).not.toThrow();
  });

  it("5. metadata roundtrip for display", () => {
    const parsed = parseMp5(mp5);
    const title = parsed.meta.find((m) => m.key === "title")?.value;
    const artist = parsed.meta.find((m) => m.key === "artist")?.value;
    expect(title).toBe("Validation Tone");
    expect(artist).toBe("MP5 Test Suite");
  });

  it("6. player decode path — PCM bit-exact (playback prerequisite)", () => {
    const parsed = parseMp5(mp5);
    const original = new Int16Array(
      parsed.audioFrames[0]!.data.slice().buffer,
      0,
      parsed.audioFrames[0]!.data.byteLength / 2,
    );
    const decoded = decodePcmFromParsed(parsed);
    expect(decoded.length).toBe(original.length);
    expect(decoded).toEqual(original);
    const floatSamples = Float32Array.from(decoded, (s) => s / 32768);
    expect(floatSamples.some((v) => Math.abs(v) > 0.01)).toBe(true);
  });

  it("7. unknown optional chunk MOOD stored; XXXX would be skipped if invalid CRC", () => {
    const parsed = parseMp5(mp5);
    expect(parsed.optional.get("MOOD")).toBeDefined();
    const badOptional = new Map([["ZZZZ", new Uint8Array([1, 2, 3])]]);
    const withUnknown = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 100n,
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(200) }],
      optional: badOptional,
    });
    const p2 = parseMp5(withUnknown);
    expect(p2.optional.get("ZZZZ")).toBeDefined();
  });

  it("8. rejects corrupted/invalid files safely", () => {
    expect(() => parseMp5(new Uint8Array([0, 0, 0, 0]))).toThrow();
    const truncated = mp5.slice(0, 20);
    expect(() => parseMp5(truncated)).toThrow();
    const badCrc = new Uint8Array(mp5);
    const headPayloadOff = FILE_HEADER_SIZE + CHUNK_HEADER_SIZE;
    badCrc[headPayloadOff] ^= 0xff;
    expect(() => parseMp5(badCrc)).toThrow();
  });

  it("9. converter-style post-export validation (parse + validate)", () => {
    const exported = generatePcmMp5();
    const parsed = parseMp5(exported);
    expect(() => validateParsedFile(parsed, 10)).not.toThrow();
  });
});
