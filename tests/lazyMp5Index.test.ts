import { describe, it, expect, afterEach } from "vitest";
import {
  byteSourceFromArrayBuffer,
  encodeStdfFragment,
  indexMp5FromByteSource,
  loadAudiFrames,
  loadStdfFragmentBytes,
  parseMp5,
  setLazyIngestThresholdForTests,
  resetLazyIngestThresholdForTests,
  writeMp5,
  CodecId,
  STDF_VERSION,
} from "@mp5/container";

describe("lazy MP5 chunk index", () => {
  afterEach(() => {
    resetLazyIngestThresholdForTests();
  });

  it("does not eager-load STDF payloads during index", async () => {
    setLazyIngestThresholdForTests(1024);
    const stemPayload = new Uint8Array(8000);
    stemPayload.fill(7);
    const frag = encodeStdfFragment({
      version: STDF_VERSION,
      stemId: "drums",
      partIndex: 0,
      partCount: 1,
      payloadLength: stemPayload.length,
      payloadCrc32: 0,
      payload: stemPayload,
    });
    const audioFrames = [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([1, 2, 3, 4]) }];
    const base = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 4n,
        encoderVersion: 1,
      },
      audioFrames,
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      extraChunks: [{ fourcc: "STDF", payload: frag }],
    });

    const indexed = await indexMp5FromByteSource(byteSourceFromArrayBuffer(base.buffer));
    expect(indexed.lazy).toBeDefined();
    expect(indexed.stdfFragments).toHaveLength(0);
    expect(indexed.lazy!.stdfFragmentIndex).toHaveLength(1);
    expect(indexed.lazy!.loadedPayloadBytes).toBeLessThan(base.length / 2);

    const eager = parseMp5(base);
    expect(eager.stdfFragments).toHaveLength(1);
    expect(eager.stdfFragments[0]!.length).toBe(frag.length);
  });

  it("loads AUDI on demand for full mix decode path", async () => {
    setLazyIngestThresholdForTests(512);
    const audioFrames = [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([9, 8, 7, 6]) }];
    const mp5 = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 4n,
        encoderVersion: 1,
      },
      audioFrames,
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
    });
    const indexed = await indexMp5FromByteSource(byteSourceFromArrayBuffer(mp5.buffer));
    expect(indexed.stdfFragments).toHaveLength(0);
    const bytesBeforeAudi = indexed.lazy!.loadedPayloadBytes;
    const frames = await loadAudiFrames(indexed);
    expect(frames[0]?.data).toEqual(audioFrames[0]!.data);
    expect(indexed.lazy!.loadedPayloadBytes).toBeGreaterThanOrEqual(bytesBeforeAudi);
  });

  it("loads single STDF fragment on demand", async () => {
    setLazyIngestThresholdForTests(1024);
    const stemPayload = new Uint8Array(4000);
    const frag = encodeStdfFragment({
      version: STDF_VERSION,
      stemId: "vocals",
      partIndex: 0,
      partCount: 1,
      payloadLength: stemPayload.length,
      payloadCrc32: 0,
      payload: stemPayload,
    });
    const mp5 = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 1n,
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array([1]) }],
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      extraChunks: [{ fourcc: "STDF", payload: frag }],
    });
    const indexed = await indexMp5FromByteSource(byteSourceFromArrayBuffer(mp5.buffer));
    const bytes = await loadStdfFragmentBytes(indexed.lazy!, 0);
    expect(bytes.length).toBe(frag.length);
    expect(indexed.lazy!.loadedPayloadBytes).toBeGreaterThan(4000);
  });
});
