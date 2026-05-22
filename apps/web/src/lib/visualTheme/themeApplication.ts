import type { VisuPayload } from "@mp5/container";
import { parseVisuFromFile } from "./parseVisuFromFile";
import type { Mp5File } from "@mp5/container";
import { resolvePlayerTheme, type ResolvedPlayerTheme } from "./applyVisualTheme";
import { enrichVisuColors, visuHasExplicitColors } from "./visuStylePresets";

/** Default MP5 app accent (Tailwind `accent`) — used to detect visible theme shift. */
export const DEFAULT_APP_ACCENT = "#8b5cf6";

export type ThemeSourceKind = "visu" | "preset_fallback" | "disabled" | "missing";

export interface ThemeApplicationStatus {
  applied: boolean;
  source: ThemeSourceKind;
  label: string;
  hasVisuChunk: boolean;
  useFileThemes: boolean;
  colorsDerived: boolean;
  hasExplicitColors: boolean;
}

export function describeThemeApplication(
  visu: VisuPayload | null | undefined,
  useFileThemes: boolean,
): ThemeApplicationStatus {
  if (!visu) {
    return {
      applied: false,
      source: "missing",
      label: "File theme applied: no · Theme source: missing VISU",
      hasVisuChunk: false,
      useFileThemes,
      colorsDerived: false,
      hasExplicitColors: false,
    };
  }
  if (!useFileThemes) {
    return {
      applied: false,
      source: "disabled",
      label: "File theme applied: no · Theme source: disabled (Settings)",
      hasVisuChunk: true,
      useFileThemes: false,
      colorsDerived: false,
      hasExplicitColors: visuHasExplicitColors(visu),
    };
  }
  const { colorsDerived } = enrichVisuColors(visu);
  const hasExplicit = visuHasExplicitColors(visu);
  const source: ThemeSourceKind = hasExplicit ? "visu" : "preset_fallback";
  const sourceNote =
    source === "visu"
      ? "embedded VISU colors"
      : `preset fallback (${visu.playerStyle ?? "cinematic"})`;
  return {
    applied: true,
    source,
    label: `File theme applied: yes · Theme source: ${sourceNote}`,
    hasVisuChunk: true,
    useFileThemes: true,
    colorsDerived,
    hasExplicitColors: hasExplicit,
  };
}

export function resolveThemeForFile(
  parsed: Mp5File | undefined,
  useFileThemes: boolean,
): { theme: ResolvedPlayerTheme | null; status: ThemeApplicationStatus } {
  const visu = parseVisuFromFile(parsed);
  const status = describeThemeApplication(visu, useFileThemes);
  const theme = status.applied ? resolvePlayerTheme(visu) : null;
  return { theme, status };
}
