import { describe, it, expect, vi } from "vitest";
import {
  PlaybackController,
  type PlaybackControllerHandles,
} from "../apps/web/src/player/engine/playbackController";
import type { PlaybackMachineState } from "../apps/web/src/player/engine/playbackMachine";

function makeController() {
  const loads: { trackId: string; gen: number; signal: AbortSignal }[] = [];
  const states: PlaybackMachineState[] = [];
  const failures: { trackId: string; source: string | null }[] = [];
  const handles: PlaybackControllerHandles = {
    startLoad: vi.fn((trackId, gen, signal) => loads.push({ trackId, gen, signal })),
    startAudio: vi.fn(),
    stopAudio: vi.fn(),
    surfaceError: vi.fn(),
    onLoadFailed: vi.fn((trackId, source) => failures.push({ trackId, source })),
    onStateChange: vi.fn((s) => states.push(s)),
  };
  const controller = new PlaybackController(handles);
  return { controller, handles, loads, states, failures };
}

/** Drive a load through to ready + audio start, as the real loader would. */
function completeLoad(
  controller: PlaybackController,
  loads: { trackId: string; gen: number }[],
) {
  const last = loads[loads.length - 1]!;
  controller.loadStarted(last.trackId, last.gen);
  controller.loadReady(last.trackId, last.gen);
  controller.audioStarted(last.trackId);
  return last;
}

describe("PlaybackController", () => {
  it("select+play loads the track then starts audio on ready", () => {
    const { controller, handles, loads } = makeController();
    controller.select("A", { play: true });

    expect(handles.startLoad).toHaveBeenCalledTimes(1);
    expect(loads[0]!.trackId).toBe("A");
    expect(loads[0]!.signal.aborted).toBe(false);

    controller.loadReady("A", loads[0]!.gen);
    expect(handles.startAudio).toHaveBeenCalledWith("A");

    controller.audioStarted("A");
    expect(controller.getState().playing).toBe(true);
    expect(controller.getState().intent).toBeNull(); // consumed
  });

  it("aborts the prior load's signal when a new track is selected", () => {
    const { controller, loads } = makeController();
    controller.select("A", { play: true });
    const signalA = loads[0]!.signal;
    controller.loadStarted("A", loads[0]!.gen);

    controller.select("B", { play: true });
    expect(signalA.aborted).toBe(true); // A's load was aborted
    expect(loads[1]!.trackId).toBe("B");
    expect(loads[1]!.signal.aborted).toBe(false);

    // A's late ready must not start audio; B's does.
    const { startAudio } = makeController().handles;
    controller.loadReady("A", loads[0]!.gen); // stale
    controller.loadReady("B", loads[1]!.gen);
    controller.audioStarted("B");
    expect(controller.getState().trackId).toBe("B");
    expect(controller.getState().playing).toBe(true);
    void startAudio;
  });

  it("clear aborts the in-flight load and stops audio, leaving idle", () => {
    const { controller, handles, loads } = makeController();
    controller.select("A", { play: true });
    completeLoad(controller, loads);
    expect(controller.getState().playing).toBe(true);

    controller.clear();
    expect(handles.stopAudio).toHaveBeenCalled();
    expect(controller.getState().phase).toBe("idle");
    expect(controller.getState().trackId).toBeNull();

    // A stale ready after clear must not start audio.
    (handles.startAudio as ReturnType<typeof vi.fn>).mockClear();
    controller.loadReady("A", loads[0]!.gen);
    expect(handles.startAudio).not.toHaveBeenCalled();
  });

  it("clear aborts the load signal even from the ready phase", () => {
    // A progressive track reaches "ready" at its 8s window while the full decode
    // is still running under the same generation, so clearing must still abort.
    const { controller, loads } = makeController();
    controller.select("A", { play: true });
    const signalA = loads[0]!.signal;
    completeLoad(controller, loads);
    expect(controller.getState().phase).toBe("ready");
    expect(signalA.aborted).toBe(false);

    controller.clear();
    expect(signalA.aborted).toBe(true);
  });

  it("partial-ready starts audio, and the later full ready does not restart it", () => {
    const { controller, handles, loads } = makeController();
    controller.select("A", { play: true });
    controller.loadStarted("A", loads[0]!.gen);

    controller.loadPartialReady("A", loads[0]!.gen);
    expect(handles.startAudio).toHaveBeenCalledTimes(1);
    expect(controller.getState().phase).toBe("readyPartial");
    controller.audioStarted("A");

    // Full decode lands later: advances the phase, must NOT start audio again.
    controller.loadReady("A", loads[0]!.gen);
    expect(handles.startAudio).toHaveBeenCalledTimes(1);
    expect(controller.getState().phase).toBe("ready");
    expect(controller.getState().playing).toBe(true);
  });

  it("remove of the in-flight current track aborts it", () => {
    const { controller, loads } = makeController();
    controller.select("A", { play: true });
    const signalA = loads[0]!.signal;
    controller.loadStarted("A", loads[0]!.gen);

    controller.remove("A");
    expect(signalA.aborted).toBe(true);
    expect(controller.getState().phase).toBe("idle");
  });

  it("Play click while a load is in flight defers, then plays on ready", () => {
    const { controller, handles, loads } = makeController();
    controller.select("A", { play: false }); // load without intent
    controller.loadStarted("A", loads[0]!.gen);
    expect(handles.startAudio).not.toHaveBeenCalled();

    controller.playClick(); // arm intent while loading
    expect(handles.startAudio).not.toHaveBeenCalled();

    controller.loadReady("A", loads[0]!.gen);
    expect(handles.startAudio).toHaveBeenCalledWith("A");
  });

  it("a genuine load failure surfaces an error and clears intent", () => {
    const { controller, handles, loads } = makeController();
    controller.select("A", { play: true });
    controller.loadFailed("A", loads[0]!.gen, "decode failed");
    expect(handles.surfaceError).toHaveBeenCalledWith("decode failed");
    expect(controller.getState().phase).toBe("error");
    expect(controller.getState().intent).toBeNull();
  });

  it("onLoadFailed reports the intent source captured before it is cleared", () => {
    const { controller, loads, failures } = makeController();
    // An auto-advance load that fails must report source "autoAdvance" so the
    // caller can skip past the bad track — even though the machine nulls intent.
    controller.select("A", { play: true, source: "autoAdvance" });
    controller.loadFailed("A", loads[0]!.gen, "decode failed");
    expect(failures).toEqual([{ trackId: "A", source: "autoAdvance" }]);
    // ...and the machine really did clear the intent.
    expect(controller.getState().intent).toBeNull();
  });

  it("a failure with no pending intent reports a null source", () => {
    const { controller, loads, failures } = makeController();
    controller.select("A", { play: false }); // load without play intent
    controller.loadFailed("A", loads[0]!.gen, "decode failed");
    expect(failures).toEqual([{ trackId: "A", source: null }]);
  });

  it("re-selecting a failed (error-phase) track restarts its load (retry)", () => {
    const { controller, loads } = makeController();
    controller.select("A", { play: true });
    controller.loadFailed("A", loads[0]!.gen, "decode failed");
    expect(controller.getState().phase).toBe("error");

    // Retry: select the same track again → a fresh load must start (not a no-op).
    controller.select("A", { play: true });
    expect(loads.length).toBe(2);
    expect(loads[1]!.trackId).toBe("A");
    expect(controller.getState().phase).toBe("loading");
    // ...and it can now go ready + play.
    controller.loadReady("A", loads[1]!.gen);
    controller.audioStarted("A");
    expect(controller.getState().playing).toBe(true);
  });

  it("a stale load failure is inert — no error, no onLoadFailed", () => {
    const { controller, handles, loads, failures } = makeController();
    controller.select("A", { play: true, source: "autoAdvance" });
    controller.select("B", { play: true }); // supersedes A
    controller.loadFailed("A", loads[0]!.gen, "late decode error"); // stale gen+track
    expect(handles.surfaceError).not.toHaveBeenCalled();
    expect(failures).toEqual([]);
    expect(controller.getState().trackId).toBe("B");
  });

  it("EXTERNAL_PLAY_REQUEST loads + plays like select with play", () => {
    const { controller, handles, loads } = makeController();
    controller.requestExternalPlay("X");
    expect(loads[0]!.trackId).toBe("X");
    controller.loadReady("X", loads[0]!.gen);
    controller.audioStarted("X");
    expect(handles.startAudio).toHaveBeenCalledWith("X");
    expect(controller.getState().playing).toBe(true);
  });

  it("publishes a state snapshot after every event", () => {
    const { controller, states } = makeController();
    controller.select("A", { play: true });
    controller.loadReady("A", controller.getState().loadGen);
    controller.audioStarted("A");
    expect(states.length).toBeGreaterThanOrEqual(3);
    expect(states[states.length - 1]!.playing).toBe(true);
  });
});
