import type { CoverArt } from "@mp5/container";

export interface CoverPalette {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
}

export interface CoverThemeContext {
  title?: string;
  album?: string;
  artist?: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

interface ColorBucket extends Rgb {
  count: number;
  hsl: Hsl;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  return { h: ((h * 60) + 360) % 360, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: Rgb;
  if (h < 60) rgb = { r: c, g: x, b: 0 };
  else if (h < 120) rgb = { r: x, g: c, b: 0 };
  else if (h < 180) rgb = { r: 0, g: c, b: x };
  else if (h < 240) rgb = { r: 0, g: x, b: c };
  else if (h < 300) rgb = { r: x, g: 0, b: c };
  else rgb = { r: c, g: 0, b: x };
  return {
    r: Math.round((rgb.r + m) * 255),
    g: Math.round((rgb.g + m) * 255),
    b: Math.round((rgb.b + m) * 255),
  };
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.67;
}

const COLOR_THEME_WORDS = [
  { maxHue: 15, adjective: "Crimson", nouns: ["Velvet", "Ember", "Pulse", "Bloom"] },
  { maxHue: 42, adjective: "Amber", nouns: ["Glow", "Dusk", "Lantern", "Ember"] },
  { maxHue: 68, adjective: "Golden", nouns: ["Hour", "Halo", "Horizon", "Glow"] },
  { maxHue: 100, adjective: "Citrine", nouns: ["Bloom", "Signal", "Meadow", "Spark"] },
  { maxHue: 155, adjective: "Emerald", nouns: ["Canopy", "Echo", "Bloom", "Pulse"] },
  { maxHue: 195, adjective: "Turquoise", nouns: ["Tide", "Mist", "Current", "Horizon"] },
  { maxHue: 235, adjective: "Azure", nouns: ["Tide", "Echo", "Horizon", "Nocturne"] },
  { maxHue: 265, adjective: "Indigo", nouns: ["Orbit", "Nocturne", "Static", "Veil"] },
  { maxHue: 300, adjective: "Violet", nouns: ["Dream", "Nocturne", "Veil", "Orbit"] },
  { maxHue: 330, adjective: "Magenta", nouns: ["Bloom", "Pulse", "Velvet", "Dream"] },
  { maxHue: 345, adjective: "Rose", nouns: ["Velvet", "Bloom", "Dusk", "Halo"] },
] as const;

function rgbFromHex(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1]!;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function stableWordIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  return (hash >>> 0) % length;
}

function usefulMetadataLabel(context: CoverThemeContext): string {
  for (const value of [context.album, context.title, context.artist]) {
    const cleaned = (value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\.(?:wav|flac|mp3|m4a|aac|ogg|opus)$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned && !/^(?:unknown|untitled|track)$/i.test(cleaned)) return cleaned;
  }
  return "";
}

/** Create a stable, metadata-aware display name for a locally derived palette. */
export function suggestCoverThemeName(palette: CoverPalette, context: CoverThemeContext): string {
  const accent = rgbFromHex(palette.accentColor) ?? rgbFromHex(palette.primaryColor);
  const hsl = accent ? rgbToHsl(accent) : { h: 0, s: 0, l: 0.5 };
  const metadataLabel = usefulMetadataLabel(context);

  let phrase: string;
  if (hsl.s < 0.12) {
    const nouns = ["Nocturne", "Mist", "Static", "Monochrome"] as const;
    phrase = `Silver ${nouns[stableWordIndex(`${metadataLabel}${palette.accentColor}`, nouns.length)]}`;
  } else {
    const family =
      COLOR_THEME_WORDS.find(({ maxHue }) => hsl.h < maxHue) ?? COLOR_THEME_WORDS[0];
    const noun = family.nouns[
      stableWordIndex(`${metadataLabel}${palette.primaryColor}${palette.accentColor}`, family.nouns.length)
    ];
    phrase = `${family.adjective} ${noun}`;
  }

  if (!metadataLabel) return phrase;
  const suffix = ` — ${phrase}`;
  return `${metadataLabel.slice(0, Math.max(1, 128 - suffix.length)).trim()}${suffix}`;
}

/** Deterministic, on-device palette extraction from decoded cover pixels. */
export function extractCoverPaletteFromPixels(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): CoverPalette {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    throw new Error("Cover image pixels are unavailable.");
  }

  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const sampleStep = Math.max(1, Math.floor(Math.sqrt((width * height) / 4096)));
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const offset = (y * width + x) * 4;
      if ((data[offset + 3] ?? 0) < 128) continue;
      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }
  }

  const colors: ColorBucket[] = [...buckets.values()].map((bucket) => {
    const rgb = {
      r: bucket.r / bucket.count,
      g: bucket.g / bucket.count,
      b: bucket.b / bucket.count,
    };
    return { ...rgb, count: bucket.count, hsl: rgbToHsl(rgb) };
  });
  if (!colors.length) throw new Error("Cover image has no visible colors.");

  const usable = colors.filter(({ hsl }) => hsl.l >= 0.08 && hsl.l <= 0.92);
  const candidates = usable.length ? usable : colors;
  const primary = [...candidates].sort(
    (a, b) => b.count * (0.55 + b.hsl.s) - a.count * (0.55 + a.hsl.s),
  )[0]!;
  const accent = [...candidates].sort((a, b) => {
    const aScore = Math.sqrt(a.count) * (0.3 + a.hsl.s) ** 2 * (0.55 + colorDistance(a, primary));
    const bScore = Math.sqrt(b.count) * (0.3 + b.hsl.s) ** 2 * (0.55 + colorDistance(b, primary));
    return bScore - aScore;
  })[0]!;
  const secondaryCandidate = [...candidates]
    .filter(
      (color) =>
        colorDistance(color, primary) > 0.05 && colorDistance(color, accent) > 0.05,
    )
    .sort((a, b) => {
      const aDistance = Math.min(colorDistance(a, primary), colorDistance(a, accent));
      const bDistance = Math.min(colorDistance(b, primary), colorDistance(b, accent));
      const aScore = Math.sqrt(a.count) * (0.35 + a.hsl.s) * (0.45 + aDistance);
      const bScore = Math.sqrt(b.count) * (0.35 + b.hsl.s) * (0.45 + bDistance);
      return bScore - aScore;
    })[0];
  const dominant = [...colors].sort((a, b) => b.count - a.count)[0]!;

  const primaryRgb = hslToRgb({
    h: primary.hsl.h,
    s: primary.hsl.s < 0.08 ? 0 : clamp(primary.hsl.s, 0.32, 0.82),
    l: clamp(primary.hsl.l, 0.42, 0.62),
  });
  const accentRgb = hslToRgb({
    h: accent.hsl.h,
    s: accent.hsl.s < 0.08 ? 0 : clamp(accent.hsl.s, 0.48, 0.92),
    l: clamp(accent.hsl.l, 0.52, 0.68),
  });
  const secondaryBase: Rgb = secondaryCandidate ?? {
    r: primary.r * 0.58 + accent.r * 0.42,
    g: primary.g * 0.58 + accent.g * 0.42,
    b: primary.b * 0.58 + accent.b * 0.42,
  };
  const secondaryHsl = rgbToHsl(secondaryBase);
  let secondaryRgb = hslToRgb({
    h: secondaryHsl.h,
    s: secondaryHsl.s < 0.08 ? 0 : clamp(secondaryHsl.s, 0.28, 0.74),
    l: clamp(secondaryHsl.l, 0.46, 0.64),
  });
  if (
    Math.min(colorDistance(secondaryRgb, primaryRgb), colorDistance(secondaryRgb, accentRgb)) < 0.07
  ) {
    const adjusted = rgbToHsl(secondaryRgb);
    secondaryRgb = hslToRgb({
      ...adjusted,
      l: adjusted.l < 0.55 ? clamp(adjusted.l + 0.16, 0.46, 0.72) : clamp(adjusted.l - 0.16, 0.32, 0.62),
    });
  }
  const backgroundRgb = hslToRgb({
    h: dominant.hsl.h,
    s: clamp(dominant.hsl.s * 0.65, 0.06, 0.5),
    l: clamp(dominant.hsl.l * 0.22, 0.035, 0.12),
  });

  return {
    primaryColor: toHex(primaryRgb),
    secondaryColor: toHex(secondaryRgb),
    accentColor: toHex(accentRgb),
    backgroundColor: toHex(backgroundRgb),
  };
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cover image could not be decoded."));
    };
    image.src = url;
  });
}

/** Decode a cover and derive safe VISU hex colors without sending artwork off-device. */
export async function deriveCoverPalette(cover: CoverArt): Promise<CoverPalette> {
  const blob = new Blob([new Uint8Array(cover.data)], { type: cover.mime });
  const image =
    typeof createImageBitmap === "function" ? await createImageBitmap(blob) : await loadImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Cover palette analysis is unavailable in this browser.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  if ("close" in image && typeof image.close === "function") image.close();
  return extractCoverPaletteFromPixels(pixels.data, pixels.width, pixels.height);
}
