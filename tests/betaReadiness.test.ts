import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HONESTY_NO_BEAT_CLAIM, LANDING_SUBHEADLINE } from "../apps/web/src/lib/publicLandingCopy";
import { USER_ERRORS } from "../apps/web/src/lib/userFacingErrors";
import {
  FEEDBACK_PRIVACY_NOTE,
  FIRST_USER_TIPS,
  MP5_BUG_REPORT_URL,
} from "../apps/web/src/lib/betaFeedback";
import { buildBetaDiagnosticsReport } from "../apps/web/src/lib/sessionDiagnostics";

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
  const buf = readFileSync(full);
  expect(buf[1] === 0, `${relPath} must be UTF-8 (not UTF-16)`).toBe(false);
  return buf.toString("utf8");
}

describe("Public Beta hardening", () => {
  it("issue templates exist", () => {
    for (const file of [
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/beta_feedback.yml",
      ".github/ISSUE_TEMPLATE/mp5_compatibility.yml",
      ".github/ISSUE_TEMPLATE/feature_request.yml",
    ]) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });

  it("public beta release notes exist", () => {
    const text = readFileSync(join(docs, "MP5_PUBLIC_BETA_RELEASE_NOTES.md"), "utf8");
    expect(text).toMatch(/Public Beta/i);
    expect(text).toMatch(/MP5-L/i);
    expect(text).toMatch(/\.mp5p/i);
    expect(text).toMatch(/does not claim to beat/i);
    expect(text).toMatch(/Report.*bug|feedback/i);
  });

  it("manual QA has physical phone checklist", () => {
    const text = readFileSync(join(docs, "MP5_MANUAL_QA_CHECKLIST.md"), "utf8");
    expect(text).toMatch(/Physical phone/i);
    expect(text).toMatch(/VISU stays contained/i);
  });

  it("feedback constants and diagnostics report", () => {
    expect(MP5_BUG_REPORT_URL).toContain("bug_report");
    expect(FEEDBACK_PRIVACY_NOTE).toMatch(/copyrighted|private audio/i);
    expect(FIRST_USER_TIPS.length).toBeGreaterThanOrEqual(4);
    const report = buildBetaDiagnosticsReport({
      conversion: {
        singlePhase: "idle",
        singleFileName: null,
        batchRunning: false,
        batchCurrentName: null,
        batchPendingCount: 0,
        cancelGeneration: 0,
        setSinglePhase: () => {},
        setBatchActivity: () => {},
        bumpCancelGeneration: () => 0,
        resetSingle: () => {},
      },
      queueLength: 0,
      currentFileLabel: "none",
      decodeCacheSummary: "0/3",
      librarySummary: "0 entries",
    });
    expect(report).toMatch(/0\.16\.2-beta/);
    expect(report).toMatch(/No telemetry/i);
  });
});

describe("beta readiness docs", () => {
  it("MP5_BETA_READINESS.md exists with version and blockers", () => {
    const text = readFileSync(join(docs, "MP5_BETA_READINESS.md"), "utf8");
    expect(text).toMatch(/0\.16\.[12]-beta|Public Beta/i);
    expect(text).toMatch(/beta:check/i);
    expect(text).toMatch(/must NOT be claimed/i);
    expect(text).toMatch(/MP5-C/);
  });

  it("MP5_MANUAL_QA_CHECKLIST.md exists", () => {
    const text = readFileSync(join(docs, "MP5_MANUAL_QA_CHECKLIST.md"), "utf8");
    expect(text).toMatch(/Embedded.*mp5p/i);
    expect(text).toMatch(/Hosted deployment/i);
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
    expect(packageJson.scripts["playback:check"]).toContain("playback-check.mjs");
  });
});

describe("public claims audit", () => {
  const targets = [
    "README.md",
    "docs/MP5_DEMO_GUIDE.md",
    "docs/MP5_PUBLIC_DEMO_COPY.md",
    "docs/MP5_MANUAL_QA_CHECKLIST.md",
    "docs/MP5_PUBLIC_BETA_RELEASE_NOTES.md",
    "apps/web/src/lib/publicLandingCopy.ts",
    "apps/web/src/lib/codecModesCopy.ts",
    "apps/web/src/lib/betaFeedback.ts",
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
    expect(USER_ERRORS.embeddedTrackLoadFailed).toMatch(/embedded track/i);
    expect(USER_ERRORS.stemWorkerUnavailable).toMatch(/Background stem/i);
  });

  it("WelcomeOnboarding is mounted in App", () => {
    const app = scanFile("apps/web/src/App.tsx");
    expect(app).toContain("WelcomeOnboarding");
  });

  it("App mounts BetaFeedbackPanel", () => {
    const app = scanFile("apps/web/src/App.tsx");
    expect(app).toContain("BetaFeedbackPanel");
  });

  it("DemoModePanel has first-user tips", () => {
    const demo = scanFile("apps/web/src/components/DemoModePanel.tsx");
    expect(demo).toContain("demo-first-user-tips");
    expect(demo).toContain("FIRST_USER_TIPS");
  });

  it("DemoModePanel has guided paths A-E", () => {
    const demo = scanFile("apps/web/src/components/DemoModePanel.tsx");
    expect(demo).toMatch(/demo-path-\$\{path\.id\}/);
    expect(demo).toContain('id: "e"');
    expect(demo).toContain("demo-load-embedded-album");
  });

  it("error module is used in converter and playlist paths", () => {
    const converter = scanFile("apps/web/src/player/ConverterPanel.tsx");
    expect(converter).toContain("userFacingErrors");
    const playlist = scanFile("apps/web/src/player/playlistUtils.ts");
    expect(playlist).toContain("userFacingErrors");
  });
});

describe("version alignment", () => {
  it("package.json is 0.16.2-beta", () => {
    expect(packageJson.version).toBe("0.16.2-beta");
  });

  it("CURRENT_MP5_STATUS references beta readiness", () => {
    const status = readFileSync(join(docs, "CURRENT_MP5_STATUS.md"), "utf8");
    expect(status).toMatch(/0\.16\.[12]-beta|Public Beta/i);
    expect(status).toMatch(/MP5_PUBLIC_BETA|MP5_BETA_READINESS|beta:check/i);
  });
});
