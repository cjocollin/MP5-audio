import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  CodecId,
  crc32,
  decodeStdaEntries,
  decodeStemManifest,
  parseMp5,
  STEM_DATA_FOURCC,
  validateParsedFile,
  validateStemChunks,
  validateStemOptionalMap,
} from "@mp5/container";
import { parseStemsFromFile } from "../apps/web/src/lib/stems/parseStems";
import { assessStemMixSafety } from "../apps/web/src/lib/stems/stemLimits";

const STEM_FIXTURE = join(process.cwd(), "test-fixtures", "demo_mp5l_v3_stems.mp5");

const hasFixture = existsSync(STEM_FIXTURE);

describe("demo stem fixture validation", () => {
  it.skipIf(!hasFixture)("demo_mp5l_v3_stems.mp5 passes STEM/STDA validation", () => {
    const buf = readFileSync(STEM_FIXTURE);
    const parsed = parseMp5(buf);
    validateParsedFile(parsed, 32);

    expect(parsed.head?.codecId).toBe(CodecId.MP5L);
    expect(parsed.audioFrames.length).toBeGreaterThan(0);

    const manifest = decodeStemManifest(parsed.optional.get("STEM"));
    const stda = parsed.optional.get(STEM_DATA_FOURCC);
    const check = validateStemChunks(manifest, stda);
    expect(check.valid, check.errors.join("; ")).toBe(true);
    expect(manifest?.fullMixInAudi).toBe(true);
    expect(manifest!.stems.length).toBeGreaterThanOrEqual(3);

    const types = manifest!.stems.map((s) => s.stemType);
    expect(types).toContain("drums");
    expect(types).toContain("bass");
    expect(types).toContain("lead_vocals");

    const entries = decodeStdaEntries(stda);
    for (let i = 0; i < manifest!.stems.length; i++) {
      const stem = manifest!.stems[i]!;
      const entry = entries[i]!;
      expect(stem.dataLength).toBe(entry.length);
      expect(stem.checksum).toBe(crc32(entry).toString(16).padStart(8, "0"));
    }
  });

  it.skipIf(!hasFixture)("parses stems for player without breaking AUDI", () => {
    const parsed = parseMp5(readFileSync(STEM_FIXTURE));
    const stems = parseStemsFromFile(parsed);
    expect(stems?.stems.length).toBeGreaterThanOrEqual(3);
    expect(stems?.fullMixInAudi).toBe(true);
    expect(assessStemMixSafety(stems!.stems).ok).toBe(true);
  });

  it("rejects corrupt checksum safely", () => {
    const manifest = decodeStemManifest(
      new Uint8Array(
        Buffer.from(
          JSON.stringify({
            version: 1,
            fullMixInAudi: true,
            stems: [
              {
                stemId: "x",
                stemName: "X",
                stemType: "drums",
                codecId: CodecId.MP5L,
                sampleRate: 44100,
                channels: 1,
                durationSamples: 100,
                byteLength: 4,
                checksum: "deadbeef",
                defaultVolume: 1,
                soloMuteCapable: true,
                requiredForPlayback: false,
                dataOffset: 0,
                dataLength: 4,
              },
            ],
          }),
        ),
      ),
    );
    const stda = new Uint8Array([1, 1, 4, 0, 0, 0, 1, 2, 3, 4]);
    const check = validateStemChunks(manifest, stda);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes("checksum"))).toBe(true);
  });

  it("validateStemOptionalMap handles missing STEM", () => {
    const result = validateStemOptionalMap(new Map());
    expect(result.valid).toBe(false);
    expect(result.manifest).toBeNull();
  });
});
