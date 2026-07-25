/**
 * Playback controller — the non-React orchestrator that owns the playback state
 * machine and turns its effects into real work.
 *
 * It is the single owner of:
 *  - the `playbackMachine` state (one source of truth for load phase + intent),
 *  - one AbortController per load (so a superseded/cleared load's async work
 *    stops promptly), and
 *  - the mapping from machine effects to injected side-effect handles.
 *
 * The React layer (Mp5Player) provides the handles (how to actually load a
 * track, start/stop audio, surface an error) and drives the controller through
 * its event methods (select / playClick / …) and load callbacks
 * (loadStarted / loadReady / …). Kept free of React and of the engines so the
 * orchestration contract is unit-testable with fake handles.
 */

import {
  initialPlaybackState,
  reducePlayback,
  type PlaybackEvent,
  type PlaybackMachineState,
  type PlayIntentSource,
} from "./playbackMachine";

export interface PlaybackControllerHandles {
  /**
   * Begin loading `trackId`. Must report back via loadStarted/loadPartialReady/
   * loadReady/loadFailed with the SAME `gen`. `signal` aborts when the load is
   * superseded or the queue cleared — the pipeline should bail promptly.
   */
  startLoad(trackId: string, gen: number, signal: AbortSignal): void;
  /** Start/resume audio for a ready track (resolve transport, drive the engine). */
  startAudio(trackId: string): void;
  /** Stop the active audio source. */
  stopAudio(): void;
  /** Surface a genuine load failure to the UI. */
  surfaceError(message: string): void;
  /**
   * A genuine load failure for the current track. `failedSource` is the source
   * of the play intent that was armed at failure time (captured before the
   * machine clears it), so the caller can decide whether to auto-advance:
   * a failed auto-advance should skip to the next track, a failed user pick
   * should not. `null` when no play was pending.
   */
  onLoadFailed?(trackId: string, failedSource: PlayIntentSource | null): void;
  /** Publish the new machine state (e.g. into a store slice) after every event. */
  onStateChange(state: PlaybackMachineState): void;
}

export class PlaybackController {
  private state = initialPlaybackState();
  /** The in-flight load's abort controller + the gen it was started under. */
  private activeLoad: { gen: number; abort: AbortController } | null = null;

  constructor(private readonly handles: PlaybackControllerHandles) {}

  getState(): PlaybackMachineState {
    return this.state;
  }

  // ── Intent / transport events (from the UI) ───────────────────────────────

  select(trackId: string, opts?: { play?: boolean; source?: PlayIntentSource }): void {
    this.dispatch({
      type: "SELECT",
      trackId,
      play: opts?.play,
      source: opts?.source,
    });
  }

  /** Out-of-component play request (import playFirst, library/converter open+play). */
  requestExternalPlay(trackId: string): void {
    this.dispatch({ type: "EXTERNAL_PLAY_REQUEST", trackId });
  }

  playClick(): void {
    this.dispatch({ type: "PLAY_CLICK" });
  }

  pauseClick(): void {
    this.dispatch({ type: "PAUSE_CLICK" });
  }

  trackEnded(): void {
    this.dispatch({ type: "TRACK_ENDED" });
  }

  remove(trackId: string): void {
    this.dispatch({ type: "REMOVE", trackId });
  }

  clear(): void {
    this.dispatch({ type: "CLEAR" });
  }

  // ── Load pipeline callbacks (from the loader) ─────────────────────────────

  loadStarted(trackId: string, gen: number): void {
    this.dispatch({ type: "LOAD_STARTED", trackId, gen });
  }

  loadPartialReady(trackId: string, gen: number): void {
    this.dispatch({ type: "LOAD_PARTIAL_READY", trackId, gen });
  }

  loadReady(trackId: string, gen: number): void {
    this.dispatch({ type: "LOAD_READY", trackId, gen });
  }

  loadSuperseded(gen: number): void {
    this.dispatch({ type: "LOAD_SUPERSEDED", gen });
  }

  loadFailed(trackId: string, gen: number, message: string): void {
    this.dispatch({ type: "LOAD_FAILED", trackId, gen, message });
  }

  // ── Engine callbacks (audio actually started/stopped) ─────────────────────

  audioStarted(trackId: string): void {
    this.dispatch({ type: "AUDIO_STARTED", trackId });
  }

  audioStopped(): void {
    this.dispatch({ type: "AUDIO_STOPPED" });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private dispatch(event: PlaybackEvent): void {
    // Capture the intent source BEFORE the reducer runs, because LOAD_FAILED
    // clears intent — the auto-advance decision needs to know whether the
    // failed load was an auto-advance continuation.
    const failedSource =
      event.type === "LOAD_FAILED" ? (this.state.intent?.source ?? null) : null;

    const { state, effects } = reducePlayback(this.state, event);
    this.state = state;
    for (const effect of effects) {
      switch (effect.type) {
        case "startLoad": {
          // Abort a prior load defensively (the machine also emits abortLoad
          // before a superseding startLoad, but be robust to reordering).
          this.activeLoad?.abort.abort();
          const abort = new AbortController();
          this.activeLoad = { gen: effect.gen, abort };
          this.handles.startLoad(effect.trackId, effect.gen, abort.signal);
          break;
        }
        case "abortLoad": {
          if (this.activeLoad && this.activeLoad.gen === effect.gen) {
            this.activeLoad.abort.abort();
            this.activeLoad = null;
          }
          break;
        }
        case "startAudio":
          this.handles.startAudio(effect.trackId);
          break;
        case "stopAudio":
          this.handles.stopAudio();
          break;
        case "surfaceError":
          this.handles.surfaceError(effect.message);
          // A surfaceError effect is emitted only for a genuine failure of the
          // current load (stale failures are inert), so this is the right place
          // to drive auto-advance-on-error with the pre-cleared intent source.
          if (event.type === "LOAD_FAILED") {
            this.handles.onLoadFailed?.(event.trackId, failedSource);
          }
          break;
      }
    }
    this.handles.onStateChange(state);
  }
}
