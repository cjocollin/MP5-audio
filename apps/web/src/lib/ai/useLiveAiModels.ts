import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiApiStyle, AiModelPreset } from "./aiProviders";
import {
  fetchLiveProviderModels,
  readModelsCache,
  writeModelsCache,
} from "./fetchAiModels";

export type LiveModelsStatus = "catalog" | "cached" | "loading" | "live" | "error";

export function useLiveAiModels(options: {
  providerId: string;
  apiStyle: AiApiStyle;
  apiBaseUrl: string;
  apiKey: string;
  catalog: readonly AiModelPreset[];
}): {
  models: AiModelPreset[];
  status: LiveModelsStatus;
  refreshing: boolean;
  refresh: () => void;
} {
  const { providerId, apiStyle, apiBaseUrl, apiKey, catalog } = options;
  const catalogModels = useMemo(() => [...catalog], [catalog]);
  const [debouncedKey, setDebouncedKey] = useState(apiKey);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [liveModels, setLiveModels] = useState<AiModelPreset[] | null>(null);
  const [status, setStatus] = useState<LiveModelsStatus>("catalog");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKey(apiKey), 500);
    return () => window.clearTimeout(timer);
  }, [apiKey]);

  useEffect(() => {
    const key = debouncedKey.trim();
    const cached = readModelsCache(providerId, apiBaseUrl);
    if (cached?.models.length) {
      setLiveModels(cached.models);
      setStatus("cached");
    } else {
      setLiveModels(null);
      setStatus("loading");
    }

    const controller = new AbortController();
    setRefreshing(true);
    void fetchLiveProviderModels({
      providerId,
      apiStyle,
      apiBaseUrl,
      apiKey: key,
      catalog: catalogModels,
      signal: controller.signal,
      bypassPublicMemory: refreshNonce > 0,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.source === "live") {
          writeModelsCache(providerId, apiBaseUrl, result.models);
          setLiveModels(result.models);
          setStatus("live");
          return;
        }
        setStatus(cached?.models.length ? "cached" : "catalog");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus(cached?.models.length ? "cached" : "error");
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });

    return () => controller.abort();
  }, [providerId, apiStyle, apiBaseUrl, debouncedKey, catalogModels, refreshNonce]);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  return {
    models: liveModels ?? catalogModels,
    status,
    refreshing,
    refresh,
  };
}
