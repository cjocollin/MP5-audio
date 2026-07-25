import { describe, it, expect } from "vitest";
import {
  initialPlaybackState,
  reducePlayback,
  type PlaybackEffect,
  type PlaybackEvent,
  type PlaybackMachineState,
} from "../apps/web/src/player/engine/playbackMachine";

/** Fold a sequence of events, collecting every emitted effect. */
function drive(events: PlaybackEvent[], start = initialPlaybackState()) {
  let state = start;
  const effects: PlaybackEffect[] = [];
  const trace: { event: PlaybackEvent; state: PlaybackMachineState; effects: PlaybackEffect[] }[] = [];
  for (const event of events) {
    const t = reducePlayback(state, event);
    state = t.state;
    effects.push(...t.effects);
    trace.push({ event, state, effects: t.effects });
  }
  return { state, effects, trace };
}

const startAudios = (effects: PlaybackEffect[]) =>
  effects.filter((e): e is Extract<PlaybackEffect, { type: "startAudio" }> => e.type === "startAudio");

describe("playback intent machine", () => {
  describe("GATE 1 — open bug fixed", () => {
    it("delivers intent exactly once across a superseded reload (StrictMode / churn)", () => {
      // SELECT B (play) → load gen1 → a second SELECT B supersedes it → gen2 ready.
      let s = initialPlaybackState();
      const eff: PlaybackEffect[] = [];
      const step = (e: PlaybackEvent) => {
        const t = reducePlayback(s, e);
        s = t.state;
        eff.push(...t.effects);
      };
      step({ type: "SELECT", trackId: "B", play: true });
      const gen1 = s.loadGen;
      step({ type: "LOAD_STARTED", trackId: "B", gen: gen1 });
      step({ type: "SELECT", trackId: "B", play: true }); // supersede (same track)
      const gen2 = s.loadGen;
      expect(gen2).toBeGreaterThan(gen1);
      step({ type: "LOAD_SUPERSEDED", gen: gen1 }); // old load reports out — inert
      step({ type: "LOAD_READY", trackId: "B", gen: gen1 }); // STALE ready — inert
      step({ type: "LOAD_READY", trackId: "B", gen: gen2 });
      step({ type: "AUDIO_STARTED", trackId: "B" });

      expect(startAudios(eff)).toEqual([{ type: "startAudio", trackId: "B" }]);
      expect(s.playing).toBe(true);
      expect(s.intent).toBeNull(); // consumed exactly once
    });

    it("a superseded load can never start the wrong track's audio", () => {
      const { state, effects } = drive([
        { type: "SELECT", trackId: "A", play: true },
        { type: "LOAD_STARTED", trackId: "A", gen: 1 },
        { type: "SELECT", trackId: "C", play: true }, // switch away from A
        { type: "LOAD_READY", trackId: "A", gen: 1 }, // A's stale ready arrives late
        { type: "LOAD_READY", trackId: "C", gen: 2 },
        { type: "AUDIO_STARTED", trackId: "C" },
      ]);
      expect(startAudios(effects)).toEqual([{ type: "startAudio", trackId: "C" }]);
      expect(state.trackId).toBe("C");
      expect(state.playing).toBe(true);
    });

    it("Play in any ready+paused state always starts audio", () => {
      for (const phase of ["ready", "readyPartial"] as const) {
        const base: PlaybackMachineState = {
          phase,
          trackId: "T",
          loadGen: 1,
          intent: null,
          playing: false,
          errorMessage: null,
        };
        const { effects } = drive([{ type: "PLAY_CLICK" }], base);
        expect(startAudios(effects)).toEqual([{ type: "startAudio", trackId: "T" }]);
      }
    });

    it("never reaches playing=true without a real AUDIO_STARTED (no wedge)", () => {
      // Load ready + play intent, but engine never confirms audio start.
      const { state } = drive([
        { type: "SELECT", trackId: "A", play: true },
        { type: "LOAD_READY", trackId: "A", gen: 1 },
        // no AUDIO_STARTED
      ]);
      expect(state.playing).toBe(false); // startAudio was requested, but not confirmed
    });
  });

  describe("GATE 2 — regressions", () => {
    it("EXTERNAL_PLAY_REQUEST behaves like SELECT with play (R1)", () => {
      const viaExternal = drive([
        { type: "EXTERNAL_PLAY_REQUEST", trackId: "X" },
        { type: "LOAD_READY", trackId: "X", gen: 1 },
        { type: "AUDIO_STARTED", trackId: "X" },
      ]);
      const viaSelect = drive([
        { type: "SELECT", trackId: "X", play: true },
        { type: "LOAD_READY", trackId: "X", gen: 1 },
        { type: "AUDIO_STARTED", trackId: "X" },
      ]);
      expect(startAudios(viaExternal.effects)).toEqual(startAudios(viaSelect.effects));
      expect(viaExternal.state.playing).toBe(true);
    });

    it("CLEAR cancels the in-flight load and blocks its stale ready (R2)", () => {
      const { state, effects } = drive([
        { type: "SELECT", trackId: "A", play: true },
        { type: "LOAD_STARTED", trackId: "A", gen: 1 },
        { type: "CLEAR" },
        { type: "LOAD_READY", trackId: "A", gen: 1 }, // ghost ready after clear
        { type: "AUDIO_STARTED", trackId: "A" }, // stale engine callback
      ]);
      expect(effects).toContainEqual({ type: "abortLoad", gen: 1 });
      expect(startAudios(effects)).toEqual([]); // no ghost playback
      expect(state.phase).toBe("idle");
      expect(state.playing).toBe(false);
    });

    it("REMOVE of the current track cancels; removing another track is inert", () => {
      const removeOther = drive([
        { type: "SELECT", trackId: "A", play: true },
        { type: "REMOVE", trackId: "B" },
      ]);
      expect(removeOther.state.trackId).toBe("A");
      expect(removeOther.state.phase).toBe("loading");

      const removeCurrent = drive([
        { type: "SELECT", trackId: "A", play: true },
        { type: "REMOVE", trackId: "A" },
      ]);
      expect(removeCurrent.state.phase).toBe("idle");
      expect(removeCurrent.effects).toContainEqual({ type: "abortLoad", gen: 1 });
    });

    it("progressive partial→full upgrade does not double-start audio", () => {
      const { effects } = drive([
        { type: "SELECT", trackId: "P", play: true },
        { type: "LOAD_PARTIAL_READY", trackId: "P", gen: 1 },
        { type: "AUDIO_STARTED", trackId: "P" }, // partial plays
        { type: "LOAD_READY", trackId: "P", gen: 1 }, // full arrives — seamless upgrade
      ]);
      expect(startAudios(effects)).toEqual([{ type: "startAudio", trackId: "P" }]);
    });

    it("a genuine load failure surfaces an error and clears intent", () => {
      const { state, effects } = drive([
        { type: "SELECT", trackId: "A", play: true },
        { type: "LOAD_FAILED", trackId: "A", gen: 1, message: "boom" },
      ]);
      expect(state.phase).toBe("error");
      expect(state.intent).toBeNull();
      expect(effects).toContainEqual({ type: "surfaceError", message: "boom" });
    });

    it("re-selecting the loaded current track does not reload it", () => {
      const ready: PlaybackMachineState = {
        phase: "ready",
        trackId: "T",
        loadGen: 3,
        intent: null,
        playing: false,
        errorMessage: null,
      };
      const { state, effects } = drive([{ type: "SELECT", trackId: "T", play: false }], ready);
      expect(state.loadGen).toBe(3); // no new load
      expect(effects.filter((e) => e.type === "startLoad")).toEqual([]);
    });
  });

  describe("invariants over random event sequences", () => {
    it("holds structural invariants across 400 seeded random runs", () => {
      const tracks = ["A", "B", "C"];
      // Deterministic PRNG (Date.now/Math.random are unavailable to workflows,
      // but plain vitest allows Math.random — use a seeded LCG for repeatability).
      let seed = 123456789;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;

      for (let run = 0; run < 400; run++) {
        let s = initialPlaybackState();
        let lastAudio: "started" | "stopped" | null = null;
        for (let i = 0; i < 30; i++) {
          const gen = s.loadGen;
          const tid = s.trackId ?? "A";
          const candidates: PlaybackEvent[] = [
            { type: "SELECT", trackId: pick(tracks), play: rand() > 0.5 },
            { type: "EXTERNAL_PLAY_REQUEST", trackId: pick(tracks) },
            { type: "LOAD_STARTED", trackId: tid, gen },
            { type: "LOAD_PARTIAL_READY", trackId: tid, gen },
            { type: "LOAD_READY", trackId: tid, gen },
            { type: "LOAD_READY", trackId: pick(tracks), gen: gen - 1 }, // stale
            { type: "LOAD_SUPERSEDED", gen: gen - 1 },
            { type: "LOAD_FAILED", trackId: tid, gen, message: "x" },
            { type: "PLAY_CLICK" },
            { type: "PAUSE_CLICK" },
            { type: "TRACK_ENDED" },
            { type: "REMOVE", trackId: pick(tracks) },
            { type: "CLEAR" },
            { type: "AUDIO_STARTED", trackId: tid },
            { type: "AUDIO_STOPPED" },
          ];
          const ev = pick(candidates);
          const t = reducePlayback(s, ev);

          // INV1: any startAudio targets the machine's current track.
          for (const eff of t.effects) {
            if (eff.type === "startAudio") expect(eff.trackId).toBe(t.state.trackId);
          }
          // Track the grounding of `playing`.
          if (ev.type === "AUDIO_STARTED" && ev.trackId === s.trackId) lastAudio = "started";
          if (
            ev.type === "AUDIO_STOPPED" ||
            ev.type === "PAUSE_CLICK" ||
            ev.type === "TRACK_ENDED" ||
            ev.type === "CLEAR" ||
            (ev.type === "REMOVE" && ev.trackId === s.trackId) ||
            ev.type === "SELECT" ||
            ev.type === "EXTERNAL_PLAY_REQUEST" ||
            ev.type === "LOAD_FAILED"
          ) {
            if (!t.state.playing) lastAudio = "stopped";
          }
          s = t.state;

          // INV2: playing=true only after a confirmed AUDIO_STARTED (grounded).
          if (s.playing) expect(lastAudio).toBe("started");
          // INV3: a live intent always references the current track.
          if (s.intent) expect(s.intent.trackId).toBe(s.trackId);
          // INV4: idle has no track and no intent.
          if (s.phase === "idle") {
            expect(s.trackId).toBeNull();
            expect(s.intent).toBeNull();
          }
        }
      }
    });
  });
});
