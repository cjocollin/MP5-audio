import { useEffect } from "react";
import { usePlayerStore } from "./store/playerStore";
import { Mp5Player } from "./player/Mp5Player";
import { ConverterPanel } from "./player/ConverterPanel";
import { WasmSetupBanner } from "./components/WasmSetupBanner";
import { AboutMp5Panel } from "./components/AboutMp5Panel";
import { DemoModePanel } from "./components/DemoModePanel";
import { PublicLanding } from "./components/PublicLanding";
import { LocalLibraryPanel } from "./components/LocalLibraryPanel";

export default function App() {
  const { activeTab, setActiveTab, theme, setTheme } = usePlayerStore();

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
    <div className="min-h-screen max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-6">
        <WasmSetupBanner />
      </div>

      <PublicLanding />

      <nav className="flex gap-2 mb-8 flex-wrap" aria-label="Main">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            aria-current={activeTab === t.id ? "page" : undefined}
            className={`mp5-tab ${activeTab === t.id ? "mp5-tab-active" : "mp5-tab-inactive"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="space-y-6">
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
            <p className="text-xs text-gray-500 leading-relaxed">
              Optional content guidance and specialized app metadata never affect playback.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
