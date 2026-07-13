export type AiApiStyle = "openai" | "anthropic" | "gemini";

export interface AiModelPreset {
  id: string;
  label: string;
  model: string;
  hint?: string;
}

export interface AiProviderDefinition {
  id: string;
  label: string;
  apiStyle: AiApiStyle;
  defaultBaseUrl: string;
  apiKeyPlaceholder: string;
  keyHint?: string;
  models: AiModelPreset[];
}

export const AI_MODEL_CUSTOM_ID = "custom";

export const AI_PROVIDERS: AiProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    apiStyle: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyPlaceholder: "sk-...",
    keyHint: "platform.openai.com API keys",
    models: [
      { id: "gpt-5.4-nano", label: "GPT-5.4 nano", model: "gpt-5.4-nano", hint: "Fast, low cost" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini", model: "gpt-5.4-mini", hint: "Fast" },
      { id: "gpt-5.5", label: "GPT-5.5", model: "gpt-5.5" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    apiStyle: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    apiKeyPlaceholder: "sk-ant-...",
    keyHint: "console.anthropic.com",
    models: [
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", model: "claude-haiku-4-5-20251001", hint: "Fast" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", model: "claude-sonnet-4-6" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8", model: "claude-opus-4-8" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    apiStyle: "gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyPlaceholder: "AIza...",
    keyHint: "aistudio.google.com API key",
    models: [
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", model: "gemini-3.1-flash-lite", hint: "Fast, low cost" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", model: "gemini-3.5-flash", hint: "Fast" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", model: "gemini-2.5-flash-lite", hint: "Legacy replacement" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", model: "gemini-2.5-flash", hint: "Legacy replacement" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", model: "gemini-2.5-pro" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiStyle: "openai",
    defaultBaseUrl: "https://api.deepseek.com",
    apiKeyPlaceholder: "sk-...",
    keyHint: "platform.deepseek.com",
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", model: "deepseek-v4-flash", hint: "Fast" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", model: "deepseek-v4-pro", hint: "Reasoning" },
    ],
  },
  {
    id: "kimi",
    label: "Moonshot (Kimi)",
    apiStyle: "openai",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    apiKeyPlaceholder: "sk-...",
    keyHint: "platform.moonshot.ai (use api.moonshot.cn for China)",
    models: [
      { id: "kimi-k2.6", label: "Kimi K2.6", model: "kimi-k2.6" },
      { id: "moonshot-v1-8k", label: "Moonshot v1 8K", model: "moonshot-v1-8k", hint: "Fast" },
      { id: "moonshot-v1-32k", label: "Moonshot v1 32K", model: "moonshot-v1-32k" },
      { id: "moonshot-v1-128k", label: "Moonshot v1 128K", model: "moonshot-v1-128k" },
    ],
  },
  {
    id: "zai",
    label: "Z.AI (GLM)",
    apiStyle: "openai",
    defaultBaseUrl: "https://api.z.ai/api/paas/v4",
    apiKeyPlaceholder: "API key",
    keyHint: "z.ai developer console",
    models: [
      { id: "glm-5.2", label: "GLM-5.2", model: "glm-5.2" },
      { id: "glm-5-turbo", label: "GLM-5 Turbo", model: "glm-5-turbo", hint: "Fast" },
      { id: "glm-5.1", label: "GLM-5.1", model: "glm-5.1" },
      { id: "glm-4.7-flash", label: "GLM-4.7 Flash", model: "glm-4.7-flash", hint: "Fast" },
      { id: "glm-4.7", label: "GLM-4.7", model: "glm-4.7" },
      { id: "glm-4.5-flash", label: "GLM-4.5 Flash", model: "glm-4.5-flash", hint: "Fast" },
      { id: "glm-4.5-air", label: "GLM-4.5 Air", model: "glm-4.5-air" },
    ],
  },
  {
    id: "mistral",
    label: "Mistral AI",
    apiStyle: "openai",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    apiKeyPlaceholder: "API key",
    keyHint: "console.mistral.ai API key",
    models: [
      { id: "ministral-3b-latest", label: "Ministral 3 3B", model: "ministral-3b-latest", hint: "Fast, low cost" },
      { id: "ministral-8b-latest", label: "Ministral 3 8B", model: "ministral-8b-latest", hint: "Fast" },
      { id: "mistral-small-latest", label: "Mistral Small", model: "mistral-small-latest" },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    apiStyle: "openai",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    apiKeyPlaceholder: "gsk_...",
    keyHint: "console.groq.com API key",
    models: [
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", model: "llama-3.1-8b-instant", hint: "Fast, low cost" },
      { id: "openai-gpt-oss-20b", label: "GPT OSS 20B", model: "openai/gpt-oss-20b", hint: "Fast" },
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile", model: "llama-3.3-70b-versatile" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiStyle: "openai",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyPlaceholder: "sk-or-...",
    keyHint: "openrouter.ai API key",
    models: [
      { id: "openrouter-auto", label: "Auto Router", model: "openrouter/auto", hint: "Model-dependent JSON support" },
    ],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    apiStyle: "openai",
    defaultBaseUrl: "https://api.x.ai/v1",
    apiKeyPlaceholder: "xai-...",
    keyHint: "console.x.ai API key",
    models: [
      { id: "grok-4.3", label: "Grok 4.3", model: "grok-4.3" },
    ],
  },
  {
    id: "openai-compatible",
    label: "Other (OpenAI-compatible)",
    apiStyle: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyPlaceholder: "API key",
    keyHint: "Any gateway with /chat/completions",
    models: [],
  },
];

export function getAiProvider(providerId: string): AiProviderDefinition | undefined {
  return AI_PROVIDERS.find((p) => p.id === providerId);
}

export function defaultModelForProvider(providerId: string): string {
  const provider = getAiProvider(providerId);
  if (!provider?.models.length) return "";
  return provider.models[0]!.model;
}

export function modelPresetIdForProvider(providerId: string, model: string): string {
  const provider = getAiProvider(providerId);
  if (!provider) return AI_MODEL_CUSTOM_ID;
  const trimmed = model.trim();
  const match = provider.models.find((p) => p.model === trimmed);
  return match?.id ?? AI_MODEL_CUSTOM_ID;
}

export function modelFromProviderPreset(providerId: string, presetId: string): string | null {
  if (presetId === AI_MODEL_CUSTOM_ID) return null;
  const provider = getAiProvider(providerId);
  return provider?.models.find((p) => p.id === presetId)?.model ?? null;
}

/** Guess provider from saved base URL when migrating older settings. */
export function inferProviderId(apiBaseUrl: string, model: string): string {
  const url = apiBaseUrl.toLowerCase();
  if (url.includes("anthropic.com")) return "anthropic";
  if (url.includes("generativelanguage.googleapis.com")) return "gemini";
  if (url.includes("deepseek.com")) return "deepseek";
  if (url.includes("moonshot")) return "kimi";
  if (url.includes("z.ai") || url.includes("bigmodel.cn")) return "zai";
  if (url.includes("mistral.ai")) return "mistral";
  if (url.includes("groq.com")) return "groq";
  if (url.includes("openrouter.ai")) return "openrouter";
  if (url.includes("x.ai")) return "xai";
  if (url.includes("openai.com")) return "openai";

  for (const provider of AI_PROVIDERS) {
    if (provider.models.some((m) => m.model === model.trim())) return provider.id;
  }
  return "openai-compatible";
}
