import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "./store/playerStore";
import { Mp5Player } from "./player/Mp5Player";
import { ConverterPanel } from "./player/ConverterPanel";
import { WasmSetupBanner } from "./components/WasmSetupBanner";
import { AboutMp5Panel } from "./components/AboutMp5Panel";
import { DemoModePanel } from "./components/DemoModePanel";
import { LocalLibraryPanel } from "./components/LocalLibraryPanel";
import { PerformanceDiagnosticsPanel } from "./components/PerformanceDiagnosticsPanel";
import { BetaFeedbackPanel } from "./components/BetaFeedbackPanel";
import { AiSettingsSection } from "./components/AiSettingsSection";
import { AppShell } from "./components/AppShell";
import { fetchDemoMp5lFixture } from "./lib/demoFixture";
import { dismissOnboarding } from "./lib/firstRun";
import { ingestMp5Files } from "./player/playlistUtils";

export default function App() {
  const {
    activeTab,
    setActiveTab,
    theme,
    setTheme,
    useFileThemes,
    setUseFileThemes,
    tracks,
    appendTracks,
    defaultDemoDismissed,
  } = usePlayerStore();
  const [defaultDemoLoading, setDefaultDemoLoading] = useState(tracks.length === 0);
  const defaultDemoLoadStartedRef = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  useEffect(() => {
    if (tracks.length > 0 || defaultDemoDismissed) {
      setDefaultDemoLoading(false);
      return;
    }
    if (defaultDemoLoadStartedRef.current) {
      setDefaultDemoLoading(false);
      return;
    }

    let mounted = true;
    const timer = window.setTimeout(() => {
      if (defaultDemoLoadStartedRef.current) return;
      defaultDemoLoadStartedRef.current = true;

      void (async () => {
        try {
          const file = await fetchDemoMp5lFixture();
          const current = usePlayerStore.getState();
          if (!file || current.tracks.length > 0 || current.defaultDemoDismissed) return;

          const result = await ingestMp5Files([file]);
          const ready = usePlayerStore.getState();
          if (
            result.tracks.length > 0 &&
            ready.tracks.length === 0 &&
            !ready.defaultDemoDismissed
          ) {
            appendTracks(
              result.tracks.map((track) => ({ ...track, origin: "default-demo" as const })),
            );
            dismissOnboarding();
          }
        } finally {
          if (mounted) setDefaultDemoLoading(false);
        }
      })();
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [appendTracks, defaultDemoDismissed, tracks.length]);

  return (
    <div className="mp5-app-shell">
      <AppShell activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="mb-3">
        <WasmSetupBanner />
      </div>

      <main className="mp5-app-main">
        {activeTab === "player" && <Mp5Player defaultDemoLoading={defaultDemoLoading} />}
        {activeTab === "converter" && <ConverterPanel />}
        {activeTab === "library" && <LocalLibraryPanel />}
        {activeTab === "demo" && <DemoModePanel />}
        {activeTab === "about" && <AboutMp5Panel />}
        {activeTab === "settings" && (
          <div className="mp5-card p-5 sm:p-6 space-y-5">
            <div>
              <p className="mp5-eyebrow">Application</p>
              <h2 className="text-xl font-semibold text-white">Settings</h2>
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-400">Theme</span>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as "dark" | "light")}
                className="bg-surface rounded-lg px-3 py-1.5 border border-white/10 mp5-focus-ring"
                aria-label="Theme"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-4 text-sm" data-testid="use-file-themes-setting">
              <span className="text-gray-400">Apply VISU file themes (Now Playing only)</span>
              <input
                type="checkbox"
                checked={useFileThemes}
                onChange={(e) => setUseFileThemes(e.target.checked)}
                className="rounded border-white/20"
                aria-label="Apply VISU file themes"
              />
            </label>
            <p className="text-xs text-gray-500 leading-relaxed">
              Optional content guidance and visual themes (VISU) tint the active Now Playing card
              only — not the global app shell, tabs, or other panels. They never affect playback.
            </p>
            <div
              className="text-xs text-gray-500 space-y-2 leading-relaxed border border-white/5 rounded-lg p-3"
              data-testid="settings-reliability-note"
            >
              <p>
                <strong className="text-gray-400">Performance & offline:</strong> First visit downloads
                WASM (~90 KB) and FFmpeg (~31 MB) for conversion. Large files and batch queues run
                locally and can be slow. The PWA caches assets after first load; full offline
                conversion of all formats is not guaranteed.
              </p>
              <p>Local library uses browser storage (IndexedDB) on this device only.</p>
            </div>
            <BetaFeedbackPanel />
            <AiSettingsSection />
            <PerformanceDiagnosticsPanel />
          </div>
        )}
      </main>
    </div>
  );
}
