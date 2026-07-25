/**
 * Pure load/playback state machine for the MP5 player.
 *
 * This is the specification of correct orchestration behavior, independent of
 * React. It exists to make the bug classes that plagued the old ref-and-effect
 * orchestration *impossible by construction*:
 *
 *  - Play intent is DATA keyed by trackId (`intent`), consumed only when audio
 *    actually starts for that exact track — a superseded/aborted load can never
 *    deliver it to the wrong track or silently drop it.
 *  - Exactly one load is "current" at a time, identified by `loadGen`. Stale
 *    load events (wrong gen or wrong trackId) are inert — they cannot start
 *    audio, touch intent, or surface errors.
 *  - `playing` flips true ONLY on a real `AUDIO_STARTED` from the engine, so the
 *    "playing but no source and nothing pending" wedge state is unreachable.
 *
 * The machine decides *what to do* (startLoad / abortLoad / startAudio / …); the
 * controller executes those effects and reports back (LOAD_*, AUDIO_*). Transport
 * mode (full-mix vs stem vs karaoke) is resolved separately by
 * `resolvePlaybackRequest` when the controller runs a `startAudio` effect.
 */

export type PlayIntentSource = "user" | "autoAdvance" | "album" | "external";

export interface PlayIntent {
  trackId: string;
  source: PlayIntentSource;
}

export type LoadPhase = "idle" | "loading" | "readyPartial" | "ready" | "error";

export interface PlaybackMachineState {
  phase: LoadPhase;
  /** Track the current phase refers to; null only while idle. */
  trackId: string | null;
  /** Generation of the current load. Bumped whenever a new load starts. */
  loadGen: number;
  /** Owned play intent; consumed only when audio starts for `intent.trackId`. */
  intent: PlayIntent | null;
  /** True only while a real audio source is playing `trackId`. */
  playing: boolean;
  errorMessage: string | null;
}

export type PlaybackEvent =
  /** User/queue selected a track (optionally requesting playback). */
  | { type: "SELECT"; trackId: string; play?: boolean; source?: PlayIntentSource }
  /** Out-of-component play request (import playFirst, library/converter open+play). */
  | { type: "EXTERNAL_PLAY_REQUEST"; trackId: string }
  /** The controller began loading a track under this generation. */
  | { type: "LOAD_STARTED"; trackId: string; gen: number }
  /** Progressive first window is ready to play. */
  | { type: "LOAD_PARTIAL_READY"; trackId: string; gen: number }
  /** Full decode is ready. */
  | { type: "LOAD_READY"; trackId: string; gen: number }
  /** This load was superseded by a newer one (informational; never touches intent). */
  | { type: "LOAD_SUPERSEDED"; gen: number }
  /** Genuine load failure (not a supersession). */
  | { type: "LOAD_FAILED"; trackId: string; gen: number; message: string }
  | { type: "PLAY_CLICK" }
  | { type: "PAUSE_CLICK" }
  | { type: "TRACK_ENDED" }
  | { type: "REMOVE"; trackId: string }
  | { type: "CLEAR" }
  /** Engine confirmation that audio actually started for a track. */
  | { type: "AUDIO_STARTED"; trackId: string }
  /** Engine confirmation that audio stopped. */
  | { type: "AUDIO_STOPPED" };

export type PlaybackEffect =
  | { type: "startLoad"; trackId: string; gen: number }
  | { type: "abortLoad"; gen: number }
  | { type: "startAudio"; trackId: string }
  | { type: "stopAudio" }
  | { type: "surfaceError"; message: string };

export interface Transition {
  state: PlaybackMachineState;
  effects: PlaybackEffect[];
}

export function initialPlaybackState(): PlaybackMachineState {
  return {
    phase: "idle",
    trackId: null,
    loadGen: 0,
    intent: null,
    playing: false,
    errorMessage: null,
  };
}

/** Is this event for the machine's current, in-flight load? */
function isCurrentLoad(
  state: PlaybackMachineState,
  gen: number,
  trackId: string,
): boolean {
  return gen === state.loadGen && trackId === state.trackId;
}

/** Begin loading `trackId`, aborting any load already in flight. */
function beginLoad(
  state: PlaybackMachineState,
  trackId: string,
  intent: PlayIntent | null,
): Transition {
  const gen = state.loadGen + 1;
  const effects: PlaybackEffect[] = [];
  if (state.phase === "loading" || state.phase === "readyPartial") {
    effects.push({ type: "abortLoad", gen: state.loadGen });
  }
  if (state.playing) {
    effects.push({ type: "stopAudio" });
  }
  effects.push({ type: "startLoad", trackId, gen });
  return {
    state: {
      phase: "loading",
      trackId,
      loadGen: gen,
      intent,
      playing: false,
      errorMessage: null,
    },
    effects,
  };
}

function select(
  state: PlaybackMachineState,
  trackId: string,
  play: boolean,
  source: PlayIntentSource,
): Transition {
  const intent: PlayIntent | null = play ? { trackId, source } : null;

  // Re-selecting the already-loaded current track: don't reload it.
  if (
    trackId === state.trackId &&
    (state.phase === "ready" || state.phase === "readyPartial")
  ) {
    if (play && !state.playing) {
      return { state: { ...state, intent }, effects: [{ type: "startAudio", trackId }] };
    }
    // Selecting a loaded track without play: keep it; drop any stale intent.
    return { state: { ...state, intent: play ? intent : null }, effects: [] };
  }

  return beginLoad(state, trackId, intent);
}

export function reducePlayback(
  state: PlaybackMachineState,
  event: PlaybackEvent,
): Transition {
  switch (event.type) {
    case "SELECT":
      return select(state, event.trackId, !!event.play, event.source ?? "user");

    case "EXTERNAL_PLAY_REQUEST":
      // Equivalent to selecting the track with play requested.
      return select(state, event.trackId, true, "external");

    case "LOAD_STARTED":
      // Purely informational; the SELECT/beginLoad already set phase=loading.
      return { state, effects: [] };

    case "LOAD_PARTIAL_READY": {
      if (!isCurrentLoad(state, event.gen, event.trackId)) {
        return { state, effects: [] }; // stale — inert
      }
      const next = { ...state, phase: "readyPartial" as const };
      if (!state.playing && state.intent?.trackId === event.trackId) {
        return { state: next, effects: [{ type: "startAudio", trackId: event.trackId }] };
      }
      return { state: next, effects: [] };
    }

    case "LOAD_READY": {
      if (!isCurrentLoad(state, event.gen, event.trackId)) {
        return { state, effects: [] }; // stale — inert (cannot start wrong track)
      }
      const next = { ...state, phase: "ready" as const };
      // Start audio only if not already playing this track (a partial-then-full
      // upgrade keeps playing; the controller swaps the buffer seamlessly).
      if (!state.playing && state.intent?.trackId === event.trackId) {
        return { state: next, effects: [{ type: "startAudio", trackId: event.trackId }] };
      }
      return { state: next, effects: [] };
    }

    case "LOAD_SUPERSEDED":
      // A superseding SELECT already advanced the machine; this signal must
      // never touch intent or state. Inert by design.
      return { state, effects: [] };

    case "LOAD_FAILED": {
      if (!isCurrentLoad(state, event.gen, event.trackId)) {
        return { state, effects: [] }; // stale failure — inert
      }
      return {
        state: {
          ...state,
          phase: "error",
          intent: null, // a real failure clears intent so it can't leak
          playing: false,
          errorMessage: event.message,
        },
        effects: [{ type: "surfaceError", message: event.message }],
      };
    }

    case "PLAY_CLICK": {
      if (state.playing || state.trackId == null) {
        return { state, effects: [] };
      }
      const intent: PlayIntent = { trackId: state.trackId, source: "user" };
      if (state.phase === "ready" || state.phase === "readyPartial") {
        return { state: { ...state, intent }, effects: [{ type: "startAudio", trackId: state.trackId }] };
      }
      if (state.phase === "loading") {
        // Play when the in-flight load becomes ready.
        return { state: { ...state, intent }, effects: [] };
      }
      // idle / error — nothing loaded to play.
      return { state, effects: [] };
    }

    case "PAUSE_CLICK": {
      if (!state.playing && state.intent == null) {
        return { state, effects: [] };
      }
      // Pausing drops any pending play intent (the user chose to stop).
      return { state: { ...state, intent: null }, effects: state.playing ? [{ type: "stopAudio" }] : [] };
    }

    case "TRACK_ENDED":
      // Playback ended; auto-advance is a follow-up SELECT the controller issues.
      return { state: { ...state, playing: false }, effects: [] };

    case "REMOVE": {
      if (event.trackId !== state.trackId) {
        return { state, effects: [] }; // removing a non-current track is inert
      }
      return clearCurrent(state);
    }

    case "CLEAR":
      return clearCurrent(state);

    case "AUDIO_STARTED": {
      if (event.trackId !== state.trackId) {
        return { state, effects: [] }; // stale engine callback
      }
      const consumed = state.intent?.trackId === event.trackId ? null : state.intent;
      return { state: { ...state, playing: true, intent: consumed }, effects: [] };
    }

    case "AUDIO_STOPPED":
      return { state: { ...state, playing: false }, effects: [] };

    default: {
      // Exhaustiveness guard.
      const _never: never = event;
      return { state, effects: [] };
    }
  }
}

/** Cancel the current load + playback and return to idle (Clear / remove current). */
function clearCurrent(state: PlaybackMachineState): Transition {
  const effects: PlaybackEffect[] = [];
  // Abort from ANY non-idle phase, not just loading/readyPartial. A progressive
  // track reaches phase "ready" at its 8s window while the full decode is still
  // running under the same load generation, and idle-callback work (integrity
  // verification) is likewise still pending. Aborting an already-finished load
  // is harmless; NOT aborting left background decode + a tens-of-MB verify
  // running for a track the user just cleared or removed.
  if (state.phase !== "idle") {
    effects.push({ type: "abortLoad", gen: state.loadGen });
  }
  if (state.playing) {
    effects.push({ type: "stopAudio" });
  }
  return {
    state: {
      phase: "idle",
      trackId: null,
      loadGen: state.loadGen,
      intent: null,
      playing: false,
      errorMessage: null,
    },
    effects,
  };
}
