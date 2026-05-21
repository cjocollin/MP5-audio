import { describe, it, expect } from "vitest";
import { parseHexColor, contrastRatio, ensureReadableText } from "../apps/web/src/lib/visualTheme/colorUtils";
import { resolvePlayerTheme } from "../apps/web/src/lib/visualTheme/applyVisualTheme";
import type { VisuPayload } from "@mp5/container";

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

  it("derives visible colors from cinematic VISU without hex fields (Pity Party style)", () => {
    const theme = resolvePlayerTheme({
      themeName: "It's My Party",
      moodLabel: "pastel-carnival-dark-pop",
      visualIntensity: "high",
      playerStyle: "cinematic",
      source: "user",
    });
    expect(theme).not.toBeNull();
    expect(theme?.colorsDerived).toBe(true);
    expect(theme?.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(theme?.cardStyle.background ?? theme?.cardStyle.borderColor).toBeTruthy();
    expect(theme?.vars["--mp5-visu-accent"]).toBeTruthy();
  });

  it("theme disabled means no vars from null visu", () => {
    expect(resolvePlayerTheme(null)).toBeNull();
  });
});
