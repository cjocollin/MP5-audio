import { describe, it, expect, afterEach } from "vitest";
import {
  auditStdfStemIndex,
  byteSourceFromArrayBuffer,
  buildStemOptionalChunks,
  CodecId,
  groupStdfFragmentIndex,
  groupStdfFragments,
  indexMp5FromByteSource,
  loadStdfFragmentsForStem,
  parseMp5,
  setLazyIngestThresholdForTests,
  resetLazyIngestThresholdForTests,
  setStdfFragmentPayloadTargetForTests,
  resetStdfFragmentPayloadTarget,
  validateStemFromParsed,
  writeMp5,
} from "@mp5/container";
import { buildStemDecodeJob } from "../apps/web/src/lib/stems/buildStemJobPayload";
import { parseStemsFromFile } from "../apps/web/src/lib/stems/parseStems";

function stemBundle(
  stemId: string,
  stemName: string,
  stemType: "synths" | "drums" | "bass",
  bytes: number,
) {
  const frameData = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) frameData[i] = (i * 13) & 0xff;
  return {
    stemId,
    stemName,
    stemType,
    codecId: CodecId.PCM,
    sampleRate: 44100,
    channels: 2,
    durationSamples: Math.floor(bytes / 4),
    frameData,
  };
}

describe("lazy STDF stem lookup (v0.10.7)", () => {
  afterEach(() => {
    resetLazyIngestThresholdForTests();
    resetStdfFragmentPayloadTarget();
  });

  it("lazy index finds every manifest stem including display name Synths", async () => {
    setLazyIngestThresholdForTests(1024);
    resetStdfFragmentPayloadTarget();

    const synthsId = "92268650-a210-4902-945a-e3e767b9ca3b";
    const stemBytes = 6_500_000;
    const stems = [
      stemBundle(synthsId, "Synths", "synths", stemBytes),
      stemBundle("drums-1", "Drums", "drums", stemBytes),
      stemBundle("bass-1", "Bass", "bass", stemBytes),
      stemBundle("guitar-1", "Guitar", "drums", stemBytes),
      stemBundle("piano-1", "Piano", "drums", stemBytes),
      stemBundle("strings-1", "Strings", "drums", stemBytes),
      stemBundle("perc-1", "Perc", "drums", stemBytes),
      stemBundle("vox-1", "Lead Vox", "drums", stemBytes),
      stemBundle("bg-1", "BG Vox", "drums", stemBytes),
      stemBundle("fx-1", "FX", "drums", stemBytes),
    ];
    const { optional, extraChunks } = buildStemOptionalChunks(stems);
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
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(200) }],
      optional,
      extraChunks,
    });

    const eager = parseMp5(mp5);
    const lazy = await indexMp5FromByteSource(byteSourceFromArrayBuffer(mp5.buffer));
    const manifest = parseStemsFromFile(eager)!.manifest;
    expect(manifest.storageMode).toBe("stdf-v1");

    const eagerGrouped = groupStdfFragments(eager.stdfFragments);
    const lazyGrouped = groupStdfFragmentIndex(lazy.lazy!.stdfFragmentIndex);
    const audit = auditStdfStemIndex(manifest, lazy.lazy!.stdfFragmentIndex);

    expect(audit).toHaveLength(10);
    for (const stem of manifest.stems) {
      expect(lazyGrouped.get(stem.stemId)?.length).toBe(eagerGrouped.get(stem.stemId)?.length);
      const entry = audit.find((a) => a.stemId === stem.stemId);
      expect(entry?.status).toBe("available");
      expect(entry?.stemName).toBe(stem.stemName);
    }

    const synthsAudit = audit.find((a) => a.stemName === "Synths");
    expect(synthsAudit?.stemId).toBe(synthsId);
    expect(synthsAudit?.indexedFragmentCount).toBeGreaterThan(0);

    const check = validateStemFromParsed(lazy);
    expect(check.valid).toBe(true);
  });

  it("buildStemDecodeJob loads lazy STDF fragments by stemId for worker wire", async () => {
    setLazyIngestThresholdForTests(1024);
    resetStdfFragmentPayloadTarget();

    const stemId = "92268650-a210-4902-945a-e3e767b9ca3b";
    const { optional, extraChunks } = buildStemOptionalChunks([
      stemBundle(stemId, "Synths", "synths", 26_000_000),
      stemBundle("drums-1", "Drums", "drums", 26_000_000),
    ]);
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

    const lazy = await indexMp5FromByteSource(byteSourceFromArrayBuffer(mp5.buffer));
    const parsed = parseStemsFromFile(lazy)!;
    expect(parsed.storageMode).toBe("stdf-v1");
    expect(parsed.stdfGrouped.size).toBe(0);
    expect(parsed.stdfIndexGrouped?.get(stemId)?.length).toBeGreaterThan(0);

    const stem = parsed.stems.find((s) => s.stemName === "Synths")!;
    const { job, transfer } = await buildStemDecodeJob(parsed, stem, 0, "job-synths");
    expect(job.stdfFragments?.length).toBeGreaterThan(0);
    expect(job.stdfFragments!.every((f) => f.stemId === stemId)).toBe(true);
    expect(transfer.length).toBe(job.stdfFragments!.length);

    const loaded = await loadStdfFragmentsForStem(lazy.lazy!, stemId);
    expect(loaded.length).toBe(job.stdfFragments!.length);
  });
});
