import { describe, it, expect } from "vitest";
import {
  parseHexColor,
  contrastRatio,
  ensureReadableAccent,
  ensureReadableText,
} from "../apps/web/src/lib/visualTheme/colorUtils";
import {
  resolvePlayerTheme,
  appChromeThemeStyle,
  themeRootStyle,
  themeAccentDiffersFromDefault,
  resolveCoverCardStyle,
  themeUsesGlobalBackgroundImage,
} from "../apps/web/src/lib/visualTheme/applyVisualTheme";
import {
  DEFAULT_APP_ACCENT,
  describeThemeApplication,
} from "../apps/web/src/lib/visualTheme/themeApplication";
import type { VisuPayload } from "@mp5/container";

const PITY_PARTY_VISU: VisuPayload = {
  themeName: "It's My Party",
  moodLabel: "pastel-carnival-dark-pop",
  visualIntensity: "high",
  playerStyle: "cinematic",
  source: "user",
};

describe("visual theme player helpers", () => {
  it("resolvePlayerTheme returns null without visu", () => {
    expect(resolvePlayerTheme(null)).toBeNull();
  });

  it("uses accent for badges and readable text on dark bg", () => {
    const visu: VisuPayload = {
      themeName: "Calm",
      accentColor: "#8b5cf6",
      backgroundColor: "#1e1b4b",
      moodLabel: "calm",
      playerStyle: "calm",
      source: "app",
    };
    const theme = resolvePlayerTheme(visu);
    expect(theme?.accent).toBe("#8b5cf6");
    expect(theme?.cardStyle.background).toBeTruthy();
    expect(contrastRatio(theme!.text, "#1e1b4b")).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back on invalid hex in resolve", () => {
    const theme = resolvePlayerTheme({
      accentColor: "not-a-color",
      primaryColor: "#6366f1",
    });
    expect(theme?.accent).toBe("#6366f1");
  });

  it("ensureReadableText prefers high-contrast fallback", () => {
    const text = ensureReadableText("#1e1b4b", "#111111");
    expect(contrastRatio(text, "#1e1b4b")).toBeGreaterThanOrEqual(4.5);
  });

  it("parseHexColor rejects injection", () => {
    expect(parseHexColor("expression(alert(1))")).toBeUndefined();
    expect(parseHexColor("#12")).toBeUndefined();
  });

  it("Pity Party style VISU without hex uses cinematic preset visibly distinct from app purple", () => {
    const theme = resolvePlayerTheme(PITY_PARTY_VISU);
    expect(theme).not.toBeNull();
    expect(theme?.colorsDerived).toBe(true);
    expect(theme?.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(themeAccentDiffersFromDefault(theme)).toBe(true);
    expect(theme?.accent.toLowerCase()).not.toBe(DEFAULT_APP_ACCENT.toLowerCase());
    expect(theme?.coverOverlayStyle.background).toBeTruthy();
    expect(theme?.shellStyle.borderColor).toBeTruthy();
    expect(theme?.vars["--mp5-visu-accent"]).toBe(theme?.accent);
  });

  it("themeRootStyle merges CSS variables and shell wash", () => {
    const theme = resolvePlayerTheme(PITY_PARTY_VISU);
    const root = themeRootStyle(theme);
    expect(root?.["--mp5-visu-accent" as keyof typeof root]).toBe(theme?.accent);
    expect(root?.background).toBeTruthy();
    expect(root?.borderColor).toBeTruthy();
  });

  it("maps all active file color roles into app-wide chrome tokens", () => {
    const theme = resolvePlayerTheme({
      accentColor: "#1260a8",
      primaryColor: "#d7edf8",
      secondaryColor: "#5a8f72",
    });
    const style = appChromeThemeStyle(theme);
    expect(style?.["--mp5-accent" as keyof typeof style]).toBe("#1260a8");
    expect(style?.["--mp5-accent-rgb" as keyof typeof style]).toBe("18 96 168");
    expect(style?.["--mp5-accent-bright" as keyof typeof style]).toBe(ensureReadableAccent("#1260a8"));
    expect(style?.["--mp5-primary" as keyof typeof style]).toBe("#d7edf8");
    expect(style?.["--mp5-primary-rgb" as keyof typeof style]).toBe("215 237 248");
    expect(style?.["--mp5-secondary" as keyof typeof style]).toBe("#5a8f72");
    expect(style?.["--mp5-secondary-rgb" as keyof typeof style]).toBe("90 143 114");
    expect(style?.["--mp5-secondary-bright" as keyof typeof style]).toBe(
      ensureReadableAccent("#5a8f72"),
    );
    expect(style?.["--mp5-logo-primary" as keyof typeof style]).toBe(ensureReadableAccent("#d7edf8"));
    expect(style?.["--mp5-theme-wash" as keyof typeof style]).toMatch(/^#[0-9a-f]{8}$/);
    expect(appChromeThemeStyle(null)).toBeUndefined();
  });

  it("falls back to accent when a VISU theme has no separate primary", () => {
    const theme = resolvePlayerTheme({ accentColor: "#3286c8" });
    const style = appChromeThemeStyle(theme);
    expect(style?.["--mp5-primary" as keyof typeof style]).toBe("#3286c8");
    expect(style?.["--mp5-secondary" as keyof typeof style]).toBe("#3286c8");
    expect(style?.["--mp5-logo-primary" as keyof typeof style]).toBe(ensureReadableAccent("#3286c8"));
  });

  it("falls secondary back to primary before accent", () => {
    const theme = resolvePlayerTheme({ primaryColor: "#d97706", accentColor: "#2563eb" });
    const style = appChromeThemeStyle(theme);
    expect(theme?.secondary).toBe("#d97706");
    expect(theme?.waveformUnplayedFill).toMatch(/^#d97706[0-9a-f]{2}$/);
    expect(style?.["--mp5-secondary" as keyof typeof style]).toBe("#d97706");
  });

  it("honors an explicit secondary-only VISU color without applying a preset", () => {
    const theme = resolvePlayerTheme({ secondaryColor: "#22c55e" });
    const style = appChromeThemeStyle(theme);
    expect(theme?.secondary).toBe("#22c55e");
    expect(theme?.colorsDerived).toBe(false);
    expect(style?.["--mp5-secondary" as keyof typeof style]).toBe("#22c55e");
  });

  it("describeThemeApplication reports preset fallback for metadata-only VISU", () => {
    const on = describeThemeApplication(PITY_PARTY_VISU, true);
    expect(on.applied).toBe(true);
    expect(on.source).toBe("preset_fallback");
    expect(on.label).toContain("File theme applied: yes");
    expect(on.label).toContain("preset fallback");

    const off = describeThemeApplication(PITY_PARTY_VISU, false);
    expect(off.applied).toBe(false);
    expect(off.source).toBe("disabled");
    expect(off.label).toContain("disabled");

    const missing = describeThemeApplication(null, true);
    expect(missing.source).toBe("missing");
  });

  it("theme disabled means no vars from null visu", () => {
    expect(resolvePlayerTheme(null)).toBeNull();
    expect(themeRootStyle(null)).toBeUndefined();
  });

  it("resolveCoverCardStyle omits gradient fill when cover art is present", () => {
    const theme = resolvePlayerTheme(PITY_PARTY_VISU);
    const withCover = resolveCoverCardStyle(theme, true);
    const withoutCover = resolveCoverCardStyle(theme, false);
    expect(withCover.background).toBeUndefined();
    expect(withoutCover.background).toBeTruthy();
    expect(withCover.borderColor).toBeTruthy();
  });

  it("VISU theme styles never use url() background images", () => {
    const theme = resolvePlayerTheme(PITY_PARTY_VISU);
    expect(themeUsesGlobalBackgroundImage(theme)).toBe(false);
    expect(themeUsesGlobalBackgroundImage(null)).toBe(false);
  });
});
