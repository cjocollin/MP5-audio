import { useEffect, useMemo, useState } from "react";
import {
  AI_MODEL_CUSTOM_ID,
  AI_PROVIDERS,
  applyProviderSwitch,
  DEFAULT_AI_SETTINGS,
  getAiProvider,
  loadAiSettings,
  modelFromProviderPreset,
  modelPresetIdForProvider,
  saveAiSettings,
  type AiModelPreset,
  type AiSettings,
} from "../lib/ai/aiSettings";
import { unionCatalogAndLive } from "../lib/ai/fetchAiModels";
import { useLiveAiModels } from "../lib/ai/useLiveAiModels";

const EMPTY_AI_MODELS: AiModelPreset[] = [];

export function AiSettingsSection() {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [saved, setSaved] = useState(false);

  const provider = useMemo(() => getAiProvider(settings.providerId), [settings.providerId]);
  const catalog = provider?.models ?? EMPTY_AI_MODELS;
  const { models: fetchedModels, status, refreshing, refresh } = useLiveAiModels({
    providerId: settings.providerId,
    apiStyle: provider?.apiStyle ?? "openai",
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    catalog,
  });
  const models = useMemo(
    () => unionCatalogAndLive(catalog, fetchedModels),
    [catalog, fetchedModels],
  );
  const modelPresetId = useMemo(
    () => modelPresetIdForProvider(settings.providerId, settings.model, models),
    [settings.providerId, settings.model, models],
  );
  const selectedPreset = models.find((p) => p.id === modelPresetId);
  const showCustomModel = modelPresetId === AI_MODEL_CUSTOM_ID || !models.length;

  useEffect(() => {
    saveAiSettings(settings);
    setSaved(true);
    const t = window.setTimeout(() => setSaved(false), 1500);
    return () => window.clearTimeout(t);
  }, [settings]);

  return (
    <div className="space-y-3 border-t border-white/5 pt-4" data-testid="ai-settings-section">
      <div>
        <h3 className="text-sm font-medium text-gray-200">AI metadata suggestions</h3>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Optional, user-reviewed metadata only. No AI stem separation. API keys stay in this browser.
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-400">Enable AI suggestions</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
          className="rounded border-white/20"
          data-testid="ai-settings-enabled"
        />
      </label>

      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide pt-1">Artwork theme (VISU)</p>
      <div className="flex items-center justify-between gap-4 text-sm" data-testid="ai-settings-cover-palette">
        <span className="text-gray-400">Local cover palette</span>
        <span className="text-[10px] text-emerald-300">On-device</span>
      </div>
      <p className="text-[10px] text-gray-600 -mt-2">
        When cover art is present, Analyze with AI suggests theme colors locally. Artwork is never uploaded and the
        palette must be accepted before export.
      </p>

      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide pt-1">Tempo (BPM)</p>

      <label className="flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-400">Local BPM analysis</span>
        <input
          type="checkbox"
          checked={settings.localBeat}
          onChange={(e) => setSettings((s) => ({ ...s, localBeat: e.target.checked }))}
          className="rounded border-white/20"
          data-testid="ai-settings-local-beat"
        />
      </label>

      <label className="flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-400">Cloud BPM analysis</span>
        <input
          type="checkbox"
          checked={settings.cloudBeat}
          onChange={(e) => setSettings((s) => ({ ...s, cloudBeat: e.target.checked }))}
          className="rounded border-white/20"
          data-testid="ai-settings-cloud-beat"
        />
      </label>
      <p className="text-[10px] text-gray-600 -mt-2">
        Sends a ~30s audio clip to your provider (Gemini/OpenAI audio models). Includes musical key when enabled.
        Uses API credits.
      </p>

      <label className="flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-400">Cloud song structure (SECT)</span>
        <input
          type="checkbox"
          checked={settings.cloudStructure}
          onChange={(e) => setSettings((s) => ({ ...s, cloudStructure: e.target.checked }))}
          className="rounded border-white/20"
          data-testid="ai-settings-cloud-structure"
        />
      </label>
      <p className="text-[10px] text-gray-600 -mt-2">
        Section markers (intro, verse, chorus…). Scans the full track in ~90s segments (multiple API calls).
      </p>

      <label className="flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-400">Cloud lyrics transcription (LYRC)</span>
        <input
          type="checkbox"
          checked={settings.cloudLyrics}
          onChange={(e) => setSettings((s) => ({ ...s, cloudLyrics: e.target.checked }))}
          className="rounded border-white/20"
          data-testid="ai-settings-cloud-lyrics"
        />
      </label>
      <p className="text-[10px] text-gray-600 -mt-2">
        Verbatim vocal transcription from audio — requires Gemini or OpenAI (not Claude/DeepSeek). Often wrong on
        dense mixes; always review before export.
      </p>

      <label className="flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-400">Cloud content warnings (EXPL / SAFE)</span>
        <input
          type="checkbox"
          checked={settings.cloudContentWarnings}
          onChange={(e) => setSettings((s) => ({ ...s, cloudContentWarnings: e.target.checked }))}
          className="rounded border-white/20"
          data-testid="ai-settings-cloud-warnings"
        />
      </label>

      <label className="flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-400">Cloud mood & vibe tags</span>
        <input
          type="checkbox"
          checked={settings.cloudMoodVibe}
          onChange={(e) => setSettings((s) => ({ ...s, cloudMoodVibe: e.target.checked }))}
          className="rounded border-white/20"
          data-testid="ai-settings-cloud-mood"
        />
      </label>

      <label className="flex items-center justify-between gap-4 text-sm">
        <span className="text-gray-400">Cloud track summary</span>
        <input
          type="checkbox"
          checked={settings.cloudSummary}
          onChange={(e) => setSettings((s) => ({ ...s, cloudSummary: e.target.checked }))}
          className="rounded border-white/20"
          data-testid="ai-settings-cloud-summary"
        />
      </label>

      <div className="block text-sm space-y-1">
        <label className="text-gray-400" htmlFor="ai-settings-provider">
          AI provider
        </label>
        <select
          id="ai-settings-provider"
          value={settings.providerId}
          onChange={(e) => setSettings((s) => applyProviderSwitch(s, e.target.value))}
          className="w-full bg-surface rounded-lg px-3 py-2 border border-white/10 text-sm mp5-focus-ring"
          data-testid="ai-settings-provider"
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {provider?.keyHint && (
          <p className="text-[10px] text-gray-600" data-testid="ai-settings-provider-hint">
            Keys from {provider.keyHint}
          </p>
        )}
      </div>

      <label className="block text-sm space-y-1">
        <span className="text-gray-400">API key (BYOK)</span>
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))}
          placeholder={provider?.apiKeyPlaceholder ?? "API key"}
          autoComplete="off"
          className="w-full bg-surface rounded-lg px-3 py-2 border border-white/10 text-sm mp5-focus-ring"
          data-testid="ai-settings-api-key"
        />
      </label>

      <label className="block text-sm space-y-1">
        <span className="text-gray-400">API base URL</span>
        <input
          type="url"
          value={settings.apiBaseUrl}
          onChange={(e) => setSettings((s) => ({ ...s, apiBaseUrl: e.target.value.replace(/\/$/, "") }))}
          className="w-full bg-surface rounded-lg px-3 py-2 border border-white/10 text-sm mp5-focus-ring font-mono text-xs"
          data-testid="ai-settings-api-base"
        />
      </label>

      <div className="block text-sm space-y-1">
        <label className="text-gray-400" htmlFor="ai-settings-model-preset">
          Model
        </label>
        {models.length ? (
          <select
            id="ai-settings-model-preset"
            value={modelPresetId}
            onChange={(e) => {
              const presetId = e.target.value;
              const presetModel = modelFromProviderPreset(settings.providerId, presetId, models);
              setSettings((s) => ({
                ...s,
                model: presetModel ?? s.model,
              }));
            }}
            className="w-full bg-surface rounded-lg px-3 py-2 border border-white/10 text-sm mp5-focus-ring"
            data-testid="ai-settings-model-preset"
          >
            {models.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
                {preset.hint ? ` - ${preset.hint}` : ""}
              </option>
            ))}
            <option value={AI_MODEL_CUSTOM_ID}>Custom model ID...</option>
          </select>
        ) : (
          <p className="text-[10px] text-gray-600">Enter a model ID for your OpenAI-compatible gateway.</p>
        )}
        <p className="text-[10px] text-gray-600" data-testid="ai-settings-model-refresh">
          {refreshing
            ? "Refreshing latest models…"
            : status === "live"
              ? "Updated automatically"
              : status === "cached"
                ? "Using recently fetched models"
                : status === "error"
                  ? "Couldn't refresh — showing built-in list"
                  : "Loading the latest models…"}
          {" · "}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="text-gray-500 hover:text-gray-300 disabled:opacity-50"
            data-testid="ai-settings-model-refresh-btn"
          >
            Refresh
          </button>
        </p>
        {selectedPreset?.hint && !showCustomModel && (
          <p className="text-[10px] text-gray-600" data-testid="ai-settings-model-hint">
            {selectedPreset.hint}
          </p>
        )}
        {showCustomModel && (
          <input
            type="text"
            value={settings.model}
            onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
            placeholder="model-id"
            className="w-full bg-surface rounded-lg px-3 py-2 border border-white/10 text-sm mp5-focus-ring mt-1 font-mono text-xs"
            data-testid="ai-settings-model-custom"
            aria-label="Custom model ID"
          />
        )}
        {!showCustomModel && (
          <p className="text-[10px] text-gray-600 font-mono" data-testid="ai-settings-model-value">
            {settings.model}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSettings({ ...DEFAULT_AI_SETTINGS })}
          className="text-xs text-gray-500 hover:text-gray-300"
          data-testid="ai-settings-reset"
        >
          Reset AI settings
        </button>
        {saved && (
          <span className="text-[10px] text-green-400/90" data-testid="ai-settings-saved">
            Saved locally
          </span>
        )}
      </div>
    </div>
  );
}
