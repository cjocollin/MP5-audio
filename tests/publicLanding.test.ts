import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HONESTY_NO_BEAT_CLAIM,
  LANDING_HEADLINE,
  LANDING_SUBHEADLINE,
} from "../apps/web/src/lib/publicLandingCopy";
import { MP5_DEMO_URL, MP5_GITHUB_URL } from "../apps/web/src/lib/publicLinks";

const root = join(import.meta.dirname, "..");

describe("public landing", () => {
  it("exports canonical public URLs", () => {
    expect(MP5_DEMO_URL).toBe("https://mp5-audio.vercel.app");
    expect(MP5_GITHUB_URL).toBe("https://github.com/cjocollin/MP5-audio");
  });

  it("has hero copy constants", () => {
    expect(LANDING_HEADLINE).toBe("MP5 Audio");
    expect(LANDING_SUBHEADLINE).toContain("experimental smart audio");
    expect(HONESTY_NO_BEAT_CLAIM).toMatch(/does not claim to beat/i);
    expect(HONESTY_NO_BEAT_CLAIM).not.toMatch(/MP5 beats/i);
  });

  it("PublicLanding component includes required test ids", () => {
    const src = readFileSync(
      join(root, "apps/web/src/components/PublicLanding.tsx"),
      "utf8",
    );
    expect(src).toContain('data-testid="landing-hero"');
    expect(src).toContain("landing-codec-mp5l");
    expect(src).toContain('data-testid="landing-github-link"');
    expect(src).toContain('data-testid="landing-honesty-claim"');
    expect(src).toContain('data-testid="landing-screenshots"');
    expect(src).toContain("landing-screenshot-");
    expect(src).toContain("LANDING_SCREENSHOTS");
  });

  it("README references live demo, GitHub, and screenshots", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).toContain("https://mp5-audio.vercel.app");
    expect(readme).toContain("github.com/cjocollin/MP5-audio");
    expect(readme).toContain("docs/screenshots/Player.png");
    expect(readme).not.toContain("Screenshots coming soon");
  });

  it("screenshot assets exist in docs/screenshots", () => {
    for (const name of ["Player.png", "Converter.png", "Metadata.png"]) {
      expect(existsSync(join(root, "docs/screenshots", name))).toBe(true);
    }
  });

  it("public demo copy doc exists", () => {
    expect(existsSync(join(root, "docs/MP5_PUBLIC_DEMO_COPY.md"))).toBe(true);
  });
});
