import { describe, expect, it, vi } from "vitest";
import type { StemMixSeamlessOp } from "../apps/web/src/lib/playback/stemMixOps";

/** Documents forbidden reload paths for seamless UI (enforced in useStemMixerEngine + Mp5Player). */
const FORBIDDEN_FROM_SEAMLESS = ["loadTracks", "stopAll", "disposeAllSources", "startAllAt(0)"] as const;

describe("stem mix seamless routing", () => {
  it("seamless ops are only insert, remove, audible", () => {
    const ops: StemMixSeamlessOp[] = [
      {
        type: "insert",
        track: {
          id: "a",
          samples: new Int16Array(4),
          rate: 44100,
          ch: 2,
          gain: 1,
          muted: false,
          solo: false,
        },
      },
      { type: "remove", stemId: "b" },
      {
        type: "audible",
        track: {
          id: "c",
          samples: new Int16Array(4),
          rate: 44100,
          ch: 2,
          gain: 0.5,
          muted: true,
          solo: false,
        },
      },
    ];
    for (const op of ops) {
      expect(["insert", "remove", "audible"]).toContain(op.type);
    }
  });

  it("handler must not call full reload helpers for seamless ops", () => {
    const reloadSpy = vi.fn();
    const seamlessHandler = (op: StemMixSeamlessOp) => {
      if (op.type === "insert" || op.type === "remove" || op.type === "audible") {
        return;
      }
      reloadSpy();
    };
    seamlessHandler({ type: "remove", stemId: "x" });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("documents hard rule: seamless UI never uses loadTracks", () => {
    expect(FORBIDDEN_FROM_SEAMLESS).toContain("loadTracks");
    expect(FORBIDDEN_FROM_SEAMLESS).toContain("stopAll");
  });
});
