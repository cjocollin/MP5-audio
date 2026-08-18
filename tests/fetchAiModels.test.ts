import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiModelPreset } from "../apps/web/src/lib/ai/aiProviders";
import {
  AI_MODELS_CACHE_KEY,
  fetchLiveProviderModels,
  resetPublicCatalogMemory,
  humanizeModelId,
  isChatModelId,
  parseAnthropicModels,
  parseGeminiModels,
  parseModelsDevProvider,
  parseOpenAiStyleModels,
  presetsFromListedModels,
  readModelsCache,
  writeModelsCache,
} from "../apps/web/src/lib/ai/fetchAiModels";
import { AI_MODEL_CUSTOM_ID, modelFromProviderPreset, modelPresetIdForProvider } from "../apps/web/src/lib/ai/aiSettings";

const GEMINI_CATALOG: AiModelPreset[] = [
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", model: "gemini-3.6-flash", hint: "Fast" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", model: "gemini-2.5-flash", hint: "Legacy" },
];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  return store;
}

describe("live AI model lists", () => {
  afterEach(() => {
    resetPublicCatalogMemory();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("filters non-chat model IDs", () => {
    expect(isChatModelId("gemini-3.6-flash")).toBe(true);
    expect(isChatModelId("claude-sonnet-5")).toBe(true);
    expect(isChatModelId("grok-4.5")).toBe(true);
    expect(isChatModelId("text-embedding-3-small")).toBe(false);
    expect(isChatModelId("whisper-1")).toBe(false);
    expect(isChatModelId("tts-1")).toBe(false);
    expect(isChatModelId("dall-e-3")).toBe(false);
    expect(isChatModelId("omni-moderation-latest")).toBe(false);
  });

  it("humanizes model IDs when the provider has no display name", () => {
    expect(humanizeModelId("gemini-3.6-flash")).toBe("Gemini 3.6 Flash");
    expect(humanizeModelId("gpt-5.6-luna")).toBe("GPT-5.6 Luna");
    expect(humanizeModelId("openai/gpt-5.6-luna")).toBe("OpenAI GPT-5.6 Luna");
    expect(humanizeModelId("grok-4.5")).toBe("Grok 4.5");
  });

  it("parses OpenAI, Anthropic, and Gemini list payloads", () => {
    expect(
      parseOpenAiStyleModels({
        data: [{ id: "gpt-5.6-luna" }, { id: "text-embedding-3-small" }, { id: 1 }],
      }),
    ).toEqual([
      { id: "gpt-5.6-luna" },
      { id: "text-embedding-3-small" },
    ]);

    expect(
      parseAnthropicModels({
        data: [{ id: "claude-sonnet-5", display_name: "Claude Sonnet 5" }],
      }),
    ).toEqual([{ id: "claude-sonnet-5", label: "Claude Sonnet 5" }]);

    expect(
      parseGeminiModels({
        models: [
          {
            name: "models/gemini-3.6-flash",
            displayName: "Gemini 3.6 Flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/text-embedding-004",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
    ).toEqual([{ id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" }]);

    expect(
      parseModelsDevProvider(
        {
          anthropic: {
            models: {
              "claude-opus-5": { name: "Claude Opus 5" },
              "claude-sonnet-5": { name: "Claude Sonnet 5" },
              "~anthropic/claude-opus-latest": { name: "skip alias" },
            },
          },
        },
        "anthropic",
      ).map((m) => m.id),
    ).toEqual(["claude-opus-5", "claude-sonnet-5"]);
  });

  it("keeps catalog labels, drops retired catalog models, and appends new ones", () => {
    const merged = presetsFromListedModels(
      [
        { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (API)" },
        { id: "gemini-3.7-flash" },
        { id: "text-embedding-004" },
      ],
      GEMINI_CATALOG,
    );
    expect(merged.map((m) => m.model)).toEqual(["gemini-3.6-flash", "gemini-3.7-flash"]);
    expect(merged[0]?.label).toBe("Gemini 3.6 Flash");
    expect(merged[0]?.hint).toBe("Fast");
    expect(merged[1]?.label).toBe("Gemini 3.7 Flash");
    expect(merged.some((m) => m.model === "gemini-2.5-flash")).toBe(false);
  });

  it("resolves presets against a live model list", () => {
    const live: AiModelPreset[] = [
      { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", model: "gemini-3.7-flash" },
    ];
    expect(modelPresetIdForProvider("gemini", "gemini-3.7-flash", live)).toBe("gemini-3.7-flash");
    expect(modelFromProviderPreset("gemini", "gemini-3.7-flash", live)).toBe("gemini-3.7-flash");
    expect(modelPresetIdForProvider("gemini", "gemini-9.9-flash")).toBe(AI_MODEL_CUSTOM_ID);
  });

  it("fetches Gemini models and merges them with the catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        models: [
          {
            name: "models/gemini-3.6-flash",
            displayName: "Gemini 3.6 Flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-3.7-pro",
            displayName: "Gemini 3.7 Pro",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLiveProviderModels({
      providerId: "gemini",
      apiStyle: "gemini",
      apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "AIza-test",
      catalog: GEMINI_CATALOG,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requested = String(fetchMock.mock.calls[1]?.[0]);
    expect(requested).toContain("/models");
    expect(requested).toContain("key=AIza-test");
    expect(result.models.map((m) => m.model)).toEqual(["gemini-3.6-flash", "gemini-3.7-pro"]);
    expect(result.models[0]?.hint).toBe("Fast");
  });

  it("sends Anthropic browser-access headers when listing Claude models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ id: "claude-sonnet-5", display_name: "Claude Sonnet 5" }],
        has_more: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLiveProviderModels({
      providerId: "anthropic",
      apiStyle: "anthropic",
      apiBaseUrl: "https://api.anthropic.com/v1",
      apiKey: "sk-ant-test",
      catalog: [{ id: "claude-sonnet-5", label: "Claude Sonnet 5", model: "claude-sonnet-5" }],
    });

    const headers = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(result.models[0]?.model).toBe("claude-sonnet-5");
  });

  it("loads Claude Opus 5 from the public catalog without an API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        anthropic: {
          models: {
            "claude-opus-5": { name: "Claude Opus 5" },
            "claude-sonnet-5": { name: "Claude Sonnet 5" },
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLiveProviderModels({
      providerId: "anthropic",
      apiStyle: "anthropic",
      apiBaseUrl: "https://api.anthropic.com/v1",
      apiKey: "",
      catalog: [
        { id: "claude-sonnet-5", label: "Claude Sonnet 5", model: "claude-sonnet-5" },
        { id: "claude-opus-5", label: "Claude Opus 5", model: "claude-opus-5", hint: "Flagship" },
      ],
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("models.dev");
    expect(result.models.map((m) => m.model)).toEqual(["claude-sonnet-5", "claude-opus-5"]);
    expect(result.models.find((m) => m.model === "claude-opus-5")?.hint).toBe("Flagship");
  });

  it("falls back to the catalog when the provider list is empty or the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [] })));
    const emptyResult = await fetchLiveProviderModels({
      providerId: "xai",
      apiStyle: "openai",
      apiBaseUrl: "https://api.x.ai/v1",
      apiKey: "xai-test",
      catalog: [{ id: "grok-4.5", label: "Grok 4.5", model: "grok-4.5" }],
    });
    expect(emptyResult.models.map((m) => m.model)).toEqual(["grok-4.5"]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 401)));
    await expect(
      fetchLiveProviderModels({
        providerId: "xai",
        apiStyle: "openai",
        apiBaseUrl: "https://api.x.ai/v1",
        apiKey: "xai-test",
        catalog: [{ id: "grok-4.5", label: "Grok 4.5", model: "grok-4.5" }],
      }),
    ).rejects.toThrow(/Model list failed \(401\)/);
  });


  it("shows a public-catalog model that is not in the built-in list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        google: {
          models: {
            "gemini-3.6-flash": { name: "Gemini 3.6 Flash", release_date: "2026-07-21" },
            "gemini-3.7-flash": { name: "Gemini 3.7 Flash", release_date: "2026-08-13" },
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLiveProviderModels({
      providerId: "gemini",
      apiStyle: "gemini",
      apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "",
      catalog: [{ id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", model: "gemini-3.6-flash" }],
    });

    expect(result.source).toBe("live");
    expect(result.models.map((m) => m.model)).toEqual(["gemini-3.6-flash", "gemini-3.7-flash"]);
  });
  it("caches fetched model lists in localStorage", () => {
    stubLocalStorage();
    const models: AiModelPreset[] = [{ id: "grok-4.6", label: "Grok 4.6", model: "grok-4.6" }];
    writeModelsCache("xai", "https://api.x.ai/v1", models);
    const cached = readModelsCache("xai", "https://api.x.ai/v1/");
    expect(cached?.models).toEqual(models);
    expect(localStorage.getItem(AI_MODELS_CACHE_KEY)).toContain("grok-4.6");
  });
});
