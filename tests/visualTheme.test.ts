import { describe, it, expect } from "vitest";
import { parseHexColor, contrastRatio, ensureReadableText } from "../apps/web/src/lib/visualTheme/colorUtils";
import {
  resolvePlayerTheme,
  themeRootStyle,
  themeAccentDiffersFromDefault,
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
});
