import type { CSSProperties } from "react";
import type { VisuPayload } from "@mp5/container";
import { ensureReadableText, hexWithAlpha, parseHexColor } from "./colorUtils";
import { enrichVisuColors } from "./visuStylePresets";
import { DEFAULT_APP_ACCENT } from "./themeApplication";

export { DEFAULT_APP_ACCENT };

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
  /** Now Playing outer shell (border + wash). */
  shellStyle: CSSProperties;
  /** Cover card / placeholder background. */
  cardStyle: CSSProperties;
  /** Ring around cover art. */
  coverFrameStyle: CSSProperties;
  /** Gradient scrim over cover image so theme shows with art present. */
  coverOverlayStyle: CSSProperties;
  badgeStyle: CSSProperties;
  titleStyle: CSSProperties;
  vars: Record<string, string>;
  waveformPlayedFill: string;
  waveformUnplayedFill: string;
}

export function resolvePlayerTheme(visu: VisuPayload | null | undefined): ResolvedPlayerTheme | null {
  if (!visu) return null;
  const { visu: filled, colorsDerived } = enrichVisuColors(visu);
  const accent =
    parseHexColor(filled.accentColor) ?? parseHexColor(filled.primaryColor) ?? DEFAULT_APP_ACCENT;
  const primary = parseHexColor(filled.primaryColor);
  const secondary = parseHexColor(filled.secondaryColor);
  const background = parseHexColor(filled.backgroundColor);
  const text = background
    ? ensureReadableText(background, filled.textColor)
    : parseHexColor(filled.textColor) ?? "#f3f4f6";

  const stops = filled.gradientStops?.filter((s) => parseHexColor(s)) ?? [];
  let cardBackground: string;
  if (stops.length >= 2) {
    cardBackground = `linear-gradient(145deg, ${stops.join(", ")})`;
  } else if (background && primary) {
    cardBackground = `linear-gradient(145deg, ${hexWithAlpha(background, 0.95)} 0%, ${hexWithAlpha(primary, 0.55)} 55%, ${hexWithAlpha(accent, 0.35)} 100%)`;
  } else if (background) {
    cardBackground = `linear-gradient(160deg, ${hexWithAlpha(background, 0.92)} 0%, ${hexWithAlpha(accent, 0.28)} 100%)`;
  } else if (primary) {
    cardBackground = `linear-gradient(160deg, ${hexWithAlpha(primary, 0.45)} 0%, ${hexWithAlpha(accent, 0.22)} 100%)`;
  } else {
    cardBackground = `linear-gradient(160deg, ${hexWithAlpha(accent, 0.35)} 0%, ${hexWithAlpha(accent, 0.08)} 100%)`;
  }

  const cardStyle: CSSProperties = {
    background: cardBackground,
    borderColor: hexWithAlpha(accent, 0.65),
    borderWidth: 2,
    borderStyle: "solid",
    boxShadow: `0 0 0 1px ${hexWithAlpha(accent, 0.2)}, 0 16px 48px ${hexWithAlpha(accent, 0.28)}, inset 0 0 80px ${hexWithAlpha(background ?? accent, 0.15)}`,
  };

  /** Now Playing shell only — subtle tint, no full-column wallpaper wash. */
  const shellStyle: CSSProperties = {
    borderColor: hexWithAlpha(accent, 0.4),
    borderWidth: 1,
    borderStyle: "solid",
    background: background
      ? `linear-gradient(180deg, ${hexWithAlpha(background, 0.28)} 0%, ${hexWithAlpha(accent, 0.06)} 48%, transparent 100%)`
      : `linear-gradient(180deg, ${hexWithAlpha(accent, 0.12)} 0%, transparent 62%)`,
    boxShadow: `inset 0 1px 0 ${hexWithAlpha(accent, 0.1)}`,
  };

  const coverFrameStyle: CSSProperties = {
    boxShadow: `0 0 0 3px ${hexWithAlpha(accent, 0.55)}, 0 12px 36px ${hexWithAlpha(accent, 0.25)}`,
  };

  const coverOverlayStyle: CSSProperties = {
    background: `linear-gradient(180deg, ${hexWithAlpha(accent, 0.08)} 0%, transparent 35%, transparent 55%, ${hexWithAlpha(background ?? primary ?? accent, 0.72)} 100%)`,
    pointerEvents: "none",
  };

  const badgeStyle: CSSProperties = {
    color: accent,
    borderColor: hexWithAlpha(accent, 0.55),
    backgroundColor: hexWithAlpha(accent, 0.18),
  };

  const titleStyle: CSSProperties = {
    color: text,
    textShadow: `0 0 24px ${hexWithAlpha(accent, 0.35)}`,
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
    shellStyle,
    cardStyle,
    coverFrameStyle,
    coverOverlayStyle,
    badgeStyle,
    titleStyle,
    vars,
    waveformPlayedFill: accent,
    waveformUnplayedFill: hexWithAlpha(secondary ?? accent, 0.35),
  };
}

export function themeRootStyle(theme: ResolvedPlayerTheme | null): CSSProperties | undefined {
  if (!theme) return undefined;
  return {
    ...(theme.vars as CSSProperties),
    ...theme.shellStyle,
  };
}

/** Cover card styles — when art is present, skip full gradient fill so the image stays contained. */
export function resolveCoverCardStyle(
  theme: ResolvedPlayerTheme | null | undefined,
  hasCoverArt: boolean,
): CSSProperties {
  if (!theme) return {};
  if (hasCoverArt) {
    return {
      borderColor: theme.cardStyle.borderColor,
      borderWidth: theme.cardStyle.borderWidth,
      borderStyle: theme.cardStyle.borderStyle,
      ...theme.coverFrameStyle,
    };
  }
  return { ...theme.cardStyle, ...theme.coverFrameStyle };
}

/** Alpha guard: VISU must never set document-level or url() backgrounds. */
export function themeUsesGlobalBackgroundImage(theme: ResolvedPlayerTheme | null): boolean {
  if (!theme) return false;
  const check = (style: CSSProperties | undefined) => {
    const bg = style?.background ?? style?.backgroundImage;
    if (typeof bg !== "string") return false;
    return /url\s*\(/i.test(bg);
  };
  return (
    check(theme.shellStyle) ||
    check(theme.cardStyle) ||
    check(theme.coverOverlayStyle) ||
    check(themeRootStyle(theme))
  );
}

/** True when resolved accent is meaningfully different from default app purple. */
export function themeAccentDiffersFromDefault(theme: ResolvedPlayerTheme | null): boolean {
  if (!theme) return false;
  return theme.accent.toLowerCase() !== DEFAULT_APP_ACCENT.toLowerCase();
}
