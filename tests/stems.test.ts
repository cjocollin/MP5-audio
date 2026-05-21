import { describe, it, expect } from "vitest";
import {
  CodecId,
  buildStemOptionalChunks,
  decodeStemManifest,
  decodeStdaEntries,
  encodeStda,
  encodeStemManifest,
  parseMp5,
  validateStemChunks,
  writeMp5,
  type StemBundleInput,
} from "@mp5/container";
import { validateStemsForExport, type PendingStemPcm } from "../apps/web/src/converter/stemValidation";
import { parseStemsFromFile, stemCount, hasStemChunks } from "../apps/web/src/lib/stems/parseStems";

function minimalMp5(optional?: Map<string, Uint8Array>) {
  return writeMp5({
    head: {
      codecId: CodecId.PCM,
      channels: 1,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: 48000,
      totalSamples: 4800n,
      encoderVersion: 1,
    },
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(9600) }],
    optional,
  });
}

describe("STEM chunk roundtrip", () => {
  it("encodes and decodes STEM manifest with STDA payloads", () => {
    const frameA = new Uint8Array([1, 2, 3, 4]);
    const frameB = new Uint8Array([5, 6, 7, 8]);
    const { optional, manifest } = buildStemOptionalChunks([
      {
        stemId: "s1",
        stemName: "Drums",
        stemType: "drums",
        codecId: CodecId.MP5L,
        sampleRate: 48000,
        channels: 2,
        durationSamples: 2400,
        frameData: frameA,
      },
      {
        stemId: "s2",
        stemName: "Bass",
        stemType: "bass",
        codecId: CodecId.MP5L,
        sampleRate: 48000,
        channels: 2,
        durationSamples: 2400,
        frameData: frameB,
      },
    ]);

    expect(manifest.stems).toHaveLength(2);
    expect(manifest.fullMixInAudi).toBe(true);
    const decoded = decodeStemManifest(optional.get("STEM"));
    expect(decoded?.stems[0]?.stemName).toBe("Drums");
    const entries = decodeStdaEntries(optional.get("STDA"));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual(frameA);
    expect(entries[1]).toEqual(frameB);
  });

  it("rejects invalid stem manifest when counts mismatch", () => {
    const manifest = decodeStemManifest(
      encodeStemManifest({
        version: 1,
        fullMixInAudi: true,
        stems: [
          {
            stemId: "x",
            stemName: "X",
            stemType: "custom",
            codecId: CodecId.MP5L,
            sampleRate: 44100,
            channels: 2,
            durationSamples: 100,
            byteLength: 10,
            defaultVolume: 1,
            soloMuteCapable: true,
            requiredForPlayback: false,
            dataOffset: 0,
            dataLength: 10,
          },
        ],
      }),
    )!;
    const result = validateStemChunks(manifest, encodeStda([]));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("MP5 with full mix and stems still parses", () => {
    const { optional } = buildStemOptionalChunks([
      {
        stemId: "v",
        stemName: "Vocals",
        stemType: "lead_vocals",
        codecId: CodecId.PCM,
        sampleRate: 48000,
        channels: 1,
        durationSamples: 4800,
        frameData: new Uint8Array(9600),
      },
    ]);
    const buf = minimalMp5(optional);
    const parsed = parseMp5(buf);
    expect(parsed.audioFrames.length).toBe(1);
    expect(stemCount(parsed)).toBe(1);
    expect(hasStemChunks(parsed)).toBe(true);
    const stems = parseStemsFromFile(parsed);
    expect(stems?.stems[0]?.stemName).toBe("Vocals");
  });

  it("MP5 without stems still parses and has no stem UI data", () => {
    const parsed = parseMp5(minimalMp5());
    expect(hasStemChunks(parsed)).toBe(false);
    expect(parseStemsFromFile(parsed)).toBeNull();
  });
});

describe("converter stem validation", () => {
  const mix = { sampleRate: 48000, channels: 2, durationSec: 1 };

  it("flags sample rate mismatch as error", () => {
    const stems: PendingStemPcm[] = [
      {
        id: "1",
        name: "Drums",
        stemType: "drums",
        fileName: "d.wav",
        samples: new Int16Array(96000),
        sampleRate: 44100,
        channels: 2,
        defaultVolume: 1,
        explicitContent: false,
        fileSize: 1000,
      },
    ];
    const { canExport, issues } = validateStemsForExport(mix, stems);
    expect(canExport).toBe(false);
    expect(issues.some((i) => i.level === "error")).toBe(true);
  });

  it("allows export with duration warning only", () => {
    const stems: PendingStemPcm[] = [
      {
        id: "1",
        name: "Drums",
        stemType: "drums",
        fileName: "d.wav",
        samples: new Int16Array(48000 * 2 * 2),
        sampleRate: 48000,
        channels: 2,
        defaultVolume: 1,
        explicitContent: false,
        fileSize: 1000,
      },
    ];
    const { canExport, issues } = validateStemsForExport(mix, stems);
    expect(canExport).toBe(true);
    expect(issues.some((i) => i.level === "warning")).toBe(true);
  });
});
