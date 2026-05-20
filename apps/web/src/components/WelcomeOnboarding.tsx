import { useState } from "react";
import { dismissOnboarding, shouldShowOnboarding } from "../lib/firstRun";
import { usePlayerStore } from "../store/playerStore";
import { DemoFixtureActions } from "./DemoFixtureActions";
import { importMp5ToPlayer } from "../player/playerImport";

export function WelcomeOnboarding() {
  const [visible, setVisible] = useState(shouldShowOnboarding);
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);
  const tracks = usePlayerStore((s) => s.tracks);

  if (!visible || tracks.length > 0) return null;

  function close() {
    dismissOnboarding();
    setVisible(false);
  }

  return (
    <section
      className="mp5-card p-5 sm:p-6 space-y-5 border-accent/20 mb-10"
      data-testid="welcome-onboarding"
      aria-labelledby="welcome-heading"
    >
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-accent/80 font-medium">Welcome</p>
        <h2 id="welcome-heading" className="text-xl sm:text-2xl font-semibold text-white">
          MP5 Alpha — smart audio, clearly explained
        </h2>
        <p className="text-sm text-gray-400 leading-relaxed">
          MP5 is an experimental audio container with optional metadata. It does not claim to beat
          MP3, AAC, Opus, or FLAC. For listening, use{" "}
          <strong className="text-gray-300">MP5-L v3</strong> (lossless, recommended).
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div className="rounded-xl bg-black/20 p-4 space-y-2">
          <h3 className="font-medium text-gray-200">Convert a file</h3>
          <ol className="text-gray-500 space-y-1.5 list-decimal list-inside text-xs leading-relaxed">
            <li>Open the Converter tab</li>
            <li>Drop FLAC, WAV, MP3, M4A, or OGG</li>
            <li>Review metadata, export MP5-L v3</li>
            <li>Open in Player or download</li>
          </ol>
          <button
            type="button"
            className="mp5-btn-secondary text-xs mt-2"
            onClick={() => {
              close();
              setActiveTab("converter");
            }}
          >
            Go to Converter
          </button>
        </div>
        <div className="rounded-xl bg-black/20 p-4 space-y-2">
          <h3 className="font-medium text-gray-200">Play a file</h3>
          <ol className="text-gray-500 space-y-1.5 list-decimal list-inside text-xs leading-relaxed">
            <li>Open the Player tab</li>
            <li>Drop one or more .mp5 files</li>
            <li>Search, queue, shuffle, repeat</li>
            <li>Check the Format panel for codec info</li>
          </ol>
          <button
            type="button"
            className="mp5-btn-secondary text-xs mt-2"
            onClick={() => {
              close();
              setActiveTab("player");
            }}
          >
            Go to Player
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.04] bg-black/10 px-4 py-3 text-xs text-gray-500 space-y-1">
        <p>
          <strong className="text-gray-400 font-normal">MP5-C</strong> — experimental lab codec, may
          hiss. <strong className="text-gray-400 font-normal">MP5-H</strong> — hybrid, large, not
          default. <strong className="text-gray-400 font-normal">PCM</strong> — reference/debug only.
        </p>
      </div>

      <DemoFixtureActions
        compact
        testIdPrefix="welcome"
        onLoaded={async (file, playFirst) => {
          await importMp5ToPlayer([file], { playFirst });
          close();
        }}
      />

      <button
        type="button"
        onClick={close}
        className="w-full py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 mp5-focus-ring"
        data-testid="welcome-dismiss"
      >
        Got it — hide this welcome panel
      </button>
    </section>
  );
}
