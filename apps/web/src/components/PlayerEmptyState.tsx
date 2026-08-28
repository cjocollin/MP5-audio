import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Play } from "@phosphor-icons/react/Play";
import { usePlayerStore } from "../store/playerStore";

export function PlayerEmptyState() {
  const setActiveTab = usePlayerStore((state) => state.setActiveTab);

  return (
    <div
      className="mp5-player-empty-tip space-y-4 text-center"
      data-testid="player-empty-state"
    >
      <div>
        <p className="mp5-eyebrow">Player</p>
        <h1 className="text-xl font-semibold text-white">Start listening</h1>
      </div>
      <p className="mp5-player-empty-tip-copy">
        Open an MP5, convert source audio, or explore a built-in demo.
      </p>
      <div
        className="grid gap-2 sm:grid-cols-3"
        data-testid="player-start-actions"
      >
        <button
          type="button"
          className="mp5-btn-primary flex min-h-11 items-center justify-center gap-2"
          onClick={() =>
            document.querySelector<HTMLInputElement>('[data-testid="player-file-input"]')?.click()
          }
          data-testid="player-start-open"
        >
          <FolderOpen size={18} aria-hidden /> Open MP5
        </button>
        <button
          type="button"
          className="mp5-btn-secondary flex min-h-11 items-center justify-center gap-2"
          onClick={() => setActiveTab("converter")}
          data-testid="player-start-convert"
        >
          <ArrowsClockwise size={18} aria-hidden /> Convert audio
        </button>
        <button
          type="button"
          className="mp5-btn-secondary flex min-h-11 items-center justify-center gap-2"
          onClick={() => setActiveTab("demo")}
          data-testid="player-start-demo"
        >
          <Play size={18} weight="fill" aria-hidden /> Try a demo
        </button>
      </div>
      <details className="mp5-player-empty-tip-more text-left">
        <summary>More tips</summary>
        <ul>
          <li>MP5 and MP5P files open in Player</li>
          <li>FLAC, WAV, MP3, M4A, and OGG start in Converter</li>
          <li>Your Local Library stays in this browser</li>
        </ul>
      </details>
    </div>
  );
}
