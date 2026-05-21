import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CodecId,
  MAX_CHUNK_PAYLOAD,
  buildStemOptionalChunks,
  decodeStemFrameEntries,
  decodeStemManifest,
  decodeStdfFragment,
  encodeStda,
  encodeStdfFragment,
  parseMp5,
  reconstructStemFrameFromFragments,
  setStdfFragmentPayloadTargetForTests,
  resetStdfFragmentPayloadTarget,
  splitStemFrameIntoFragments,
  validateStemFromParsed,
  writeMp5,
  type StemBundleInput,
} from "@mp5/container";

function maxChunkPayloadSize(file: Uint8Array): number {
  let max = 0;
  let o = 12;
  while (o + 16 <= file.length) {
    const v = new DataView(file.buffer, file.byteOffset + o);
    const size = v.getUint32(4, true);
    max = Math.max(max, size);
    o += 16 + size;
  }
  return max;
}

function stemBundle(id: string, bytes: number): StemBundleInput {
  const frameData = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) frameData[i] = (i * 17) & 0xff;
  return {
    stemId: id,
    stemName: id,
    stemType: "drums",
    codecId: CodecId.PCM,
    sampleRate: 44100,
    channels: 2,
    durationSamples: 100,
    frameData,
  };
}

describe("STDA v1 legacy path", () => {
  it("round-trips small stems in one STDA chunk", () => {
    const bundle = stemBundle("a", 4000);
    const { optional, extraChunks, manifest } = buildStemOptionalChunks([bundle]);
    expect(manifest.storageMode).toBe("stda-v1");
    expect(extraChunks).toHaveLength(0);
    expect(optional.has("STDA")).toBe(true);
    const { entries } = decodeStemFrameEntries(manifest, optional.get("STDA"), []);
    expect(entries[0]).toEqual(bundle.frameData);
  });
});

describe("STDF segmented storage", () => {
  beforeEach(() => {
    setStdfFragmentPayloadTargetForTests(4096);
  });
  afterEach(() => {
    resetStdfFragmentPayloadTarget();
  });

  it("chooses STDF when STDA would exceed safe limit", () => {
    const stems = Array.from({ length: 10 }, (_, i) => stemBundle(`stem-${i}`, 5_500_000));
    const stda = encodeStda(stems.map((s) => s.frameData));
    expect(stda.length).toBeGreaterThan(48 * 1024 * 1024);

    const { optional, extraChunks, manifest, report } = buildStemOptionalChunks(stems);
    expect(report.chosenStorage).toBe("stdf-v1");
    expect(manifest.storageMode).toBe("stdf-v1");
    expect(optional.has("STDA")).toBe(false);
    expect(extraChunks.length).toBeGreaterThan(10);
    for (const ch of extraChunks) {
      expect(ch.payload.length).toBeLessThanOrEqual(MAX_CHUNK_PAYLOAD);
    }
  });

  it("writes MP5 with no chunk over 64 MiB and reconstructs bytes", () => {
    const original = stemBundle("vocals", 12_000);
    const { optional, extraChunks } = buildStemOptionalChunks([original, stemBundle("bass", 8000)]);
    const mp5 = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 2,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 44100n,
        encoderVersion: 1,
      },
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(100) }],
      optional,
      extraChunks,
    });
    expect(maxChunkPayloadSize(mp5)).toBeLessThanOrEqual(MAX_CHUNK_PAYLOAD);

    const parsed = parseMp5(mp5);
    const check = validateStemFromParsed(parsed);
    expect(check.valid).toBe(true);
    const m = decodeStemManifest(parsed.optional.get("STEM"));
    const { entries } = decodeStemFrameEntries(
      m!,
      parsed.optional.get("STDA"),
      parsed.stdfFragments,
    );
    expect(entries[0]).toEqual(original.frameData);
  });

  it("rejects duplicate fragment index", () => {
    const frags = splitStemFrameIntoFragments("x", new Uint8Array(8000));
    const dup = frags[0]!;
    const { frameData, errors } = reconstructStemFrameFromFragments("x", [dup, dup], 8000);
    expect(frameData).toBeNull();
    expect(errors.some((e) => /duplicate/i.test(e))).toBe(true);
  });

  it("rejects bad checksum", () => {
    const frag = splitStemFrameIntoFragments("x", new Uint8Array([1, 2, 3]))[0]!;
    const bad = { ...frag, payloadCrc32: 0 };
    const { errors } = reconstructStemFrameFromFragments("x", [bad], 3);
    expect(errors.some((e) => /CRC/i.test(e))).toBe(true);
  });

  it("reports missing fragment", () => {
    const frags = splitStemFrameIntoFragments("x", new Uint8Array(10_000));
    const partial = frags.filter((f) => f.partIndex === 0);
    const { errors } = reconstructStemFrameFromFragments("x", partial, 10_000);
    expect(errors.some((e) => /missing/i.test(e))).toBe(true);
  });

  it("encodeStdfFragment roundtrip", () => {
    const frag = splitStemFrameIntoFragments("id-1", new Uint8Array([9, 8, 7]))[0]!;
    const encoded = encodeStdfFragment(frag);
    const decoded = decodeStdfFragment(encoded);
    expect(decoded?.payload).toEqual(frag.payload);
    expect(decoded?.stemId).toBe("id-1");
  });
});
