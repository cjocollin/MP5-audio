# MP5 AI provider audit - ChatGPT prompt

Copy everything inside the fenced block below and paste it into ChatGPT (or another research assistant). Ask it to browse official docs where possible and cite sources.

---

## Prompt (copy from here)

```
You are auditing the AI provider and model registry for MP5, an experimental browser-based audio app. Cloud AI is used only for optional, user-reviewed metadata suggestions (mood tags, vibe tags, one-line track summaries) during audio conversion. Users bring their own API keys (BYOK); nothing is proxied through our servers.

Your job:
1. Verify every provider base URL, API style, and model ID below against OFFICIAL documentation (as of today).
2. Flag anything deprecated, renamed, preview-only, or region-specific (e.g. China vs global endpoints).
3. Suggest additional models worth adding per provider (prioritize: fast/cheap for metadata JSON, still capable).
4. Suggest any major providers we are missing that fit the same BYOK + browser fetch pattern.
5. Note API quirks that affect our integration (JSON mode, auth headers, endpoint paths).

## How MP5 calls each API style

### apiStyle: "openai"
- POST `{baseUrl}/chat/completions`
- Header: `Authorization: Bearer {apiKey}`
- Body includes: `model`, `temperature: 0.3`, `response_format: { type: "json_object" }`, `messages` (system + user)
- Used by: OpenAI, DeepSeek, Kimi/Moonshot, Z.AI/GLM, and generic OpenAI-compatible gateways

### apiStyle: "anthropic"
- POST `{baseUrl}/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`
- Body: `model`, `max_tokens`, `system`, `messages` (user only)
- Response JSON is parsed from `content[0].text` (not guaranteed JSON mode - we extract JSON from text)

### apiStyle: "gemini"
- POST `{baseUrl}/models/{model}:generateContent?key={apiKey}`
- Body: `systemInstruction`, `contents`, `generationConfig.responseMimeType: "application/json"`
- Response JSON is parsed from `candidates[0].content.parts[0].text`

## Current provider registry (verify and correct)

### openai - OpenAI (ChatGPT)
- defaultBaseUrl: https://api.openai.com/v1
- apiStyle: openai
- models:
  - gpt-5.6-luna (default, fast/low cost)
  - gpt-5.6-terra
  - gpt-5.6-sol
  - gpt-5.5

### anthropic - Anthropic (Claude)
- defaultBaseUrl: https://api.anthropic.com/v1
- apiStyle: anthropic
- models:
  - claude-haiku-4-5-20251001
  - claude-sonnet-5
  - claude-opus-4-8
  - claude-fable-5

### gemini - Google Gemini
- defaultBaseUrl: https://generativelanguage.googleapis.com/v1beta
- apiStyle: gemini
- models:
  - gemini-3.1-flash-lite (default, fast/low cost)
  - gemini-3.5-flash
  - gemini-3.1-pro-preview
  - gemini-2.5-flash (legacy)
  - gemini-2.5-pro (legacy)

### deepseek - DeepSeek
- defaultBaseUrl: https://api.deepseek.com
- apiStyle: openai
- models:
  - deepseek-v4-flash
  - deepseek-v4-pro

### kimi - Moonshot (Kimi)
- defaultBaseUrl: https://api.moonshot.ai/v1
- apiStyle: openai
- note: China users may need https://api.moonshot.cn/v1
- models:
  - kimi-k3
  - kimi-k2.7-code
  - kimi-k2.7-code-highspeed
  - kimi-k2.6

### zai - Z.AI (GLM)
- defaultBaseUrl: https://api.z.ai/api/paas/v4
- apiStyle: openai
- note: older docs reference open.bigmodel.cn - confirm which base URL is current for international vs China
- models:
  - glm-5.2
  - glm-5-turbo
  - glm-5.1
  - glm-4.7-flash
  - glm-4.7

### openai-compatible - Other (OpenAI-compatible)
- defaultBaseUrl: https://api.openai.com/v1 (placeholder)
- apiStyle: openai
- models: none (user enters custom model ID)

## Output format (use this structure)

### Executive summary
- 3-5 bullets: overall health of our registry, biggest gaps, highest-priority fixes

### Per-provider audit table
For each provider, a markdown table with columns:
| Field | Current value | Correct value (if wrong) | Source URL | Notes |

Fields to check: defaultBaseUrl, apiStyle, each model ID (exact string), deprecated?, replacement model

### Recommended additions
#### New models to add (by provider)
- provider id
- model id (exact API string)
- display label
- hint (optional: "Fast", "Reasoning", etc.)
- why include it

#### New providers to consider
- suggested id (lowercase slug)
- label
- apiStyle (openai | anthropic | gemini)
- defaultBaseUrl
- keyHint
- starter model list (3-6 models)
- does it support JSON / structured output for our use case?

### Integration warnings
- Models or providers where `response_format: json_object` is NOT supported (OpenAI-style)
- Models that require different auth (e.g. Azure OpenAI, Vertex AI) - note if they cannot work with simple browser BYOK fetch
- Rate limits or CORS issues likely to block browser-side calls (if documented)

### Corrected registry snippet
Provide an updated TypeScript-friendly list I can paste into `apps/web/src/lib/ai/aiProviders.ts`:
- Keep the same shape: `{ id, label, apiStyle, defaultBaseUrl, apiKeyPlaceholder, keyHint?, models: [{ id, label, model, hint? }] }`
- Only include models you are confident exist in official docs today
- Mark uncertain model IDs with `// VERIFY` comment

## Constraints (do not suggest violating these)
- No server-side proxy; must work with user API key + fetch from browser
- Task is lightweight metadata JSON, not audio analysis or stem separation
- Prefer stable model IDs over chat UI marketing names
- If a model is preview/deprecated, say so and give the stable replacement

Please search official docs for OpenAI, Anthropic, Google AI Studio/Gemini, DeepSeek, Moonshot/Kimi, and Z.AI/GLM before answering.
```

---

## After you get a response

1. Review the **Integration warnings** section first (browser BYOK + JSON output).
2. Compare the **Corrected registry snippet** against [`apps/web/src/lib/ai/aiProviders.ts`](../apps/web/src/lib/ai/aiProviders.ts).
3. If a provider needs a new `apiStyle`, also update [`apps/web/src/lib/ai/providers/cloudAdapters.ts`](../apps/web/src/lib/ai/providers/cloudAdapters.ts).
4. Re-run tests: `pnpm exec vitest run tests/metadataMvp.test.ts -t "AI model"`
