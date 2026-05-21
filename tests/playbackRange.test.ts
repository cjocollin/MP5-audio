import { describe, it, expect } from "vitest";
import {
  rangeFromMs,
  playHighlightRange,
  previewHighlightRange,
  loopSectionRange,
  loopHookRange,
  applyPlaybackRangeTick,
  highlightDurationMs,
} from "../apps/web/src/lib/sections/playbackRange";
import { decodeHilt, encodeHilt, parseMp5, writeMp5, CodecId } from "@mp5/container";

describe("playback range validation", () => {
  it("accepts valid ms range", () => {
    expect(rangeFromMs(0, 1500)).toEqual({ startSec: 0, endSec: 1.5 });
  });

  it("rejects invalid range", () => {
    expect(rangeFromMs(1000, 500)).toBeNull();
    expect(rangeFromMs(-1)).toBeNull();
  });

  it("play highlight stops at end when bounded", () => {
    const { range, seekOnly } = playHighlightRange(
      { startMs: 600, endMs: 900, label: "Clip" },
      0,
    );
    expect(seekOnly).toBe(false);
    expect(range?.mode).toBe("preview");
    expect(range?.endSec).toBe(0.9);
  });

  it("open highlight is seek-only", () => {
    const { range, seekOnly } = playHighlightRange({ startMs: 0, label: "Open" }, 0);
    expect(seekOnly).toBe(true);
    expect(range).toBeNull();
  });

  it("preview requires end", () => {
    expect(
      previewHighlightRange({ startMs: 0, endMs: 500, useCase: "preview" }, 0),
    ).not.toBeNull();
    expect(previewHighlightRange({ startMs: 0, useCase: "preview" }, 0)).toBeNull();
  });

  it("loop section requires end", () => {
    expect(
      loopSectionRange({
        sectionId: "s1",
        type: "chorus",
        startMs: 600,
        endMs: 900,
      }),
    ).not.toBeNull();
    expect(
      loopSectionRange({
        sectionId: "s1",
        type: "verse",
        startMs: 0,
      }),
    ).toBeNull();
  });

  it("loop hook from HOOK chunk", () => {
    const r = loopHookRange({ startMs: 900, endMs: 1200, label: "Hook" });
    expect(r?.mode).toBe("loop");
    expect(r?.id).toBe("hook");
  });

  it("preview tick stops at end", () => {
    const active = {
      id: "x",
      startSec: 0,
      endSec: 1,
      mode: "preview" as const,
      label: "P",
    };
    expect(applyPlaybackRangeTick(0.5, active)).toEqual({ action: "none" });
    expect(applyPlaybackRangeTick(1.1, active)).toEqual({ action: "stop" });
  });

  it("loop tick seeks to start", () => {
    const active = {
      id: "x",
      startSec: 0.9,
      endSec: 1.2,
      mode: "loop" as const,
      label: "L",
    };
    expect(applyPlaybackRangeTick(1.25, active)).toEqual({
      action: "loop",
      seekSec: 0.9,
    });
  });

  it("invalid HILT end ignored in duration helper", () => {
    expect(highlightDurationMs({ startMs: 100, endMs: 50 })).toBeNull();
  });
});

describe("HILT in container", () => {
  it("roundtrips highlights for player", () => {
    const buf = writeMp5({
      head: {
        codecId: CodecId.PCM,
        channels: 1,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 44100,
        totalSamples: 1000n,
        encoderVersion: 1,
      },
      meta: [{ key: "title", value: "t" }],
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(2000) }],
      seek: [{ sampleOffset: 0n, byteOffset: 0n }],
      optional: new Map([
        [
          "HILT",
          encodeHilt({
            highlights: [
              { startMs: 0, endMs: 300, useCase: "preview", label: "P" },
            ],
          }),
        ],
      ]),
    });
    const hilt = decodeHilt(parseMp5(buf).optional.get("HILT"));
    expect(hilt?.highlights[0]?.useCase).toBe("preview");
  });
});
