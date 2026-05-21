import type { VisuPayload, VisuPlayerStyle } from "@mp5/container";
import { parseHexColor } from "@mp5/container";

export interface VisuColorPreset {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor?: string;
  gradientStops?: string[];
}

const PRESETS: Record<VisuPlayerStyle, VisuColorPreset> = {
  calm: {
    primaryColor: "#5b7c99",
    secondaryColor: "#8faec4",
    accentColor: "#7eb8da",
    backgroundColor: "#1a2430",
    textColor: "#e8f0f6",
  },
  bold: {
    primaryColor: "#c41e3a",
    secondaryColor: "#ff6b35",
    accentColor: "#ffd23f",
    backgroundColor: "#1a0a0e",
    gradientStops: ["#c41e3a", "#ff6b35", "#1a0a0e"],
  },
  minimal: {
    primaryColor: "#6b7280",
    secondaryColor: "#9ca3af",
    accentColor: "#d1d5db",
    backgroundColor: "#111827",
    textColor: "#f9fafb",
  },
  cinematic: {
    primaryColor: "#2d1b4e",
    secondaryColor: "#8b5cf6",
    accentColor: "#e879f9",
    backgroundColor: "#0f0a18",
    gradientStops: ["#2d1b4e", "#5b21b6", "#0f0a18"],
  },
  neon: {
    primaryColor: "#0ff0fc",
    secondaryColor: "#ff00aa",
    accentColor: "#39ff14",
    backgroundColor: "#0a0014",
    gradientStops: ["#0ff0fc", "#ff00aa", "#0a0014"],
  },
  custom: {
    primaryColor: "#6366f1",
    secondaryColor: "#a78bfa",
    accentColor: "#f472b6",
    backgroundColor: "#18181b",
  },
};

/** Hash theme name to stable accent when file has VISU metadata but no hex colors. */
function hashAccentFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 65% 58%)`;
}

function hslToHex(hsl: string): string | undefined {
  const m = hsl.match(/hsl\(\s*(\d+)\s+(\d+)%\s+(\d+)%\s*\)/i);
  if (!m) return undefined;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function visuHasExplicitColors(visu: VisuPayload): boolean {
  return !!(
    parseHexColor(visu.primaryColor) ||
    parseHexColor(visu.accentColor) ||
    parseHexColor(visu.backgroundColor) ||
    visu.gradientStops?.some((s) => parseHexColor(s))
  );
}

/** Fill missing VISU colors from playerStyle preset or theme name hash. */
export function enrichVisuColors(visu: VisuPayload): {
  visu: VisuPayload;
  colorsDerived: boolean;
  presetUsed?: VisuPlayerStyle;
} {
  if (visuHasExplicitColors(visu)) {
    return { visu, colorsDerived: false };
  }
  const style = visu.playerStyle ?? "cinematic";
  const preset = PRESETS[style] ?? PRESETS.cinematic;
  const nameAccent = visu.themeName ? hslToHex(hashAccentFromName(visu.themeName)) : undefined;
  const enriched: VisuPayload = {
    ...visu,
    primaryColor: visu.primaryColor ?? preset.primaryColor,
    secondaryColor: visu.secondaryColor ?? preset.secondaryColor,
    accentColor: visu.accentColor ?? nameAccent ?? preset.accentColor,
    backgroundColor: visu.backgroundColor ?? preset.backgroundColor,
    textColor: visu.textColor ?? preset.textColor,
    gradientStops: visu.gradientStops?.length ? visu.gradientStops : preset.gradientStops,
  };
  return { visu: enriched, colorsDerived: true, presetUsed: style };
}
