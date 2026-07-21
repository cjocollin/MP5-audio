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

describe("public experience", () => {
  it("exports canonical public URLs", () => {
    expect(MP5_DEMO_URL).toBe("https://mp5-audio.vercel.app");
    expect(MP5_GITHUB_URL).toBe("https://github.com/cjocollin/MP5-audio");
  });

  it("has hero copy constants", () => {
    expect(LANDING_HEADLINE).toBe("MP5 Audio");
    expect(LANDING_SUBHEADLINE).toContain("experimental smart audio");
    expect(LANDING_SUBHEADLINE).toMatch(/album package/i);
    expect(HONESTY_NO_BEAT_CLAIM).toMatch(/does not claim to beat/i);
    expect(HONESTY_NO_BEAT_CLAIM).not.toMatch(/MP5 beats/i);
  });

  it("App opens directly into the player workspace without auto-seeding demo audio", () => {
    const src = readFileSync(join(root, "apps/web/src/App.tsx"), "utf8");
    expect(src).toContain("DemoFixtureActions");
    expect(src).toContain('testIdPrefix="settings"');
    expect(src).not.toContain("fetchDemoMp5lFixture");
    expect(src).not.toContain("defaultDemoLoading");
    expect(src).not.toContain("<PublicLanding />");
    expect(src).not.toContain("<WelcomeOnboarding />");
  });

  it("About preserves the current Public Beta feature and codec guidance", () => {
    const src = readFileSync(
      join(root, "apps/web/src/components/AboutMp5Panel.tsx"),
      "utf8",
    );
    expect(src).toContain('data-testid="about-mp5-panel"');
    expect(src).toContain("MP5-L v4");
    expect(src).toContain("MP5-C2");
    expect(src).toContain("Packed Rice");
    expect(src).toContain("local library");
    expect(src).toContain("user/artist-provided stems");
    expect(src).toMatch(/batch\s+stem import/);
    expect(src).toMatch(/no AI stem separation/i);
    expect(src).toMatch(/does[\s\S]*not[\s\S]*claim to beat/i);
  });

  it("App mounts the responsive shell and its main nav", () => {
    const appSrc = readFileSync(join(root, "apps/web/src/App.tsx"), "utf8");
    const shellSrc = readFileSync(
      join(root, "apps/web/src/components/AppShell.tsx"),
      "utf8",
    );
    expect(appSrc).toContain("<AppShell");
    expect(appSrc).toContain("<Mp5Player");
    expect(shellSrc).toContain('data-testid="app-main-nav"');
    expect(shellSrc).toContain('data-testid={`app-tab-${id}`}');
    expect(shellSrc).toContain('data-testid="public-beta-notice"');
  });

  it("Demo preserves first-user guidance and paths A through E", () => {
    const src = readFileSync(
      join(root, "apps/web/src/components/DemoModePanel.tsx"),
      "utf8",
    );
    expect(src).toContain("FIRST_USER_TIPS");
    expect(src).not.toContain("DemoFixtureActions");
    expect(src).toContain("demo-open-settings-fixtures");
    expect(src).toContain('id: "a"');
    expect(src).toContain('id: "e"');
    expect(src).toContain('data-testid="demo-load-embedded-album"');
    expect(src).toContain('data-testid={`demo-path-${path.id}`}');
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

  it("About panel and demo copy mention stems without AI separation", () => {
    const about = readFileSync(
      join(root, "apps/web/src/components/AboutMp5Panel.tsx"),
      "utf8",
    );
    const demo = readFileSync(join(root, "docs/MP5_PUBLIC_DEMO_COPY.md"), "utf8");
    expect(about).toContain("user/artist-provided stems");
    expect(about).toMatch(/no AI stem separation/i);
    expect(about).toContain("local library");
    expect(demo).toContain("user-provided stems");
    expect(demo).toMatch(/no AI stem separation/i);
  });
});
