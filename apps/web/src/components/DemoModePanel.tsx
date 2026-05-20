import { usePlayerStore } from "../store/playerStore";

const STEPS = [
  {
    n: 1,
    title: "Convert a FLAC or WAV",
    body: "Open the Converter tab and drop a lossless source file.",
    tab: "converter" as const,
  },
  {
    n: 2,
    title: "Export MP5-L v3",
    body: "Keep the default export format (MP5-L v3). The app downloads a clean, lossless .mp5 automatically.",
    tab: "converter" as const,
  },
  {
    n: 3,
    title: "Open the .mp5 file",
    body: "Switch to Player and drop the file you just exported (or use test-fixtures/demo_mp5l_v3_tone.mp5).",
    tab: "player" as const,
  },
  {
    n: 4,
    title: "Check the Format panel",
    body: "Confirm MP5-L v3, bit-exact, and the WASM decode path before playing.",
    tab: "player" as const,
  },
  {
    n: 5,
    title: "Play the file",
    body: "Press Play. Seek and volume should work. No MP5-C-style hiss on MP5-L exports.",
    tab: "player" as const,
  },
];

export function DemoModePanel() {
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);

  return (
    <div className="space-y-4" data-testid="demo-mode-panel">
      <div className="mp5-card p-4 border-accent/20">
        <h2 className="text-lg font-semibold text-white mb-1">Demo mode</h2>
        <p className="text-xs text-gray-400">
          Five-step walkthrough for showing MP5-L v3. Use synthetic{" "}
          <code className="text-accent">test-fixtures/demo_mp5l_v3_tone.mp5</code> if you have no
          FLAC handy.
        </p>
      </div>

      <ol className="space-y-3">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="mp5-card p-4 flex gap-4"
            data-testid={`demo-step-${step.n}`}
          >
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-sm">
              {step.n}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white">{step.title}</p>
              <p className="text-xs text-gray-400 mt-1">{step.body}</p>
              <button
                type="button"
                onClick={() => setActiveTab(step.tab)}
                className="mt-2 text-xs text-accent hover:underline"
              >
                Go to {step.tab === "converter" ? "Converter" : "Player"} →
              </button>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-xs text-gray-500">
        Full script: <code className="text-accent">docs/MP5_DEMO_GUIDE.md</code>
      </p>
    </div>
  );
}
