import type { CSSProperties } from "react";
import type { VisuPayload } from "@mp5/container";
import { ensureReadableText, hexWithAlpha, parseHexColor } from "./colorUtils";

export interface ResolvedPlayerTheme {
  themeName?: string;
  moodLabel?: string;
  playerStyle?: string;
  source?: string;
  accent: string;
  primary?: string;
  secondary?: string;
  background?: string;
  text: string;
  cardStyle: CSSProperties;
  badgeStyle: CSSProperties;
  vars: Record<string, string>;
}

const DEFAULT_ACCENT = "#8b5cf6";

export function resolvePlayerTheme(visu: VisuPayload | null | undefined): ResolvedPlayerTheme | null {
  if (!visu) return null;
  const accent = parseHexColor(visu.accentColor) ?? parseHexColor(visu.primaryColor) ?? DEFAULT_ACCENT;
  const primary = parseHexColor(visu.primaryColor);
  const secondary = parseHexColor(visu.secondaryColor);
  const background = parseHexColor(visu.backgroundColor);
  const text = background
    ? ensureReadableText(background, visu.textColor)
    : parseHexColor(visu.textColor) ?? "#f3f4f6";

  const stops = visu.gradientStops?.filter((s) => parseHexColor(s)) ?? [];
  let cardBackground: string | undefined;
  if (stops.length >= 2) {
    cardBackground = `linear-gradient(135deg, ${stops.join(", ")})`;
  } else if (background && primary) {
    cardBackground = `linear-gradient(160deg, ${hexWithAlpha(background, 0.92)} 0%, ${hexWithAlpha(primary, 0.35)} 100%)`;
  } else if (background) {
    cardBackground = hexWithAlpha(background, 0.88);
  } else if (primary) {
    cardBackground = `linear-gradient(160deg, ${hexWithAlpha(primary, 0.18)} 0%, transparent 70%)`;
  }

  const cardStyle: CSSProperties = {};
  if (cardBackground) {
    cardStyle.background = cardBackground;
    cardStyle.borderColor = hexWithAlpha(accent, 0.35);
  }

  const badgeStyle: CSSProperties = {
    color: accent,
    borderColor: hexWithAlpha(accent, 0.4),
    backgroundColor: hexWithAlpha(accent, 0.12),
  };

  const vars: Record<string, string> = {
    "--mp5-visu-accent": accent,
  };
  if (primary) vars["--mp5-visu-primary"] = primary;
  if (secondary) vars["--mp5-visu-secondary"] = secondary;
  if (background) vars["--mp5-visu-bg"] = background;
  vars["--mp5-visu-text"] = text;

  return {
    themeName: visu.themeName,
    moodLabel: visu.moodLabel,
    playerStyle: visu.playerStyle,
    source: visu.source,
    accent,
    primary,
    secondary,
    background,
    text,
    cardStyle,
    badgeStyle,
    vars,
  };
}

export function themeRootStyle(theme: ResolvedPlayerTheme | null): CSSProperties | undefined {
  if (!theme) return undefined;
  return theme.vars as CSSProperties;
}
