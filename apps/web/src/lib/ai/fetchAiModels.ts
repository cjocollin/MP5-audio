import type { AiApiStyle, AiModelPreset } from "./aiProviders";

export const AI_MODELS_CACHE_KEY = "mp5-ai-models-cache-v2";
export const PUBLIC_MODELS_URL = "https://models.dev/api.json";

export const MODELS_DEV_PROVIDER_ID: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
  deepseek: "deepseek",
  kimi: "moonshotai",
  zai: "zai",
  mistral: "mistral",
  groq: "groq",
  openrouter: "openrouter",
  xai: "xai",
};
export const AI_MODELS_CACHE_TTL_MS = 30 * 60 * 1000;
const AI_MODELS_CACHE_KEEP_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_PAGES = 5;
const PUBLIC_MEMORY_TTL_MS = 30 * 60 * 1000;

let publicCatalogMemory: { fetchedAt: number; json: unknown } | null = null;

export function resetPublicCatalogMemory(): void {
  publicCatalogMemory = null;
}

const NON_CHAT_MODEL = [
  /embed/i,
  /whisper/i,
  /\btts\b/i,
  /text-to-speech/i,
  /dall-?e/i,
  /imagen/i,
  /image-generation/i,
  /moderation/i,
  /transcribe/i,
  /realtime/i,
  /computer-use/i,
  /\bsora\b/i,
  /\bveo\b/i,
  /\bcodex\b/i,
  /gpt-image/i,
  /-image(?:-|$)/i,
  /imagine/i,
  /aqa/i,
];

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Gemini",
  "x-ai": "Grok",
  xai: "Grok",
  deepseek: "DeepSeek",
  moonshotai: "Kimi",
  moonshot: "Kimi",
  mistralai: "Mistral",
  mistral: "Mistral",
  groq: "Groq",
  qwen: "Qwen",
  meta: "Meta",
  "meta-llama": "Llama",
};

const ACRONYMS = new Set(["gpt", "glm", "oss", "ai", "api", "llm"]);

export interface ListedModel {
  id: string;
  label?: string;
  releasedAt?: string;
}

export interface ModelsCacheEntry {
  fetchedAt: number;
  models: AiModelPreset[];
}

interface ModelsCacheFile {
  v: 1;
  entries: Record<string, ModelsCacheEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function modelsCacheKey(providerId: string, apiBaseUrl: string): string {
  return `${providerId}|${apiBaseUrl.trim().replace(/\/$/, "")}`;
}

export function isChatModelId(modelId: string): boolean {
  const id = modelId.trim();
  if (!id) return false;
  return !NON_CHAT_MODEL.some((pattern) => pattern.test(id));
}

function titleToken(token: string): string {
  const lower = token.toLowerCase();
  if (ACRONYMS.has(lower)) return token.toUpperCase();
  if (/^\d/.test(token)) return token;
  if (lower === "openai") return "OpenAI";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function humanizeModelId(modelId: string): string {
  const trimmed = modelId.trim();
  const slash = trimmed.lastIndexOf("/");
  const prefix = slash >= 0 ? trimmed.slice(0, slash) : "";
  const id = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  const tokens = id.split("-").filter(Boolean).map(titleToken);
  const parts: string[] = [];
  for (const token of tokens) {
    const prev = parts[parts.length - 1];
    if (prev && /^(GPT|GLM)$/i.test(prev) && /^\d/.test(token)) {
      parts[parts.length - 1] = `${prev}-${token}`;
    } else {
      parts.push(token);
    }
  }
  const core = parts.join(" ");
  if (!prefix) return core;
  const providerLabel = PROVIDER_LABELS[prefix.toLowerCase()] ?? prefix.split(/[-.]/).map(titleToken).join(" ");
  return `${providerLabel} ${core}`;
}

export function parseOpenAiStyleModels(json: unknown): ListedModel[] {
  if (!isRecord(json) || !Array.isArray(json.data)) return [];
  const listed: ListedModel[] = [];
  for (const item of json.data) {
    if (!isRecord(item) || typeof item.id !== "string") continue;
    const label = typeof item.name === "string" ? item.name : undefined;
    listed.push({ id: item.id, label });
  }
  return listed;
}

export function parseAnthropicModels(json: unknown): ListedModel[] {
  if (!isRecord(json) || !Array.isArray(json.data)) return [];
  const listed: ListedModel[] = [];
  for (const item of json.data) {
    if (!isRecord(item) || typeof item.id !== "string") continue;
    const label = typeof item.display_name === "string" ? item.display_name : undefined;
    listed.push({ id: item.id, label });
  }
  return listed;
}

export function parseGeminiModels(json: unknown): ListedModel[] {
  if (!isRecord(json) || !Array.isArray(json.models)) return [];
  const listed: ListedModel[] = [];
  for (const item of json.models) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const methods = Array.isArray(item.supportedGenerationMethods)
      ? item.supportedGenerationMethods.filter((m): m is string => typeof m === "string")
      : [];
    if (methods.length > 0 && !methods.includes("generateContent")) continue;
    const id = item.name.replace(/^models\//, "");
    const label = typeof item.displayName === "string" ? item.displayName : undefined;
    listed.push({ id, label });
  }
  return listed;
}

export function parseModelsDevProvider(json: unknown, modelsDevProviderId: string): ListedModel[] {
  if (!isRecord(json)) return [];
  const provider = json[modelsDevProviderId];
  if (!isRecord(provider) || !isRecord(provider.models)) return [];
  const listed: ListedModel[] = [];
  for (const [id, item] of Object.entries(provider.models)) {
    if (!id || id.startsWith("~")) continue;
    if (id.includes(":batch") || id.includes(":floor") || id.includes("@")) continue;
    if (isRecord(item) && item.status === "deprecated") continue;
    const label = isRecord(item) && typeof item.name === "string" ? item.name : undefined;
    const releasedAt =
      isRecord(item) && typeof item.release_date === "string"
        ? item.release_date
        : isRecord(item) && typeof item.last_updated === "string"
          ? item.last_updated
          : undefined;
    listed.push({ id, label, releasedAt });
  }
  return listed;
}

export function mergeListedModels(...groups: ListedModel[][]): ListedModel[] {
  const seen = new Set<string>();
  const out: ListedModel[] = [];
  for (const group of groups) {
    for (const item of group) {
      const id = item.id.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
  }
  return out;
}

export function unionCatalogAndLive(
  catalog: readonly AiModelPreset[],
  live: readonly AiModelPreset[],
): AiModelPreset[] {
  const liveByModel = new Map(live.map((item) => [item.model, item]));
  const result: AiModelPreset[] = [];
  const used = new Set<string>();
  for (const preset of catalog) {
    result.push(liveByModel.get(preset.model) ?? preset);
    used.add(preset.model);
  }
  for (const item of live) {
    if (used.has(item.model)) continue;
    result.push(item);
    used.add(item.model);
  }
  return result;
}

export function presetsFromListedModels(
  listed: ListedModel[],
  catalog: readonly AiModelPreset[],
  maxExtra = 80,
): AiModelPreset[] {
  const catalogByModel = new Map(catalog.map((preset) => [preset.model, preset]));
  const live: AiModelPreset[] = [];
  const seen = new Set<string>();

  for (const item of listed) {
    const id = item.id.trim();
    if (!id || seen.has(id) || !isChatModelId(id)) continue;
    seen.add(id);
    const catalogPreset = catalogByModel.get(id);
    live.push({
      id: catalogPreset?.id ?? id,
      label: catalogPreset?.label ?? item.label ?? humanizeModelId(id),
      model: id,
      hint: catalogPreset?.hint,
    });
  }

  const catalogOrder: AiModelPreset[] = [];
  const used = new Set<string>();
  for (const preset of catalog) {
    const match = live.find((m) => m.model === preset.model);
    if (match) {
      catalogOrder.push(match);
      used.add(match.model);
    }
  }

  const released = new Map(listed.map((item) => [item.id, item.releasedAt ?? ""]));
  const extras = live
    .filter((m) => !used.has(m.model))
    .sort((a, b) => (released.get(b.model) ?? "").localeCompare(released.get(a.model) ?? ""));
  return [...catalogOrder, ...extras.slice(0, maxExtra)];
}

function readCacheFile(): ModelsCacheFile {
  try {
    const raw = localStorage.getItem(AI_MODELS_CACHE_KEY);
    if (!raw) return { v: 1, entries: {} };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.v !== 1 || !isRecord(parsed.entries)) {
      return { v: 1, entries: {} };
    }
    const entries: Record<string, ModelsCacheEntry> = {};
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (!isRecord(value) || typeof value.fetchedAt !== "number" || !Array.isArray(value.models)) {
        continue;
      }
      const models = value.models.filter((item): item is AiModelPreset => {
        return (
          isRecord(item) &&
          typeof item.id === "string" &&
          typeof item.label === "string" &&
          typeof item.model === "string"
        );
      });
      entries[key] = { fetchedAt: value.fetchedAt, models };
    }
    return { v: 1, entries };
  } catch {
    return { v: 1, entries: {} };
  }
}

export function readModelsCache(providerId: string, apiBaseUrl: string): ModelsCacheEntry | null {
  if (typeof localStorage === "undefined") return null;
  const entry = readCacheFile().entries[modelsCacheKey(providerId, apiBaseUrl)];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > AI_MODELS_CACHE_KEEP_MS) return null;
  return entry;
}

export function writeModelsCache(
  providerId: string,
  apiBaseUrl: string,
  models: AiModelPreset[],
  fetchedAt = Date.now(),
): void {
  if (typeof localStorage === "undefined") return;
  const file = readCacheFile();
  const now = Date.now();
  const entries: Record<string, ModelsCacheEntry> = {};
  for (const [key, entry] of Object.entries(file.entries)) {
    if (now - entry.fetchedAt <= AI_MODELS_CACHE_KEEP_MS) entries[key] = entry;
  }
  entries[modelsCacheKey(providerId, apiBaseUrl)] = { fetchedAt, models };
  localStorage.setItem(AI_MODELS_CACHE_KEY, JSON.stringify({ v: 1, entries }));
}

function openAiHeaders(apiKey: string, providerId: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey.trim()}`,
  };
  if (providerId === "openrouter") {
    headers["HTTP-Referer"] = typeof location !== "undefined" ? location.origin : "https://mp5.app";
    headers["X-Title"] = "MP5";
  }
  return headers;
}

function anthropicHeaders(apiKey: string): HeadersInit {
  return {
    "x-api-key": apiKey.trim(),
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Model list failed (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`);
  }
  return res.json();
}

async function listOpenAiStyleModels(
  baseUrl: string,
  apiKey: string,
  providerId: string,
  signal?: AbortSignal,
): Promise<ListedModel[]> {
  const root = baseUrl.replace(/\/$/, "");
  const json = await fetchJson(`${root}/models`, {
    headers: openAiHeaders(apiKey, providerId),
    signal,
  });
  return parseOpenAiStyleModels(json);
}

async function listAnthropicModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ListedModel[]> {
  const root = baseUrl.replace(/\/$/, "");
  const listed: ListedModel[] = [];
  let afterId: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${root}/models`);
    url.searchParams.set("limit", "50");
    if (afterId) url.searchParams.set("after_id", afterId);
    const json = await fetchJson(url.toString(), {
      headers: anthropicHeaders(apiKey),
      signal,
    });
    const pageModels = parseAnthropicModels(json);
    listed.push(...pageModels);
    if (!isRecord(json) || json.has_more !== true || pageModels.length === 0) break;
    afterId = pageModels[pageModels.length - 1]?.id;
    if (!afterId) break;
  }
  return listed;
}

async function listGeminiModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ListedModel[]> {
  let root = baseUrl.replace(/\/$/, "");
  if (root.endsWith("/v1") && !root.endsWith("/v1beta")) {
    root = `${root}beta`;
  }
  const listed: ListedModel[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${root}/models`);
    url.searchParams.set("key", apiKey.trim());
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const json = await fetchJson(url.toString(), { signal });
    listed.push(...parseGeminiModels(json));
    const next = isRecord(json) && typeof json.nextPageToken === "string" ? json.nextPageToken : "";
    if (!next) break;
    pageToken = next;
  }
  return listed;
}

async function loadPublicCatalogJson(signal?: AbortSignal, bypassMemory = false): Promise<unknown> {
  if (!bypassMemory && publicCatalogMemory && Date.now() - publicCatalogMemory.fetchedAt < PUBLIC_MEMORY_TTL_MS) {
    return publicCatalogMemory.json;
  }
  const json = await fetchJson(PUBLIC_MODELS_URL, { signal });
  publicCatalogMemory = { fetchedAt: Date.now(), json };
  return json;
}

async function fetchPublicListedModels(
  providerId: string,
  signal?: AbortSignal,
  bypassMemory = false,
): Promise<ListedModel[]> {
  const modelsDevId = MODELS_DEV_PROVIDER_ID[providerId];
  if (!modelsDevId) return [];
  const json = await loadPublicCatalogJson(signal, bypassMemory);
  return parseModelsDevProvider(json, modelsDevId);
}

async function fetchKeyedListedModels(
  providerId: string,
  apiStyle: AiApiStyle,
  apiBaseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ListedModel[]> {
  if (apiStyle === "anthropic") return listAnthropicModels(apiBaseUrl, apiKey, signal);
  if (apiStyle === "gemini") return listGeminiModels(apiBaseUrl, apiKey, signal);
  return listOpenAiStyleModels(apiBaseUrl, apiKey, providerId, signal);
}

export type LiveModelsResult = {
  models: AiModelPreset[];
  source: "live" | "catalog";
};

export async function fetchLiveProviderModels(options: {
  providerId: string;
  apiStyle: AiApiStyle;
  apiBaseUrl: string;
  apiKey: string;
  catalog: readonly AiModelPreset[];
  signal?: AbortSignal;
  bypassPublicMemory?: boolean;
}): Promise<LiveModelsResult> {
  const key = options.apiKey.trim();
  const publicListed = await fetchPublicListedModels(
    options.providerId,
    options.signal,
    options.bypassPublicMemory,
  ).catch(() => []);

  let keyedListed: ListedModel[] = [];
  if (key) {
    try {
      keyedListed = await fetchKeyedListedModels(
        options.providerId,
        options.apiStyle,
        options.apiBaseUrl,
        key,
        options.signal,
      );
    } catch (error) {
      if (!publicListed.length) throw error;
    }
  }

  const listed = mergeListedModels(keyedListed, publicListed);
  const maxExtra = options.providerId === "openrouter" ? 50 : 150;
  const merged = presetsFromListedModels(listed, options.catalog, maxExtra);
  if (!listed.length) return { models: [...options.catalog], source: "catalog" };
  return { models: merged.length ? merged : [...options.catalog], source: "live" };
}
