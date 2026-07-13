import type { ExplPayload, MoodPayload, SafePayload, SummPayload, VibePayload } from "@mp5/container";
import type { AiSettings } from "../aiSettings";
import { extractJsonObject } from "../cloudJson";
import { getAiProvider } from "../aiProviders";
import { callAnthropicMessages, callGeminiGenerate, callOpenAiStyleChat } from "./cloudAdapters";

export interface CloudMetadataContext {
  title: string;
  artist: string;
  album: string;
  genre: string;
  comment: string;
  lyricsText: string;
}

interface CloudSuggestionJson {
  moodTags?: string[];
  moodIntensity?: number;
  moodEnergy?: number;
  vibeTags?: string[];
  summary?: string;
  explicit?: boolean;
  cleanVersionAvailable?: boolean;
  strongLanguage?: boolean;
  sexualContent?: boolean;
  violence?: boolean;
  drugReferences?: boolean;
  alcoholReferences?: boolean;
  selfHarmThemes?: boolean;
  traumaThemes?: boolean;
  matureThemes?: boolean;
  griefThemes?: boolean;
  distressingThemes?: boolean;
  contentWarnings?: string[];
}

function buildPrompt(ctx: CloudMetadataContext, opts?: { moodVibe?: boolean; summary?: boolean; contentWarnings?: boolean }): string {
  const keys: string[] = [];
  if (opts?.moodVibe !== false) {
    keys.push("moodTags (string[])", "moodIntensity (0-1)", "moodEnergy (0-1)", "vibeTags (string[])");
  }
  if (opts?.summary !== false) {
    keys.push("summary (one sentence)");
  }
  if (opts?.contentWarnings) {
    keys.push(
      "explicit, cleanVersionAvailable, strongLanguage, sexualContent, violence, drugReferences, alcoholReferences, selfHarmThemes, traumaThemes, matureThemes, griefThemes, distressingThemes (booleans)",
      "contentWarnings (string[] of short labels)",
    );
  }

  return [
    "Suggest optional music metadata for an MP5 audio file.",
    `Return JSON only with keys: ${keys.join(", ")}.`,
    "Use lowercase short tags. Summary must be one factual sentence about mood/instrumentation, no marketing.",
    opts?.contentWarnings
      ? "Content flags: only set true when reasonably confident from lyrics/title/genre; prefer false when unknown."
      : "",
    "",
    `Title: ${ctx.title || "Unknown"}`,
    `Artist: ${ctx.artist || "Unknown"}`,
    `Album: ${ctx.album || ""}`,
    `Genre: ${ctx.genre || ""}`,
    ctx.comment ? `Comment: ${ctx.comment}` : "",
    ctx.lyricsText ? `Lyrics excerpt:\n${ctx.lyricsText.slice(0, 1200)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function clamp01(n: unknown): number | undefined {
  if (typeof n !== "number" || Number.isNaN(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

function boolFlag(value: unknown): boolean | undefined {
  return value === true ? true : undefined;
}

function parseContentWarnings(parsed: CloudSuggestionJson): { expl?: ExplPayload; safe?: SafePayload } {
  const flags = [
    parsed.explicit,
    parsed.strongLanguage,
    parsed.sexualContent,
    parsed.violence,
    parsed.drugReferences,
    parsed.alcoholReferences,
    parsed.selfHarmThemes,
    parsed.traumaThemes,
    parsed.matureThemes,
    parsed.griefThemes,
    parsed.distressingThemes,
  ];
  if (!flags.some(Boolean)) return {};

  const contentWarnings = Array.isArray(parsed.contentWarnings)
    ? parsed.contentWarnings
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12)
    : undefined;

  const expl: ExplPayload = {
    explicit: boolFlag(parsed.explicit),
    cleanVersionAvailable: boolFlag(parsed.cleanVersionAvailable),
    strongLanguage: boolFlag(parsed.strongLanguage),
    sexualContent: boolFlag(parsed.sexualContent),
    violence: boolFlag(parsed.violence),
    drugReferences: boolFlag(parsed.drugReferences),
    alcoholReferences: boolFlag(parsed.alcoholReferences),
    selfHarmThemes: boolFlag(parsed.selfHarmThemes),
    traumaThemes: boolFlag(parsed.traumaThemes),
    matureThemes: boolFlag(parsed.matureThemes),
    ...(contentWarnings?.length ? { contentWarnings } : {}),
    warningSource: "ai",
    aiGenerated: true,
  };

  const safe: SafePayload = {
    griefThemes: boolFlag(parsed.griefThemes),
    traumaThemes: boolFlag(parsed.traumaThemes),
    distressingThemes: boolFlag(parsed.distressingThemes),
    warningSource: "ai",
    aiGenerated: true,
  };

  const hasExpl = Object.entries(expl).some(([k, v]) => k !== "warningSource" && k !== "aiGenerated" && v);
  const hasSafe = safe.griefThemes || safe.traumaThemes || safe.distressingThemes;

  return {
    ...(hasExpl ? { expl } : {}),
    ...(hasSafe ? { safe } : {}),
  };
}

async function callCloudModel(settings: Pick<AiSettings, "providerId" | "apiKey" | "apiBaseUrl" | "model">, prompt: string): Promise<string> {
  const provider = getAiProvider(settings.providerId) ?? getAiProvider("openai")!;
  const { apiStyle } = provider;

  if (apiStyle === "anthropic") {
    return callAnthropicMessages(settings.apiBaseUrl, settings.apiKey, settings.model, prompt);
  }
  if (apiStyle === "gemini") {
    return callGeminiGenerate(settings.apiBaseUrl, settings.apiKey, settings.model, prompt);
  }
  return callOpenAiStyleChat(settings.apiBaseUrl, settings.apiKey, settings.model, prompt);
}

export async function suggestCloudMetadata(
  ctx: CloudMetadataContext,
  settings: Pick<AiSettings, "providerId" | "apiKey" | "apiBaseUrl" | "model">,
  opts?: { moodVibe?: boolean; summary?: boolean; contentWarnings?: boolean },
): Promise<{ mood?: MoodPayload; vibe?: VibePayload; summ?: SummPayload; expl?: ExplPayload; safe?: SafePayload }> {
  const wantMood = opts?.moodVibe !== false;
  const wantSummary = opts?.summary !== false;
  const wantWarnings = opts?.contentWarnings === true;
  if (!wantMood && !wantSummary && !wantWarnings) return {};
  if (!settings.apiKey.trim()) {
    throw new Error("Add an API key in Settings to use cloud AI suggestions.");
  }
  if (!settings.model.trim()) {
    throw new Error("Choose a cloud model in Settings.");
  }

  const content = await callCloudModel(
    settings,
    buildPrompt(ctx, { moodVibe: wantMood, summary: wantSummary, contentWarnings: wantWarnings }),
  );
  const parsed = extractJsonObject<CloudSuggestionJson>(content);
  if (!parsed) throw new Error("Cloud AI response was not valid JSON.");

  const providerLabel = getAiProvider(settings.providerId)?.label ?? settings.providerId;
  const out: {
    mood?: MoodPayload;
    vibe?: VibePayload;
    summ?: SummPayload;
    expl?: ExplPayload;
    safe?: SafePayload;
  } = {};

  if (wantMood) {
    const moodTags = parseTags(parsed.moodTags);
    if (moodTags.length) {
      out.mood = {
        tags: moodTags,
        intensity: clamp01(parsed.moodIntensity),
        energy: clamp01(parsed.moodEnergy),
        source: "ai-cloud",
      };
    }
    const vibeTags = parseTags(parsed.vibeTags);
    if (vibeTags.length) {
      out.vibe = { tags: vibeTags, source: "ai-cloud" };
    }
  }

  if (wantSummary && typeof parsed.summary === "string" && parsed.summary.trim()) {
    out.summ = {
      text: parsed.summary.trim().slice(0, 512),
      source: "ai-cloud",
      model: `${providerLabel}/${settings.model}`,
      generatedAt: new Date().toISOString(),
    };
  }

  if (wantWarnings) {
    const warnings = parseContentWarnings(parsed);
    if (warnings.expl) out.expl = warnings.expl;
    if (warnings.safe) out.safe = warnings.safe;
  }

  return out;
}
