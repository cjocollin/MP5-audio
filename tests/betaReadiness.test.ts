import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HONESTY_NO_BEAT_CLAIM, LANDING_SUBHEADLINE } from "../apps/web/src/lib/publicLandingCopy";
import { USER_ERRORS } from "../apps/web/src/lib/userFacingErrors";

const root = join(process.cwd());
const docs = join(root, "docs");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const FORBIDDEN_PUBLIC_CLAIMS: { pattern: RegExp; allowNegated?: boolean }[] = [
  { pattern: /\bMP5 beats\b/i },
  { pattern: /\bbeats MP3\b/i },
  { pattern: /\bbeats FLAC\b/i },
  { pattern: /\bproduction[- ]ready\b/i, allowNegated: true },
  { pattern: /\blegally verified\b/i },
  { pattern: /\benforces rights\b/i },
  { pattern: /\brecovery[- ]only\b/i, allowNegated: true },
  { pattern: /\bAI stem separation\b/i },
];

function assertNoOverclaim(text: string, rel: string) {
  for (const { pattern, allowNegated } of FORBIDDEN_PUBLIC_CLAIMS) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (allowNegated) {
        const before = text.slice(Math.max(0, match.index - 12), match.index);
        if (/\bnot\s+$/i.test(before)) continue;
      }
      throw new Error(`forbidden in ${rel}: ${pattern}`);
    }
  }
}

const REQUIRED_PUBLIC_PHRASES = [
  /experimental/i,
  /does not claim to beat/i,
  /MP5-L v3/i,
  /lab/i,
];

function scanFile(relPath: string) {
  const full = join(root, relPath);
  expect(existsSync(full), relPath).toBe(true);
  return readFileSync(full, "utf8");
}

describe("beta readiness docs", () => {
  it("MP5_BETA_READINESS.md exists with version and blockers", () => {
    const text = readFileSync(join(docs, "MP5_BETA_READINESS.md"), "utf8");
    expect(text).toContain("0.10.0-alpha");
    expect(text).toMatch(/beta:check/i);
    expect(text).toMatch(/must NOT be claimed/i);
    expect(text).toMatch(/MP5-C/);
  });

  it("MP5_KNOWN_ISSUES.md exists with Alpha caveats", () => {
    const text = readFileSync(join(docs, "MP5_KNOWN_ISSUES.md"), "utf8");
    expect(text).toMatch(/MP5-C hiss/i);
    expect(text).toMatch(/FFmpeg/i);
    expect(text).toMatch(/\.mp5p/i);
    expect(text).toMatch(/stem mix/i);
    expect(text).not.toMatch(/beats MP3/i);
  });

  it("beta-check script exists in package.json", () => {
    expect(packageJson.scripts["beta:check"]).toContain("beta-check.mjs");
    expect(packageJson.scripts["fixtures:validate"]).toBeTruthy();
  });
});

describe("public claims audit", () => {
  const targets = [
    "README.md",
    "docs/MP5_DEMO_GUIDE.md",
    "docs/MP5_PUBLIC_DEMO_COPY.md",
    "apps/web/src/lib/publicLandingCopy.ts",
    "apps/web/src/lib/codecModesCopy.ts",
  ];

  for (const rel of targets) {
    it(`${rel} avoids overclaims`, () => {
      const text = scanFile(rel);
      assertNoOverclaim(text, rel);
    });
  }

  it("README and landing include honesty framing", () => {
    const readme = scanFile("README.md");
    for (const req of REQUIRED_PUBLIC_PHRASES) {
      expect(readme).toMatch(req);
    }
    expect(LANDING_SUBHEADLINE).toMatch(/experimental/i);
    expect(HONESTY_NO_BEAT_CLAIM).toMatch(/does not claim to beat/i);
  });

  it("PublicLanding renders honesty claim test id", () => {
    const src = scanFile("apps/web/src/components/PublicLanding.tsx");
    expect(src).toContain("landing-honesty-claim");
    expect(src).toContain("HONESTY_NO_BEAT_CLAIM");
  });
});

describe("user-facing error messages", () => {
  it("exports calm actionable errors", () => {
    expect(USER_ERRORS.ffmpegLoadFailed).toMatch(/Refresh|WAV/i);
    expect(USER_ERRORS.invalidMp5).toMatch(/corrupt|MP5/i);
    expect(USER_ERRORS.libraryQuota).toMatch(/storage/i);
    expect(USER_ERRORS.fingerprintMismatch).toMatch(/fingerprint|hash/i);
    expect(USER_ERRORS.stemAlignBlocked).toMatch(/Normalize|full mix/i);
  });

  it("error module is used in converter and playlist paths", () => {
    const converter = scanFile("apps/web/src/player/ConverterPanel.tsx");
    expect(converter).toContain("userFacingErrors");
    const playlist = scanFile("apps/web/src/player/playlistUtils.ts");
    expect(playlist).toContain("userFacingErrors");
  });
});

describe("version alignment", () => {
  it("package.json is 0.10.0-alpha", () => {
    expect(packageJson.version).toBe("0.10.0-alpha");
  });

  it("CURRENT_MP5_STATUS references beta readiness", () => {
    const status = readFileSync(join(docs, "CURRENT_MP5_STATUS.md"), "utf8");
    expect(status).toContain("0.10.0-alpha");
    expect(status).toMatch(/MP5_BETA_READINESS|beta:check/i);
  });
});
