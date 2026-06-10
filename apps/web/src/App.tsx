import { useEffect } from "react";
import { usePlayerStore } from "./store/playerStore";
import { Mp5Player } from "./player/Mp5Player";
import { ConverterPanel } from "./player/ConverterPanel";
import { WasmSetupBanner } from "./components/WasmSetupBanner";
import { AboutMp5Panel } from "./components/AboutMp5Panel";
import { DemoModePanel } from "./components/DemoModePanel";
import { PublicLanding } from "./components/PublicLanding";
import { LocalLibraryPanel } from "./components/LocalLibraryPanel";
import { PerformanceDiagnosticsPanel } from "./components/PerformanceDiagnosticsPanel";
import { WelcomeOnboarding } from "./components/WelcomeOnboarding";
import { BetaFeedbackPanel } from "./components/BetaFeedbackPanel";

export default function App() {
  const { activeTab, setActiveTab, theme, setTheme, useFileThemes, setUseFileThemes } =
    usePlayerStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  const tabs = [
    { id: "player" as const, label: "Player" },
    { id: "converter" as const, label: "Converter" },
    { id: "library" as const, label: "Library" },
    { id: "demo" as const, label: "Demo" },
    { id: "about" as const, label: "About" },
    { id: "settings" as const, label: "Settings" },
  ];

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
      <div className="mb-3">
        <WasmSetupBanner />
      </div>

      <PublicLanding />

      <WelcomeOnboarding />

      <nav className="flex gap-2 mb-5 flex-wrap sticky top-0 z-10 py-2 -mx-1 px-1 bg-surface/95 backdrop-blur-sm border-b border-white/[0.04]" aria-label="Main" data-testid="app-main-nav">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            aria-current={activeTab === t.id ? "page" : undefined}
            data-testid={`app-tab-${t.id}`}
            className={`mp5-tab ${activeTab === t.id ? "mp5-tab-active" : "mp5-tab-inactive"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="space-y-5">
        {activeTab === "player" && <Mp5Player />}
        {activeTab === "converter" && <ConverterPanel />}
        {activeTab === "library" && <LocalLibraryPanel />}
        {activeTab === "demo" && <DemoModePanel />}
        {activeTab === "about" && <AboutMp5Panel />}
        {activeTab === "settings" && (
          <div className="mp5-card p-5 space-y-4">
            <h2 className="text-lg font-semibold text-white">Settings</h2>
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
            <PerformanceDiagnosticsPanel />
          </div>
        )}
      </main>
    </div>
  );
}
