import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMBEDDED_MAX_DIRECTORY_BYTES,
  EMBEDDED_MAX_FRAGMENT_PAYLOAD,
  EMBEDDED_MAX_LOGICAL_FILE_LEN,
  EMBEDDED_MAX_TRACK_ID_LEN,
  MAX_ALBUM_MANIFEST_JSON_BYTES,
  MAX_ALBUM_TRACKS,
  MAX_CHUNK_PAYLOAD,
  MAX_CHUNKS,
  MAX_FILE_SIZE,
  MAX_META_VALUE,
} from "@mp5/container";

const root = process.cwd();
const currentVersion = `v${JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version}`;

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function expectDoc(rel: string) {
  const full = join(root, rel);
  expect(existsSync(full), rel).toBe(true);
  return readFileSync(full, "utf8");
}

function mib(bytes: number) {
  return bytes / (1024 * 1024);
}

describe("developer toolkit docs", () => {
  it("ships the v0.20 toolkit docs", () => {
    for (const rel of [
      "docs/MP5_DEVELOPER_QUICKSTART.md",
      "docs/MP5_COMPATIBILITY_MATRIX.md",
      "docs/MP5_FIXTURE_CATALOG.md",
      "docs/MP5_CHUNK_REGISTRY.md",
    ]) {
      const text = expectDoc(rel);
      expect(text).toMatch(/v0\.20\.0-beta|Public Beta/i);
    }
  });

  it("compatibility matrix covers current formats and non-goals", () => {
    const text = read("docs/MP5_COMPATIBILITY_MATRIX.md");
    for (const phrase of [
      "MP5-L v3",
      "MP5-C",
      "MP5-H",
      "PCM",
      ".mp5",
      "manifest `.mp5p`",
      "embedded `.mp5p`",
      "STDF",
      "LYRC",
      "VISU",
      "COVR",
      "No AI generation",
      "No telemetry",
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it("fixture catalog references committed synthetic fixtures", () => {
    const text = read("docs/MP5_FIXTURE_CATALOG.md");
    for (const rel of [
      "test-fixtures/demo_pcm_reference_tone.mp5",
      "test-fixtures/demo_mp5l_v3_tone.mp5",
      "test-fixtures/demo_mp5c_lab_tone.mp5",
      "test-fixtures/demo_mp5l_v3_stems.mp5",
      "test-fixtures/demo_album_package.mp5p",
      "test-fixtures/demo_embedded_album_package.mp5p",
    ]) {
      expect(text).toContain(rel);
      expect(existsSync(join(root, rel)), rel).toBe(true);
    }
    expect(text).toMatch(/synthetic/i);
    expect(text).toMatch(/must not be committed/i);
  });

  it("chunk registry documents implementation limits", () => {
    const text = read("docs/MP5_CHUNK_REGISTRY.md");
    expect(text).toContain(`${mib(MAX_CHUNK_PAYLOAD)} MiB`);
    expect(text).toContain(`${MAX_CHUNKS}`);
    expect(text).toContain(`${mib(MAX_FILE_SIZE) / 1024} GiB`);
    expect(text).toContain(`${MAX_META_VALUE / 1024} KiB`);
    expect(text).toContain(`${MAX_ALBUM_TRACKS} tracks`);
    expect(text).toContain(`${mib(MAX_ALBUM_MANIFEST_JSON_BYTES)} MiB`);
    expect(text).toContain(`${mib(EMBEDDED_MAX_FRAGMENT_PAYLOAD)} MiB`);
    expect(text).toContain(`${mib(EMBEDDED_MAX_DIRECTORY_BYTES)} MiB`);
    expect(text).toContain(`${EMBEDDED_MAX_TRACK_ID_LEN}`);
    expect(text).toContain(`${EMBEDDED_MAX_LOGICAL_FILE_LEN}`);
  });

  it("chunk registry lists required and known optional chunks", () => {
    const text = read("docs/MP5_CHUNK_REGISTRY.md");
    for (const fourcc of [
      "HEAD",
      "AUDI",
      "META",
      "COVR",
      "LYRC",
      "STEM",
      "STDA",
      "STDF",
      "VISU",
      "CRDT",
      "LICN",
      "IDEN",
      "HASH",
      "ALBM",
      "ADPT",
      "AIRG",
    ]) {
      expect(text).toContain(fourcc);
    }
    expect(text).toMatch(/Required for playback.*`HEAD` and `AUDI`/s);
    expect(text).toMatch(/Unknown Chunks/i);
  });

  it("CLI scripts expose help, profiles, examples, and rights disclaimer", () => {
    for (const rel of ["scripts/inspect-mp5.mjs", "scripts/validate-mp5.mjs"]) {
      const text = read(rel);
      expect(text).toContain("--help");
      expect(text).toContain("Examples:");
      expect(text).toMatch(/legal rights/i);
      expect(text).toMatch(/compatibility/i);
    }
    const validate = read("scripts/validate-mp5.mjs");
    for (const profile of ["basic", "playable", "rich", "strict", "package"]) {
      expect(validate).toContain(profile);
    }
  });

  it("current public docs avoid stale version labels and overclaims", () => {
    const docs = [
      "README.md",
      "docs/CURRENT_MP5_STATUS.md",
      "docs/MP5_PUBLIC_BETA_RELEASE_NOTES.md",
      "docs/MP5_HOSTED_DEMO.md",
      "docs/MP5_KNOWN_ISSUES.md",
    ];
    for (const rel of docs) {
      const text = read(rel);
      expect(text, rel).toContain(currentVersion);
      expect(text, rel).not.toMatch(/\bv0\.19\.0-beta\b/);
      expect(text, rel).not.toMatch(/\bv0\.16\.1-beta\b/);
      expect(text, rel).not.toMatch(/production-ready(?! for archival|,)/i);
      expect(text, rel).toMatch(/does not claim to beat|No telemetry|Public Beta/i);
    }
  });
});
