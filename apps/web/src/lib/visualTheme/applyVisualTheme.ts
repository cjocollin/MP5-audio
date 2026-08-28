import type { CSSProperties } from "react";
import type { VisuPayload } from "@mp5/container";
import {
  ensureReadableAccent,
  ensureReadableText,
  hexToRgb,
  hexWithAlpha,
  parseHexColor,
} from "./colorUtils";
import { enrichVisuColors } from "./visuStylePresets";
import { DEFAULT_APP_ACCENT } from "./themeApplication";

export { DEFAULT_APP_ACCENT };

export interface ResolvedPlayerTheme {
  themeName?: string;
  moodLabel?: string;
  playerStyle?: string;
  visualIntensity?: string;
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
  const secondary = parseHexColor(filled.secondaryColor) ?? primary ?? accent;
  const background = parseHexColor(filled.backgroundColor);
  const text = background
    ? ensureReadableText(background, filled.textColor)
    : parseHexColor(filled.textColor) ?? "#f3f4f6";

  const stops = filled.gradientStops?.filter((s) => parseHexColor(s)) ?? [];
  let cardBackground: string;
  if (stops.length >= 2) {
    cardBackground = `linear-gradient(145deg, ${stops.join(", ")})`;
  } else if (background && primary) {
    cardBackground = `linear-gradient(145deg, ${hexWithAlpha(background, 0.95)} 0%, ${hexWithAlpha(primary, 0.5)} 48%, ${hexWithAlpha(secondary, 0.4)} 76%, ${hexWithAlpha(accent, 0.3)} 100%)`;
  } else if (background) {
    cardBackground = `linear-gradient(160deg, ${hexWithAlpha(background, 0.92)} 0%, ${hexWithAlpha(secondary, 0.32)} 70%, ${hexWithAlpha(accent, 0.24)} 100%)`;
  } else if (primary) {
    cardBackground = `linear-gradient(160deg, ${hexWithAlpha(primary, 0.45)} 0%, ${hexWithAlpha(accent, 0.22)} 100%)`;
  } else {
    cardBackground = `linear-gradient(160deg, ${hexWithAlpha(accent, 0.35)} 0%, ${hexWithAlpha(accent, 0.08)} 100%)`;
  }

  const cardStyle: CSSProperties = {
    background: cardBackground,
    borderColor: "var(--mp5-border)",
    borderWidth: 1,
    borderStyle: "solid",
    boxShadow: "none",
  };

  /** Keep the application chrome neutral; VISU color belongs to artwork and waveform data. */
  const shellStyle: CSSProperties = {
    borderColor: "transparent",
    borderWidth: 0,
    borderStyle: "solid",
    background: "transparent",
    boxShadow: "none",
  };

  const coverFrameStyle: CSSProperties = {
    boxShadow: "none",
  };

  const coverOverlayStyle: CSSProperties = {
    background: "linear-gradient(180deg, rgba(0, 0, 0, 0.02) 0%, transparent 58%, rgba(0, 0, 0, 0.18) 100%)",
    pointerEvents: "none",
  };

  const badgeStyle: CSSProperties = {
    color: "#d8dadd",
    borderColor: hexWithAlpha(accent, 0.65),
    backgroundColor: hexWithAlpha(accent, 0.06),
  };

  const titleStyle: CSSProperties = {
    color: "#f3f4f6",
    textShadow: "none",
  };

  const vars: Record<string, string> = {
    "--mp5-visu-accent": accent,
  };
  if (primary) vars["--mp5-visu-primary"] = primary;
  vars["--mp5-visu-secondary"] = secondary;
  if (background) vars["--mp5-visu-bg"] = background;
  vars["--mp5-visu-text"] = text;

  return {
    themeName: filled.themeName,
    moodLabel: filled.moodLabel,
    playerStyle: filled.playerStyle,
    visualIntensity: filled.visualIntensity,
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
    waveformUnplayedFill: hexWithAlpha(secondary, 0.52),
  };
}

export function themeRootStyle(theme: ResolvedPlayerTheme | null): CSSProperties | undefined {
  if (!theme) return undefined;
  return {
    ...(theme.vars as CSSProperties),
    ...theme.shellStyle,
  };
}

/** App-wide identity and interaction tokens derived from the active file theme. */
export function appChromeThemeStyle(theme: ResolvedPlayerTheme | null): CSSProperties | undefined {
  if (!theme) return undefined;
  const accentRgb = hexToRgb(theme.accent);
  const accentBright = ensureReadableAccent(theme.accent);
  const primary = theme.primary ?? theme.accent;
  const primaryRgb = hexToRgb(primary);
  const primaryBright = ensureReadableAccent(primary);
  const secondary = theme.secondary ?? primary;
  const secondaryRgb = hexToRgb(secondary);
  const secondaryBright = ensureReadableAccent(secondary);
  return {
    "--mp5-accent": theme.accent,
    "--mp5-accent-rgb": accentRgb
      ? `${accentRgb.r} ${accentRgb.g} ${accentRgb.b}`
      : "112 77 184",
    "--mp5-accent-bright": accentBright,
    "--mp5-primary": primary,
    "--mp5-primary-rgb": primaryRgb
      ? `${primaryRgb.r} ${primaryRgb.g} ${primaryRgb.b}`
      : "154 109 215",
    "--mp5-primary-bright": primaryBright,
    "--mp5-secondary": secondary,
    "--mp5-secondary-rgb": secondaryRgb
      ? `${secondaryRgb.r} ${secondaryRgb.g} ${secondaryRgb.b}`
      : "167 139 250",
    "--mp5-secondary-bright": secondaryBright,
    "--mp5-logo-primary": primaryBright,
    "--mp5-primary-control": `color-mix(in srgb, ${theme.accent} 62%, #242026)`,
    "--mp5-primary-control-hover": `color-mix(in srgb, ${accentBright} 72%, #242026)`,
    "--mp5-theme-wash": hexWithAlpha(primary, 0.14),
    "--mp5-theme-border": hexWithAlpha(primary, 0.42),
    "--mp5-theme-secondary-wash": hexWithAlpha(secondary, 0.12),
    "--mp5-theme-secondary-border": hexWithAlpha(secondary, 0.38),
  } as CSSProperties;
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

/** VISU guard: must never set document-level or url() backgrounds. */
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

export function visuFallbackLabel(
  theme: ResolvedPlayerTheme | null | undefined,
  useFileThemes = true,
): string {
  if (!useFileThemes) return "Default visual";
  if (!theme) return "Default visual";
  return theme.themeName ? `VISU: ${theme.themeName}` : "VISU theme";
}
