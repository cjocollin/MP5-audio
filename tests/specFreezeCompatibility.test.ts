import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseMp5,
  assessMp5Compatibility,
  assessMp5pCompatibility,
  REQUIRED_CHUNKS,
  AI_FOURCC_SET,
  OPTIONAL_FOURCC_SET,
  MOONSHOT_FOURCC_SET,
  STEM_DATA_FOURCC,
} from "@mp5/container";

const root = join(process.cwd());
const docs = join(root, "docs");
const fixtures = join(root, "test-fixtures");

const REGISTRY_DOC = join(docs, "MP5_CHUNK_REGISTRY.md");
const POLICY_DOC = join(docs, "MP5_COMPATIBILITY_POLICY.md");
const MATRIX_DOC = join(docs, "MP5_FEATURE_MATRIX.md");

/** Chunks with parser/writer or decode in Alpha — must appear in registry doc. */
const IMPLEMENTED_CHUNKS = [
  "HEAD",
  "META",
  "AUDI",
  "COVR",
  "SEEK",
  "WAVE",
  "INFO",
  "CORR",
  "EXPL",
  "SAFE",
  "RECV",
  "SENS",
  "MOOD",
  "VIBE",
  "LYRC",
  "STEM",
  STEM_DATA_FOURCC,
  "SECT",
  "HOOK",
  "HILT",
  "VISU",
  "CRDT",
  "LICN",
  "IDEN",
  "FING",
  "HASH",
  "ALBM",
];

const GOLDEN_MP5: { file: string; profile: "basic" | "playable" | "rich" }[] = [
  { file: "demo_mp5l_v3_tone.mp5", profile: "rich" },
  { file: "demo_pcm_reference_tone.mp5", profile: "playable" },
  { file: "demo_mp5c_lab_tone.mp5", profile: "playable" },
  { file: "demo_mp5l_v3_stems.mp5", profile: "rich" },
  { file: "validation_mp5l_v3.mp5", profile: "rich" },
];

describe("spec freeze docs", () => {
  it("chunk registry document exists and lists core chunks", () => {
    expect(existsSync(REGISTRY_DOC)).toBe(true);
    const text = readFileSync(REGISTRY_DOC, "utf8");
    for (const fourcc of ["HEAD", "AUDI", "STEM", "STDA", "FING", "VISU"]) {
      expect(text).toContain(fourcc);
    }
  });

  it("compatibility policy document exists", () => {
    expect(existsSync(POLICY_DOC)).toBe(true);
    const text = readFileSync(POLICY_DOC, "utf8");
    expect(text).toMatch(/Alpha/i);
    expect(text).toMatch(/unknown optional/i);
  });

  it("feature matrix document exists", () => {
    expect(existsSync(MATRIX_DOC)).toBe(true);
    const text = readFileSync(MATRIX_DOC, "utf8");
    expect(text).toContain("MP5-L v3");
    expect(text).toContain("Batch stem import");
  });

  it("registry covers implemented Alpha chunks", () => {
    const text = readFileSync(REGISTRY_DOC, "utf8");
    for (const fourcc of IMPLEMENTED_CHUNKS) {
      expect(text, `registry missing ${fourcc}`).toContain(fourcc);
    }
  });
});

describe("golden fixtures validation profiles", () => {
  for (const spec of GOLDEN_MP5) {
    it(`${spec.file} passes ${spec.profile} profile`, () => {
      const path = join(fixtures, spec.file);
      expect(existsSync(path), `run pnpm fixtures:generate`).toBe(true);
      const buf = readFileSync(path);
      const parsed = parseMp5(buf);
      const report = assessMp5Compatibility(parsed, { fileSize: buf.length, path: spec.file });
      expect(report.profiles.basic).toBe(true);
      expect(report.profiles.playable).toBe(true);
      if (spec.profile === "rich") {
        expect(report.profiles.rich).toBe(true);
      }
    });
  }

  it("demo_album_package.mp5p passes package profile", () => {
    const path = join(fixtures, "demo_album_package.mp5p");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    const report = assessMp5pCompatibility(text, { path: "demo_album_package.mp5p" });
    expect(report.profiles.package).toBe(true);
    expect(report.trackCount).toBeGreaterThanOrEqual(2);
  });
});

describe("compatibility assessment behavior", () => {
  it("unknown optional chunk is reported but keeps playable", () => {
    const futrPath = join(fixtures, "compatibility", "mp5l_unknown_futr.mp5");
    if (!existsSync(futrPath)) return;
    const parsed = parseMp5(readFileSync(futrPath));
    const report = assessMp5Compatibility(parsed);
    expect(report.optionalUnknown).toContain("FUTR");
    expect(report.profiles.playable).toBe(true);
  });

  it("MP5-L v3 demo recommends v3 codec version label", () => {
    const path = join(fixtures, "demo_mp5l_v3_tone.mp5");
    const parsed = parseMp5(readFileSync(path));
    const report = assessMp5Compatibility(parsed);
    expect(report.codecVersion).toMatch(/v3/);
    expect(report.profiles.playable).toBe(true);
  });

  it("required chunks set matches HEAD and AUDI", () => {
    expect(REQUIRED_CHUNKS.has("HEAD")).toBe(true);
    expect(REQUIRED_CHUNKS.has("AUDI")).toBe(true);
    expect(REQUIRED_CHUNKS.size).toBe(2);
  });

  it("registry sets are disjoint from required", () => {
    for (const r of REQUIRED_CHUNKS) {
      expect(AI_FOURCC_SET.has(r)).toBe(false);
      expect(OPTIONAL_FOURCC_SET.has(r)).toBe(false);
      expect(MOONSHOT_FOURCC_SET.has(r)).toBe(false);
    }
  });
});

describe("status doc version", () => {
  it("CURRENT_MP5_STATUS mentions v0.13.x-alpha beta readiness", () => {
    const text = readFileSync(join(docs, "CURRENT_MP5_STATUS.md"), "utf8");
    expect(text).toMatch(/0\.13\.\d+-alpha/);
    expect(text).toMatch(/MP5_BETA_READINESS|beta:check|inspect:mp5|chunk registry/i);
  });
});
