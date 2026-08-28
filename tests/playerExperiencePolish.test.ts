import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("natural player entry", () => {
  it("uses one compact empty-player start surface", () => {
    const app = source("apps/web/src/App.tsx");
    const empty = source("apps/web/src/components/PlayerEmptyState.tsx");
    const nowPlaying = source("apps/web/src/player/NowPlayingView.tsx");
    const queue = source("apps/web/src/player/LibraryPanel.tsx");

    expect(app).not.toContain("WelcomeOnboarding");
    expect(empty).toContain('data-testid="player-start-actions"');
    expect(empty).toContain('data-testid="player-start-open"');
    expect(empty).toContain('data-testid="player-start-convert"');
    expect(empty).toContain('data-testid="player-start-demo"');
    expect(nowPlaying).toContain("<PlayerEmptyState />");
    expect(queue).not.toContain("<PlayerEmptyState />");
  });

  it("makes the shell file action match its workspace", () => {
    const shell = source("apps/web/src/components/AppShell.tsx");
    const store = source("apps/web/src/store/playerStore.ts");
    const library = source("apps/web/src/components/LocalLibraryPanel.tsx");

    expect(shell).toContain('player: { label: "Open MP5"');
    expect(shell).toContain('converter: { label: "Add source audio"');
    expect(shell).toContain('library: { label: "Add to Library"');
    expect(shell).toContain("setPendingLibraryFiles");
    expect(store).toContain("pendingLibraryFiles");
    expect(library).toContain("consumePendingLibraryFiles");
  });
});

describe("natural playback and result controls", () => {
  it("keeps one queue action and exposes persistent transport state", () => {
    const transport = source("apps/web/src/player/PersistentTransport.tsx");
    const queue = source("apps/web/src/player/LibraryPanel.tsx");

    expect(transport.match(/onClick=\{onQueue\}/g)).toHaveLength(1);
    expect(transport).toContain("aria-pressed={shuffle}");
    expect(transport).toContain("repeatModeLabel(repeatMode)");
    expect(queue).not.toContain('data-testid="library-shuffle"');
    expect(queue).not.toContain('data-testid="library-repeat"');
    expect(queue).not.toContain("mp5-queue-technical");
    expect(queue).not.toContain("mp5-queue-compact-duration");
    expect(queue).toContain("onClick={onPlay}");
  });

  it("puts rare converter and library actions in native disclosure", () => {
    const exportSummary = source("apps/web/src/components/ExportSummaryPanel.tsx");
    const libraryCard = source("apps/web/src/components/LibraryCollectionCard.tsx");
    const library = source("apps/web/src/components/LocalLibraryPanel.tsx");

    expect(exportSummary).toContain('data-testid="export-more-actions"');
    expect(exportSummary.indexOf("onOpenInPlayer")).toBeLessThan(
      exportSummary.indexOf("onDownloadAgain"),
    );
    expect(libraryCard).toContain('data-testid="library-more-actions"');
    expect(library).toContain('data-testid="library-safety-disclosure"');
  });
});

describe("remembered and accessible preferences", () => {
  it("persists beta dismissal and the selected app theme", () => {
    const firstRun = source("apps/web/src/lib/firstRun.ts");
    const shell = source("apps/web/src/components/AppShell.tsx");
    const store = source("apps/web/src/store/playerStore.ts");

    expect(firstRun).toContain("shouldShowBetaNotice");
    expect(firstRun).toContain("dismissBetaNotice");
    expect(shell).toContain("shouldShowBetaNotice");
    expect(store).toContain("MP5_THEME_STORAGE_KEY");
    expect(store).toContain("loadThemePref");
  });

  it("announces library feedback and exposes backup capability before activation", () => {
    const library = source("apps/web/src/components/LocalLibraryPanel.tsx");
    const transport = source("apps/web/src/player/PersistentTransport.tsx");

    expect(library).toContain('role="status"');
    expect(library).toContain('aria-live="polite"');
    expect(library).toContain('role="alert"');
    expect(library).toContain("backupSupported");
    expect(library).toContain("Folder backup is not supported by this browser");
    expect(transport).toContain("Open an MP5 or try a demo from the Demo tab");
  });
});
