import { describe, expect, it } from "vitest";
import {
  extractCoverPaletteFromPixels,
  suggestCoverThemeName,
} from "../apps/web/src/lib/visualTheme/coverPalette";

function pixels(colors: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flat());
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

describe("cover-art palette extraction", () => {
  it("derives deterministic, export-safe theme colors", () => {
    const data = pixels([
      [220, 32, 32, 255],
      [220, 32, 32, 255],
      [220, 32, 32, 255],
      [220, 32, 32, 255],
      [220, 32, 32, 255],
      [220, 32, 32, 255],
      [30, 80, 220, 255],
      [30, 80, 220, 255],
    ]);

    const first = extractCoverPaletteFromPixels(data, 4, 2);
    const second = extractCoverPaletteFromPixels(data, 4, 2);

    expect(first).toEqual(second);
    expect(first.primaryColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(first.secondaryColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(first.accentColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(first.backgroundColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(first.accentColor).not.toBe(first.primaryColor);
    expect(first.secondaryColor).not.toBe(first.primaryColor);
    expect(first.secondaryColor).not.toBe(first.accentColor);
    expect(luminance(first.backgroundColor)).toBeLessThan(luminance(first.primaryColor));
  });

  it("ignores transparent pixels", () => {
    const palette = extractCoverPaletteFromPixels(
      pixels([
        [0, 255, 0, 0],
        [240, 80, 40, 255],
      ]),
      2,
      1,
    );

    expect(palette.primaryColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.primaryColor).not.toMatch(/^#00[ef][ef]00$/);
  });

  it("rejects covers without visible pixels", () => {
    expect(() =>
      extractCoverPaletteFromPixels(pixels([[0, 0, 0, 0]]), 1, 1),
    ).toThrow("no visible colors");
  });
});

describe("cover-art theme names", () => {
  const goldenPalette = {
    primaryColor: "#ebba51",
    secondaryColor: "#b89058",
    accentColor: "#edb83c",
    backgroundColor: "#090908",
  };

  it("prefers album metadata and adds a palette-derived phrase", () => {
    const name = suggestCoverThemeName(goldenPalette, {
      album: "Midnight Drive",
      title: "Side Streets",
      artist: "Example Artist",
    });

    expect(name).toMatch(/^Midnight Drive — (?:Amber|Golden) /);
    expect(name).not.toBe("Cover art palette");
    expect(suggestCoverThemeName(goldenPalette, { album: "Midnight Drive" })).toBe(name);
  });

  it("falls back to the song title and removes source extensions", () => {
    const name = suggestCoverThemeName(goldenPalette, {
      title: "Last Light.wav",
    });

    expect(name).toMatch(/^Last Light — (?:Amber|Golden) /);
    expect(name).not.toContain(".wav");
  });

  it("still creates an original palette name without metadata", () => {
    const name = suggestCoverThemeName(goldenPalette, {});

    expect(name).toMatch(/^(?:Amber|Golden) [A-Z]/);
    expect(name.length).toBeLessThanOrEqual(128);
  });
});
