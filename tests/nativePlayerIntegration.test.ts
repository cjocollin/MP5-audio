import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  installLaunchFileConsumer,
  type LaunchParamsLike,
} from "../apps/web/src/lib/nativeFileOpen";
import {
  bindMediaSessionHandlers,
  clampMediaPosition,
} from "../apps/web/src/player/NativeMediaSession";

describe("native player integration", () => {
  it("routes installed-app launches and declares both file associations", async () => {
    let consumer: ((params: LaunchParamsLike) => void) | undefined;
    const onFiles = vi.fn();
    expect(
      installLaunchFileConsumer({ setConsumer: (next) => (consumer = next) }, onFiles),
    ).toBe(true);
    consumer?.({
      files: [
        { getFile: async () => new File(["track"], "track.mp5") },
        { getFile: async () => new File(["album"], "album.mp5p") },
        { getFile: async () => new File(["skip"], "notes.txt") },
      ],
    });
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledOnce());
    expect(onFiles.mock.calls[0]?.[0].map((file: File) => file.name)).toEqual([
      "track.mp5",
      "album.mp5p",
    ]);

    const vite = readFileSync("apps/web/vite.config.ts", "utf8");
    expect(vite).toContain("file_handlers");
    expect(vite).toContain('[".mp5", ".mp5p"]');
    const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    expect(tauri.bundle.fileAssociations[0].ext).toEqual(["mp5", "mp5p"]);
    const mediaSession = readFileSync("apps/web/src/player/NativeMediaSession.tsx", "utf8");
    expect(mediaSession).toContain("new MediaMetadata");
    expect(mediaSession).toContain("setPositionState");
  });

  it("binds media actions with bounded seek positions and removes them on cleanup", () => {
    const handlers = new Map<string, ((details: MediaSessionActionDetails) => void) | null>();
    const session = {
      setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
        handlers.set(action, handler);
      },
    };
    const actions = {
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onPrevious: vi.fn(),
      onNext: vi.fn(),
      onSeek: vi.fn(),
    };
    const cleanup = bindMediaSessionHandlers(session, actions, () => ({
      currentTime: 3,
      duration: 100,
    }));
    handlers.get("play")?.({ action: "play" });
    handlers.get("seekbackward")?.({ action: "seekbackward", seekOffset: 10 });
    handlers.get("seekforward")?.({ action: "seekforward", seekOffset: 500 });
    expect(actions.onPlay).toHaveBeenCalledOnce();
    expect(actions.onSeek.mock.calls.map(([seconds]) => seconds)).toEqual([0, 100]);
    expect(clampMediaPosition(Number.NaN, 100)).toBe(0);
    cleanup();
    expect([...handlers.values()].every((handler) => handler === null)).toBe(true);
  });
});
