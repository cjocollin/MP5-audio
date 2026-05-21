import type { CSSProperties } from "react";
import type { VisuPayload } from "@mp5/container";
import { ensureReadableText, hexWithAlpha, parseHexColor } from "./colorUtils";
import { enrichVisuColors } from "./visuStylePresets";

export interface ResolvedPlayerTheme {
  themeName?: string;
  moodLabel?: string;
  playerStyle?: string;
  source?: string;
  colorsDerived?: boolean;
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
  const { visu: filled, colorsDerived } = enrichVisuColors(visu);
  const accent =
    parseHexColor(filled.accentColor) ?? parseHexColor(filled.primaryColor) ?? DEFAULT_ACCENT;
  const primary = parseHexColor(filled.primaryColor);
  const secondary = parseHexColor(filled.secondaryColor);
  const background = parseHexColor(filled.backgroundColor);
  const text = background
    ? ensureReadableText(background, filled.textColor)
    : parseHexColor(filled.textColor) ?? "#f3f4f6";

  const stops = filled.gradientStops?.filter((s) => parseHexColor(s)) ?? [];
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

  const cardStyle: CSSProperties = {
    boxShadow: `0 0 0 1px ${hexWithAlpha(accent, 0.25)}, 0 12px 40px ${hexWithAlpha(accent, 0.15)}`,
  };
  if (cardBackground) {
    cardStyle.background = cardBackground;
    cardStyle.borderColor = hexWithAlpha(accent, 0.45);
  } else {
    cardStyle.borderColor = hexWithAlpha(accent, 0.4);
    cardStyle.background = hexWithAlpha(accent, 0.08);
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
    themeName: filled.themeName,
    moodLabel: filled.moodLabel,
    playerStyle: filled.playerStyle,
    source: filled.source,
    colorsDerived,
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
  const style: CSSProperties = { ...(theme.vars as CSSProperties) };
  if (theme.background) {
    style.background = `linear-gradient(180deg, ${hexWithAlpha(theme.background, 0.35)} 0%, transparent 48%)`;
  }
  return style;
}
