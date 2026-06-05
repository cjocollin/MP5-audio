import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  HONESTY_NO_BEAT_CLAIM,
  LANDING_HEADLINE,
  LANDING_SUBHEADLINE,
} from "../apps/web/src/lib/publicLandingCopy";
import {
  loadLandingAboutExpanded,
  saveLandingAboutExpanded,
} from "../apps/web/src/lib/landingAboutPrefs";
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
    expect(LANDING_SUBHEADLINE).toMatch(/album package/i);
    expect(HONESTY_NO_BEAT_CLAIM).toMatch(/does not claim to beat/i);
    expect(HONESTY_NO_BEAT_CLAIM).not.toMatch(/MP5 beats/i);
  });

  it("App mounts WelcomeOnboarding after landing", () => {
    const src = readFileSync(join(root, "apps/web/src/App.tsx"), "utf8");
    const landingIdx = src.indexOf("<PublicLanding />");
    const welcomeIdx = src.indexOf("<WelcomeOnboarding />");
    expect(welcomeIdx).toBeGreaterThan(landingIdx);
  });

  it("PublicLanding uses compact hero and collapsible About", () => {
    const src = readFileSync(
      join(root, "apps/web/src/components/PublicLanding.tsx"),
      "utf8",
    );
    expect(src).toContain('data-testid="landing-hero-compact"');
    expect(src).toContain('data-testid="landing-about-toggle"');
    expect(src).toContain('data-testid="landing-about-details"');
    expect(src).toContain("landing-codec-mp5l");
    expect(src).toContain('data-testid="landing-github-link"');
    expect(src).toContain('data-testid="landing-honesty-claim"');
    expect(src).toContain('data-testid="landing-screenshot-scroll"');
    expect(src).toContain("LANDING_SCREENSHOTS");
    expect(src).toContain("loadLandingAboutExpanded");
  });

  it("App places main nav after compact landing", () => {
    const src = readFileSync(join(root, "apps/web/src/App.tsx"), "utf8");
    const landingIdx = src.indexOf("<PublicLanding />");
    const navIdx = src.indexOf('data-testid="app-main-nav"');
    expect(landingIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(landingIdx);
  });

  it("landing About prefs roundtrip via localStorage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    expect(loadLandingAboutExpanded()).toBe(false);
    saveLandingAboutExpanded(true);
    expect(loadLandingAboutExpanded()).toBe(true);
    saveLandingAboutExpanded(false);
    expect(loadLandingAboutExpanded()).toBe(false);
    vi.unstubAllGlobals();
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
