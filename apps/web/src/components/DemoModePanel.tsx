import { useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import { DemoFixtureActions } from "./DemoFixtureActions";
import { importAlbumPackageToPlayer, importMp5ToPlayer } from "../player/playerImport";
import { fetchEmbeddedAlbumFixture } from "../lib/demoFixture";

const PATHS = [
  {
    id: "a",
    title: "A. Play a smart song",
    steps: [
      "Load the MP5-L demo or drop your own .mp5",
      "Check metadata, lyrics, and VISU in Now Playing",
      "Press Play",
    ],
    tab: "player" as const,
  },
  {
    id: "b",
    title: "B. Try stems & karaoke",
    steps: [
      "Load the karaoke demo (stems + synced lyrics)",
      "Enable Karaoke mode in the lyrics panel",
      "Try stem checkboxes in the Stems panel",
    ],
    tab: "player" as const,
  },
  {
    id: "c",
    title: "C. Try an album package",
    steps: [
      "Load the embedded album demo (.mp5p)",
      "Play album or a single track",
      "Optional: extract a track or save to library",
    ],
    tab: "player" as const,
  },
  {
    id: "d",
    title: "D. Convert audio",
    steps: [
      "Converter â†’ Single file",
      "Drop FLAC, WAV, MP3, M4A, or OGG",
      "Keep MP5-L v3 default, export, Open in Player",
    ],
    tab: "converter" as const,
  },
  {
    id: "e",
    title: "E. Batch album",
    steps: [
      "Converter â†’ Batch â†’ enable Batch album export",
      "Convert two+ tracks, edit album metadata",
      "Export manifest or embedded .mp5p",
    ],
    tab: "converter" as const,
  },
];

export function DemoModePanel() {
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);
  const [albumBusy, setAlbumBusy] = useState(false);
  const [albumNote, setAlbumNote] = useState("");

  async function loadEmbeddedAlbumDemo() {
    setAlbumBusy(true);
    setAlbumNote("");
    try {
      const file = await fetchEmbeddedAlbumFixture();
      if (!file) {
        setAlbumNote(
          "Embedded album demo not on this server. Run pnpm fixtures:embedded-album before deploy, or drop your own .mp5p in Player.",
        );
        return;
      }
      await importAlbumPackageToPlayer(file);
    } finally {
      setAlbumBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="demo-mode-panel">
      <div className="mp5-card p-4 border-accent/20 space-y-2">
        <h2 className="text-lg font-semibold text-white">Demo guide</h2>
        <p className="text-xs text-gray-400 leading-relaxed">
          Short paths for a public Beta-style demo. All audio is synthetic â€” no copyrighted music in
          the repo. MP5-L v3 is recommended; MP5-C is lab-only; MP5 does not claim to beat MP3, AAC,
          Opus, or FLAC.
        </p>
      </div>

      <DemoFixtureActions
        onLoaded={async (file, playFirst) => {
          setActiveTab("player");
          await importMp5ToPlayer([file], { playFirst });
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="mp5-btn-secondary text-xs sm:text-sm min-h-[36px]"
          disabled={albumBusy}
          onClick={() => void loadEmbeddedAlbumDemo()}
          data-testid="demo-load-embedded-album"
        >
          {albumBusy ? "Loading album…" : "Load embedded album demo"}
        </button>
      </div>
      {albumNote && (
        <p className="text-xs text-amber-200/80" data-testid="demo-album-note">
          {albumNote}
        </p>
      )}

      <div className="space-y-3">
        {PATHS.map((path) => (
          <section
            key={path.id}
            className="mp5-card p-4 space-y-2"
            data-testid={`demo-path-${path.id}`}
          >
            <h3 className="text-sm font-medium text-white">{path.title}</h3>
            <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
              {path.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setActiveTab(path.tab)}
              className="text-xs text-accent hover:underline min-h-[32px]"
              data-testid={`demo-path-${path.id}-go`}
            >
              Go to {path.tab === "converter" ? "Converter" : "Player"} â†’
            </button>
          </section>
        ))}
      </div>

      <p className="text-xs text-gray-500">
        Full presenter script:{" "}
        <a
          href="https://github.com/cjocollin/MP5-audio/blob/main/docs/MP5_DEMO_GUIDE.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          docs/MP5_DEMO_GUIDE.md
        </a>
        {" Â· Manual QA: "}
        <span className="font-mono text-gray-600">docs/MP5_MANUAL_QA_CHECKLIST.md</span>
      </p>
    </div>
  );
}
