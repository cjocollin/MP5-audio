import { describe, it, expect } from "vitest";
import {
  crc32,
  reconstructStemFrameFromFragments,
  splitStemFrameIntoFragments,
  type StdfFragmentRecord,
} from "@mp5/container";
import { buildStemDecodeJob } from "../apps/web/src/lib/stems/buildStemJobPayload";
import type { ParsedStemFile } from "../apps/web/src/lib/stems/parseStems";

function fakeParsedStemFile(
  stemId: string,
  frags: StdfFragmentRecord[],
  dataLength: number,
): ParsedStemFile {
  const grouped = new Map<string, StdfFragmentRecord[]>();
  grouped.set(stemId, frags);
  return {
    manifest: {
      version: 1,
      fullMixInAudi: true,
      storageMode: "stdf-v1",
      stems: [
        {
          stemId,
          stemName: stemId,
          stemType: "drums",
          codecId: 0,
          sampleRate: 44100,
          channels: 2,
          durationSamples: 1000,
          byteLength: dataLength,
          defaultVolume: 1,
          soloMuteCapable: true,
          requiredForPlayback: false,
          dataOffset: 0,
          dataLength,
          fragmentCount: frags.length,
        },
      ],
    },
    stems: [
      {
        stemId,
        stemName: stemId,
        stemType: "drums",
        codecId: 0,
        sampleRate: 44100,
        channels: 2,
        durationSamples: 1000,
        byteLength: dataLength,
        defaultVolume: 1,
        soloMuteCapable: true,
        requiredForPlayback: false,
        dataOffset: 0,
        dataLength,
        fragmentCount: frags.length,
      },
    ],
    fullMixInAudi: true,
    storageMode: "stdf-v1",
    warnings: [],
    errors: [],
    stdfGrouped: grouped,
    totalEmbeddedBytes: dataLength,
  };
}

describe("STDF CRC stability (worker wire)", () => {
  it("reconstruct fails when wire omits payloadCrc32 (regression)", () => {
    const frame = new Uint8Array(9000);
    for (let i = 0; i < frame.length; i++) frame[i] = i & 0xff;
    const frags = splitStemFrameIntoFragments("92268650-a210-4902-945a-e3e767b9ca3b", frame, 4096);
    expect(frags.length).toBeGreaterThan(1);

    const badWire = frags.map((f) => ({
      version: f.version,
      stemId: f.stemId,
      partIndex: f.partIndex,
      partCount: f.partCount,
      payload: f.payload,
    })) as StdfFragmentRecord[];

    const bad = reconstructStemFrameFromFragments(
      "92268650-a210-4902-945a-e3e767b9ca3b",
      badWire,
      frame.length,
    );
    expect(bad.errors.some((e) => e.includes("CRC mismatch"))).toBe(true);
  });

  it("buildStemDecodeJob wire passes CRC after copy", () => {
    const stemId = "92268650-a210-4902-945a-e3e767b9ca3b";
    const frame = new Uint8Array(9000);
    for (let i = 0; i < frame.length; i++) frame[i] = (i * 7) & 0xff;
    const frags = splitStemFrameIntoFragments(stemId, frame, 4096);
    const file = fakeParsedStemFile(stemId, frags, frame.length);
    const stem = file.stems[0]!;

    const { job } = buildStemDecodeJob(file, stem, 0, "job-1");
    expect(job.stdfFragments?.length).toBe(frags.length);
    for (const w of job.stdfFragments!) {
      expect(w.payloadCrc32).toBe(crc32(w.payload));
      expect(w.payloadLength).toBe(w.payload.length);
    }

    const recon = reconstructStemFrameFromFragments(
      stemId,
      job.stdfFragments as StdfFragmentRecord[],
      frame.length,
    );
    expect(recon.errors).toHaveLength(0);
    expect(recon.frameData?.length).toBe(frame.length);

    const cached = file.stdfGrouped.get(stemId)!;
    for (const f of cached) {
      expect(crc32(f.payload)).toBe(f.payloadCrc32);
    }
  });

  it("two stems: job build for one does not corrupt the other", () => {
    const frameA = new Uint8Array(6000);
    const frameB = new Uint8Array(7000);
    const fragsA = splitStemFrameIntoFragments("stem-a", frameA, 3000);
    const fragsB = splitStemFrameIntoFragments("stem-b", frameB, 3000);
    const file: ParsedStemFile = {
      ...fakeParsedStemFile("stem-a", fragsA, frameA.length),
      stems: [
        fakeParsedStemFile("stem-a", fragsA, frameA.length).stems[0]!,
        fakeParsedStemFile("stem-b", fragsB, frameB.length).stems[0]!,
      ],
      stdfGrouped: new Map([
        ["stem-a", fragsA],
        ["stem-b", fragsB],
      ]),
    };
    buildStemDecodeJob(file, file.stems[0]!, 0, "a");
    buildStemDecodeJob(file, file.stems[1]!, 1, "b");
    for (const stem of file.stems) {
      const { errors } = reconstructStemFrameFromFragments(
        stem.stemId,
        file.stdfGrouped.get(stem.stemId) ?? [],
        stem.dataLength,
      );
      expect(errors).toHaveLength(0);
    }
  });
});
