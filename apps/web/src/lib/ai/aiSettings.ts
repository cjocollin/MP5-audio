import {
  AI_MODEL_CUSTOM_ID,
  defaultModelForProvider,
  getAiProvider,
  inferProviderId,
} from "./aiProviders";

export interface AiSettings {
  enabled: boolean;
  localBeat: boolean;
  cloudBeat: boolean;
  cloudStructure: boolean;
  cloudLyrics: boolean;
  cloudContentWarnings: boolean;
  cloudMoodVibe: boolean;
  cloudSummary: boolean;
  providerId: string;
  apiKey: string;
  apiBaseUrl: string;
  model: string;
}

export const AI_SETTINGS_STORAGE_KEY = "mp5-ai-settings-v2";
const LEGACY_STORAGE_KEY = "mp5-ai-settings-v1";

export { AI_MODEL_CUSTOM_ID } from "./aiProviders";
export {
  AI_PROVIDERS,
  getAiProvider,
  modelPresetIdForProvider,
  modelFromProviderPreset,
  defaultModelForProvider,
  inferProviderId,
  type AiProviderDefinition,
  type AiModelPreset,
} from "./aiProviders";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  localBeat: true,
  cloudBeat: false,
  cloudStructure: false,
  cloudLyrics: false,
  cloudContentWarnings: false,
  cloudMoodVibe: true,
  cloudSummary: true,
  providerId: "openai",
  apiKey: "",
  apiBaseUrl: "https://api.openai.com/v1",
  model: "gpt-5.4-nano",
};

const MODEL_REPLACEMENTS: Record<string, Record<string, string>> = {
  openai: {
    "gpt-3.5-turbo": "gpt-5.4-nano",
    "gpt-4.1-nano": "gpt-5.4-nano",
    "o3-mini": "gpt-5.4-mini",
    "o4-mini": "gpt-5.4-mini",
  },
  anthropic: {
    "claude-sonnet-4-20250514": "claude-sonnet-4-6",
    "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
    "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
    "claude-3-opus-20240229": "claude-opus-4-8",
  },
  gemini: {
    "gemini-2.0-flash": "gemini-3.5-flash",
    "gemini-2.5-flash-preview-05-20": "gemini-3.5-flash",
    "gemini-2.5-pro-preview-06-05": "gemini-2.5-pro",
    "gemini-1.5-flash": "gemini-3.1-flash-lite",
    "gemini-1.5-pro": "gemini-2.5-pro",
  },
  deepseek: {
    "deepseek-chat": "deepseek-v4-flash",
    "deepseek-reasoner": "deepseek-v4-pro",
  },
  kimi: {
    "kimi-k2-0711-preview": "kimi-k2.6",
  },
  zai: {
    "glm-4-plus": "glm-5.2",
    "glm-4-flash": "glm-4.7-flash",
    "glm-4-air": "glm-4.5-air",
  },
};

function migrateBaseUrl(providerId: string, apiBaseUrl: string): string {
  const normalized = apiBaseUrl.trim().replace(/\/$/, "");
  const lower = normalized.toLowerCase();
  if (providerId === "gemini" && lower === "https://generativelanguage.googleapis.com/v1") {
    return "https://generativelanguage.googleapis.com/v1beta";
  }
  if (providerId === "deepseek" && lower === "https://api.deepseek.com/v1") {
    return "https://api.deepseek.com";
  }
  return normalized;
}

function migrateModel(providerId: string, model: string): string {
  const trimmed = model.trim();
  return MODEL_REPLACEMENTS[providerId]?.[trimmed] ?? trimmed;
}

function normalizeSettings(parsed: Partial<AiSettings>): AiSettings {
  const providerId =
    typeof parsed.providerId === "string" && getAiProvider(parsed.providerId)
      ? parsed.providerId
      : inferProviderId(
          typeof parsed.apiBaseUrl === "string" ? parsed.apiBaseUrl : DEFAULT_AI_SETTINGS.apiBaseUrl,
          typeof parsed.model === "string" ? parsed.model : DEFAULT_AI_SETTINGS.model,
        );

  const provider = getAiProvider(providerId);
  const apiBaseUrl =
    typeof parsed.apiBaseUrl === "string" && parsed.apiBaseUrl.trim()
      ? migrateBaseUrl(providerId, parsed.apiBaseUrl)
      : (provider?.defaultBaseUrl ?? DEFAULT_AI_SETTINGS.apiBaseUrl);

  const model =
    typeof parsed.model === "string" && parsed.model.trim()
      ? migrateModel(providerId, parsed.model)
      : defaultModelForProvider(providerId) || DEFAULT_AI_SETTINGS.model;

  return {
    ...DEFAULT_AI_SETTINGS,
    ...parsed,
    providerId,
    apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    apiBaseUrl,
    model,
  };
}

export function loadAiSettings(): AiSettings {
  try {
    const raw =
      localStorage.getItem(AI_SETTINGS_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    return normalizeSettings(JSON.parse(raw) as Partial<AiSettings>);
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function cloudAiConfigured(settings: AiSettings): boolean {
  return settings.enabled && !!settings.apiKey.trim();
}

export function applyProviderSwitch(
  settings: AiSettings,
  nextProviderId: string,
): AiSettings {
  const provider = getAiProvider(nextProviderId);
  if (!provider) return settings;
  const nextModel = defaultModelForProvider(nextProviderId) || settings.model;
  return {
    ...settings,
    providerId: nextProviderId,
    apiBaseUrl: provider.defaultBaseUrl,
    model: nextModel,
  };
}
