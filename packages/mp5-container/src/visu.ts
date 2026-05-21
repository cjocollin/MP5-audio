import {
  decodeJsonChunk,
  encodeJsonChunk,
  sanitizeJsonString,
} from "./chunkJson.js";

export type VisuSource = "user" | "artist" | "app" | "unknown";

export type VisualIntensity = "low" | "medium" | "high";

export type VisuPlayerStyle =
  | "calm"
  | "bold"
  | "minimal"
  | "cinematic"
  | "neon"
  | "custom";

export interface VisuPayload {
  version?: number;
  themeName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  moodLabel?: string;
  visualIntensity?: VisualIntensity;
  playerStyle?: VisuPlayerStyle;
  gradientStops?: string[];
  coverArtDerived?: boolean;
  source?: VisuSource;
}

const HEX_SHORT = /^#([0-9a-fA-F]{3})$/;
const HEX_LONG = /^#([0-9a-fA-F]{6})$/;
const HEX_SHORT_ALPHA = /^#([0-9a-fA-F]{4})$/;
const HEX_LONG_ALPHA = /^#([0-9a-fA-F]{8})$/;

const INTENSITIES: readonly VisualIntensity[] = ["low", "medium", "high"];
const PLAYER_STYLES: readonly VisuPlayerStyle[] = [
  "calm",
  "bold",
  "minimal",
  "cinematic",
  "neon",
  "custom",
];

const MAX_GRADIENT_STOPS = 8;

/** Strict hex only — rejects css(), url(), etc. */
export function parseHexColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s.startsWith("#") || s.length > 9) return undefined;
  let m = s.match(HEX_LONG);
  if (m) return `#${m[1]!.toLowerCase()}`;
  m = s.match(HEX_SHORT);
  if (m) {
    const h = m[1]!;
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  m = s.match(HEX_LONG_ALPHA);
  if (m) return `#${m[1]!.slice(0, 6).toLowerCase()}`;
  m = s.match(HEX_SHORT_ALPHA);
  if (m) {
    const h = m[1]!;
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return undefined;
}

function parseIntensity(s: unknown): VisualIntensity | undefined {
  const v = sanitizeJsonString(s, 16)?.toLowerCase();
  if (v && (INTENSITIES as readonly string[]).includes(v)) return v as VisualIntensity;
  return undefined;
}

function parsePlayerStyle(s: unknown): VisuPlayerStyle | undefined {
  const v = sanitizeJsonString(s, 32)?.toLowerCase();
  if (v && (PLAYER_STYLES as readonly string[]).includes(v)) return v as VisuPlayerStyle;
  return undefined;
}

function parseSource(s: unknown): VisuSource | undefined {
  if (s === "user" || s === "artist" || s === "app" || s === "unknown") return s;
  return undefined;
}

function parseGradientStops(arr: unknown): string[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  const stops = arr
    .map((x) => parseHexColor(x))
    .filter((c): c is string => !!c)
    .slice(0, MAX_GRADIENT_STOPS);
  return stops.length ? stops : undefined;
}

export function hasVisuContent(p: VisuPayload): boolean {
  return !!(
    p.themeName ||
    p.primaryColor ||
    p.secondaryColor ||
    p.accentColor ||
    p.backgroundColor ||
    p.textColor ||
    p.moodLabel ||
    p.visualIntensity ||
    p.playerStyle ||
    p.gradientStops?.length
  );
}

export function encodeVisu(p: VisuPayload): Uint8Array {
  const payload: VisuPayload = {
    version: 1,
    themeName: sanitizeJsonString(p.themeName, 128),
    primaryColor: parseHexColor(p.primaryColor),
    secondaryColor: parseHexColor(p.secondaryColor),
    accentColor: parseHexColor(p.accentColor),
    backgroundColor: parseHexColor(p.backgroundColor),
    textColor: parseHexColor(p.textColor),
    moodLabel: sanitizeJsonString(p.moodLabel, 64),
    visualIntensity: parseIntensity(p.visualIntensity),
    playerStyle: parsePlayerStyle(p.playerStyle),
    gradientStops: p.gradientStops
      ? parseGradientStops(p.gradientStops)
      : undefined,
    coverArtDerived: p.coverArtDerived === true ? true : undefined,
    source: parseSource(p.source),
  };
  if (!hasVisuContent(payload)) {
    throw new Error("VISU payload has no displayable theme fields");
  }
  return encodeJsonChunk(payload);
}

export function decodeVisu(data?: Uint8Array): VisuPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "VISU");
  if (!raw) return null;
  const payload: VisuPayload = {
    version: typeof raw.version === "number" ? raw.version : 1,
    themeName: sanitizeJsonString(raw.themeName, 128),
    primaryColor: parseHexColor(raw.primaryColor),
    secondaryColor: parseHexColor(raw.secondaryColor),
    accentColor: parseHexColor(raw.accentColor),
    backgroundColor: parseHexColor(raw.backgroundColor),
    textColor: parseHexColor(raw.textColor),
    moodLabel: sanitizeJsonString(raw.moodLabel, 64),
    visualIntensity: parseIntensity(raw.visualIntensity),
    playerStyle: parsePlayerStyle(raw.playerStyle),
    gradientStops: parseGradientStops(raw.gradientStops),
    coverArtDerived: raw.coverArtDerived === true ? true : undefined,
    source: parseSource(raw.source),
  };
  return hasVisuContent(payload) ? payload : null;
}
