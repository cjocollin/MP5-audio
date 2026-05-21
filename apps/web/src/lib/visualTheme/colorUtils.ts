import { parseHexColor } from "@mp5/container";

export { parseHexColor };

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const c = parseHexColor(hex);
  if (!c) return null;
  const n = parseInt(c.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** WCAG relative luminance (sRGB). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const MIN_TEXT_CONTRAST = 4.5;

/** Pick readable text on a background; prefers explicit text color when contrast OK. */
export function ensureReadableText(
  backgroundHex: string,
  preferredText?: string,
): string {
  const pref = preferredText ? parseHexColor(preferredText) : undefined;
  if (pref && contrastRatio(pref, backgroundHex) >= MIN_TEXT_CONTRAST) {
    return pref;
  }
  const dark = "#111827";
  const light = "#f3f4f6";
  return contrastRatio(light, backgroundHex) >= contrastRatio(dark, backgroundHex)
    ? light
    : dark;
}

/** Append alpha to #rrggbb as 8-digit hex (0–1). */
export function hexWithAlpha(hex: string, alpha: number): string {
  const c = parseHexColor(hex);
  if (!c) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${c}${a.toString(16).padStart(2, "0")}`;
}
