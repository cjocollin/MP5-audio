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
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", model: "gpt-5.6-luna", hint: "Fast, low cost" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", model: "gpt-5.6-terra", hint: "Balanced" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", model: "gpt-5.6-sol", hint: "Flagship" },
      { id: "gpt-5.5", label: "GPT-5.5", model: "gpt-5.5", hint: "Previous flagship" },
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
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", model: "claude-sonnet-5" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8", model: "claude-opus-4-8" },
      { id: "claude-fable-5", label: "Claude Fable 5", model: "claude-fable-5", hint: "Frontier" },
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
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", model: "gemini-3.6-flash", hint: "Fast" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", model: "gemini-3.5-flash", hint: "Previous" },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", model: "gemini-3.1-pro-preview", hint: "Preview" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", model: "gemini-2.5-flash", hint: "Legacy" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", model: "gemini-2.5-pro", hint: "Legacy" },
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
    keyHint: "platform.moonshot.ai / platform.kimi.ai (use api.moonshot.cn for China)",
    models: [
      { id: "kimi-k3", label: "Kimi K3", model: "kimi-k3", hint: "Flagship" },
      { id: "kimi-k2.7-code", label: "Kimi K2.7 Code", model: "kimi-k2.7-code", hint: "Coding" },
      {
        id: "kimi-k2.7-code-highspeed",
        label: "Kimi K2.7 Code Highspeed",
        model: "kimi-k2.7-code-highspeed",
        hint: "Fast coding",
      },
      { id: "kimi-k2.6", label: "Kimi K2.6", model: "kimi-k2.6", hint: "Previous" },
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
      { id: "glm-4.7-flash", label: "GLM-4.7 Flash", model: "glm-4.7-flash", hint: "Fast, low cost" },
      { id: "glm-4.7", label: "GLM-4.7", model: "glm-4.7" },
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
      { id: "ministral-14b-latest", label: "Ministral 3 14B", model: "ministral-14b-latest" },
      { id: "mistral-small-latest", label: "Mistral Small", model: "mistral-small-latest" },
      { id: "mistral-medium-latest", label: "Mistral Medium", model: "mistral-medium-latest" },
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
      { id: "openai-gpt-oss-20b", label: "GPT OSS 20B", model: "openai/gpt-oss-20b", hint: "Fast, low cost" },
      { id: "openai-gpt-oss-120b", label: "GPT OSS 120B", model: "openai/gpt-oss-120b" },
      { id: "qwen-qwen3.6-27b", label: "Qwen3.6 27B", model: "qwen/qwen3.6-27b" },
      {
        id: "llama-3.1-8b-instant",
        label: "Llama 3.1 8B Instant",
        model: "llama-3.1-8b-instant",
        hint: "Legacy / retiring",
      },
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
      { id: "or-gpt-5.6-luna", label: "OpenAI GPT-5.6 Luna", model: "openai/gpt-5.6-luna", hint: "Fast, low cost" },
      { id: "or-claude-sonnet-5", label: "Claude Sonnet 5", model: "anthropic/claude-sonnet-5" },
      { id: "or-gemini-3.6-flash", label: "Gemini 3.6 Flash", model: "google/gemini-3.6-flash", hint: "Fast" },
      { id: "or-gemini-3.5-flash", label: "Gemini 3.5 Flash", model: "google/gemini-3.5-flash", hint: "Previous" },
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
      { id: "grok-4.3", label: "Grok 4.3", model: "grok-4.3", hint: "Balanced" },
      { id: "grok-4.5", label: "Grok 4.5", model: "grok-4.5", hint: "Flagship" },
      {
        id: "grok-4.20-0309-reasoning",
        label: "Grok 4.20 Reasoning",
        model: "grok-4.20-0309-reasoning",
        hint: "Deep reasoning",
      },
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
  if (url.includes("moonshot") || url.includes("kimi.ai")) return "kimi";
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
