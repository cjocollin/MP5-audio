import { Suspense, lazy, useEffect } from "react";
import { usePlayerStore } from "./store/playerStore";
import { Mp5Player } from "./player/Mp5Player";
import { WasmSetupBanner } from "./components/WasmSetupBanner";
import { AppShell } from "./components/AppShell";
import { WelcomeOnboarding } from "./components/WelcomeOnboarding";

const ConverterPanel = lazy(() =>
  import("./player/ConverterPanel").then((m) => ({ default: m.ConverterPanel })),
);
const LocalLibraryPanel = lazy(() =>
  import("./components/LocalLibraryPanel").then((m) => ({ default: m.LocalLibraryPanel })),
);
const DemoModePanel = lazy(() =>
  import("./components/DemoModePanel").then((m) => ({ default: m.DemoModePanel })),
);
const AboutMp5Panel = lazy(() =>
  import("./components/AboutMp5Panel").then((m) => ({ default: m.AboutMp5Panel })),
);
const PerformanceDiagnosticsPanel = lazy(() =>
  import("./components/PerformanceDiagnosticsPanel").then((m) => ({
    default: m.PerformanceDiagnosticsPanel,
  })),
);
const BetaFeedbackPanel = lazy(() =>
  import("./components/BetaFeedbackPanel").then((m) => ({ default: m.BetaFeedbackPanel })),
);
const AiSettingsSection = lazy(() =>
  import("./components/AiSettingsSection").then((m) => ({ default: m.AiSettingsSection })),
);

function PanelFallback() {
  return (
    <div className="mp5-card p-5 sm:p-6 text-sm text-gray-500" data-testid="panel-loading">
      Loading…
    </div>
  );
}

export default function App() {
  const activeTab = usePlayerStore((s) => s.activeTab);
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);
  const theme = usePlayerStore((s) => s.theme);
  const setTheme = usePlayerStore((s) => s.setTheme);
  const useFileThemes = usePlayerStore((s) => s.useFileThemes);
  const setUseFileThemes = usePlayerStore((s) => s.setUseFileThemes);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  // Tab switches via store (e.g. Open in Player) bypass AppShell; always land at top.
  useEffect(() => {
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo({ top: 0, left: 0 });
    // After paint in case the new panel changes document height.
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0 });
      root.style.scrollBehavior = previousScrollBehavior;
    });
    return () => {
      window.cancelAnimationFrame(frame);
      root.style.scrollBehavior = previousScrollBehavior;
    };
  }, [activeTab]);

  return (
    <div className="mp5-app-shell">
      <AppShell activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="mb-3">
        <WasmSetupBanner />
      </div>

      <main className="mp5-app-main">
        <WelcomeOnboarding />
        <Mp5Player
          panelVisible={activeTab === "player"}
          onRequestPlayer={() => setActiveTab("player")}
        />
        <Suspense fallback={<PanelFallback />}>
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
              <p className="text-xs text-gray-500 leading-relaxed" data-testid="settings-demo-tab-link">
                Load synthetic demos on the{" "}
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => setActiveTab("demo")}
                >
                  Demo
                </button>{" "}
                tab.
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
        </Suspense>
      </main>
    </div>
  );
}
