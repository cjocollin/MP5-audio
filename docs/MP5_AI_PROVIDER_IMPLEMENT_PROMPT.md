# MP5 AI provider audit - implementation prompt

Use this **after** you have ChatGPT audit results (from `MP5_AI_PROVIDER_AUDIT_PROMPT.md`).

1. Paste your audit output into the **Audit findings** section below.
2. Copy the entire fenced prompt block into ChatGPT (or Cursor) to implement the changes in the MP5 repo.

---

## Audit findings (paste below before copying the prompt)

<!-- Paste ChatGPT audit output here: corrected registry, per-provider tables, integration warnings, new providers, etc. -->

---

## Prompt (copy from here)

```
You are implementing AI provider registry updates in the MP5 monorepo based on an audit of our cloud metadata integration. MP5 is a browser PWA; cloud AI is BYOK only (user API key in localStorage), used for optional mood/vibe/summary metadata during audio conversion. No server proxy. No AI stem separation.

## Your task

Apply the **Audit findings** pasted above to the codebase. Make the registry accurate per official docs, add recommended models/providers, fix wrong base URLs or model IDs, and handle integration warnings (e.g. JSON mode fallbacks) with minimal scope.

## Files you may change

Primary:
- apps/web/src/lib/ai/aiProviders.ts - AI_PROVIDERS array, inferProviderId()
- apps/web/src/lib/ai/aiSettings.ts - DEFAULT_AI_SETTINGS, applyProviderSwitch(), loadAiSettings() migration if needed
- apps/web/src/lib/ai/providers/cloudAdapters.ts - only if apiStyle behavior must change (openai | anthropic | gemini)
- apps/web/src/lib/ai/providers/cloudMetadata.ts - only if routing or error handling needs updates

UI (only if new providers need copy tweaks):
- apps/web/src/components/AiSettingsSection.tsx

Tests (update or add as needed):
- tests/metadataMvp.test.ts - AI model preset / applyProviderSwitch tests

Docs (brief updates only if behavior changes):
- docs/AI_METADATA_SPEC.md
- docs/MP5_LIMITATIONS.md

## Data shapes (must match)

    export type AiApiStyle = "openai" | "anthropic" | "gemini";
    export interface AiModelPreset { id: string; label: string; model: string; hint?: string; }
    export interface AiProviderDefinition {
      id: string; label: string; apiStyle: AiApiStyle; defaultBaseUrl: string;
      apiKeyPlaceholder: string; keyHint?: string; models: AiModelPreset[];
    }

## API routing (do not break)

- apiStyle "openai" -> POST {baseUrl}/chat/completions, Bearer auth, response_format json_object
- apiStyle "anthropic" -> POST {baseUrl}/messages, x-api-key + anthropic-version 2023-06-01
- apiStyle "gemini" -> POST {baseUrl}/models/{model}:generateContent?key=..., responseMimeType application/json

If audit says a provider is OpenAI-compatible, use apiStyle "openai" even if the vendor is not OpenAI.

## Implementation rules

1. Prefer editing aiProviders.ts - add/remove/rename models and providers; keep ids stable when possible.
2. Update inferProviderId() when adding providers so saved settings migrate correctly from base URL.
3. Default model for each provider = first entry in models[] (used by applyProviderSwitch).
4. Remove deprecated models only if audit cites official deprecation; add replacement with hint noting swap.
5. New apiStyle - only add a fourth style if audit proves openai/anthropic/gemini cannot work; implement adapter in cloudAdapters.ts and wire in cloudMetadata.ts.
6. JSON output - if a model lacks native JSON mode, add a safe fallback in the adapter (extract JSON from text).
7. Do not add server routes, env secrets, or npm packages unless absolutely required.
8. Keep UTF-8 encoding in all source files.

## Tests to run after changes

pnpm --filter @mp5/web lint
pnpm exec vitest run tests/metadataMvp.test.ts -t "AI model"
pnpm exec vitest run tests/metadataMvp.test.ts -t "applyProviderSwitch"
pnpm exec vitest run tests/betaReadiness.test.ts

Update tests when default model, provider id, or preset ids change.

## Output format

### 1. Change summary
Bullet list: what changed and why (per audit item).

### 2. File-by-file patches
Complete updated files OR unified diffs. Prefer complete aiProviders.ts if many models changed.

### 3. Migration notes
Notes for users with saved localStorage settings (mp5-ai-settings-v2).

### 4. Risks / VERIFY items
Model IDs not confirmed in official docs.

### 5. Test commands
Commands run and pass/fail results.

## Constraints

- BYOK browser-only; no hosted AI proxy
- Opt-in AI suggestions; user reviews before export
- No AI stem separation
- Minimal diff; no unrelated refactors
- Match existing TypeScript/React style

## Audit findings to implement

[PASTE THE FULL AUDIT OUTPUT HERE - Corrected registry snippet, Integration warnings, Recommended additions]

Implement now.
```

---

## Tips

- Treat the audit **Corrected registry snippet** as source of truth for `AI_PROVIDERS`.
- Prefer stable model IDs over preview names; list preview models with hint "Preview".
- For China/global URL splits (Kimi, Z.AI), keep global URL as default; note alternate in keyHint.
