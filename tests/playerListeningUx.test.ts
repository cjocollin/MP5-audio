import { describe, expect, it } from "vitest";
import {
  CodecId,
  metaFieldsFromRecord,
  parseMp5,
  writeMp5,
  type IntegrityCheckResult,
} from "@mp5/container";
import {
  buildNowPlayingSummary,
  buildQueueRowSummary,
  formatTimelineRange,
  playbackStateLabel,
} from "../apps/web/src/player/playerDisplay";
import { lyricLineDisplay, lyricsEmptyMessage, lyricsModeLabel } from "../apps/web/src/lib/lyrics/lyricsDisplay";
import { describeStemControlState } from "../apps/web/src/lib/stems/stemControlUi";
import { resolvePlayerTheme, visuFallbackLabel } from "../apps/web/src/lib/visualTheme/applyVisualTheme";
import { buildBetaDiagnosticsReport } from "../apps/web/src/lib/sessionDiagnostics";

function parsedTrack(meta: Record<string, string> = {}) {
  return parseMp5(
    writeMp5({
      head: {
        codecId: CodecId.MP5L_v3,
        channels: 2,
        bitsPerSample: 16,
        presetId: 0,
        sampleRate: 48000,
        totalSamples: 480000n,
        encoderVersion: 1,
      },
      meta: metaFieldsFromRecord(meta),
      audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(960) }],
    }),
  );
}

function dummyConversion() {
  return {
    singlePhase: "idle" as const,
    singleFileName: null,
    batchRunning: false,
    batchCurrentName: null,
    batchPendingCount: 0,
    cancelGeneration: 0,
    setSinglePhase: () => {},
    setBatchActivity: () => {},
    bumpCancelGeneration: () => 0,
    resetSingle: () => {},
  };
}

describe("player listening UX helpers", () => {
  it("normalizes now playing metadata, source, time, and integrity", () => {
    const parsed = parsedTrack({
      title: "Listening Test",
      artist: "MP5 Band",
      album: "Polish LP",
    });
    const integrity: IntegrityCheckResult = {
      status: "verified",
      hasFingerprint: true,
      hasHashChunk: false,
      chunkChecks: [],
      message: "ok",
    };
    const summary = buildNowPlayingSummary({
      track: {
        id: "t1",
        name: "listening.mp5",
        parsed,
        durationSec: 10,
      },
      parsed,
      currentTimeSec: 2.5,
      durationSec: 10,
      loading: false,
      embeddedHydrating: false,
      integrity,
    });
    expect(summary.title).toBe("Listening Test");
    expect(summary.artist).toBe("MP5 Band");
    expect(summary.album).toBe("Polish LP");
    expect(summary.codecLabel).toBeTruthy();
    expect(summary.sourceLabel).toBe(".mp5");
    expect(summary.currentTimeLabel).toBe("0:02");
    expect(summary.durationLabel).toBe("0:10");
    expect(summary.remainingLabel).toBe("-0:07");
    expect(summary.integrityLabel).toBe("Verified");
  });

  it("labels embedded package hydration in now playing and queue rows", () => {
    const track = {
      id: "track-1",
      name: "01-track.mp5",
      durationSec: 42,
      embeddedAlbum: {
        trackId: "track-1",
        filename: "01-track.mp5",
        display: { title: "Track One", artist: "Album Artist", album: "Package" },
        packageMeta: { albumTitle: "Package" },
      },
    };
    const albumContext = {
      packageTitle: "Package",
      packageKind: "embedded" as const,
      trackNumber: 1,
      trackCount: 2,
    };
    expect(
      buildNowPlayingSummary({
        track,
        albumContext,
        currentTimeSec: 0,
        durationSec: 0,
        loading: true,
        embeddedHydrating: true,
      }).loadingLabel,
    ).toBe("Hydrating embedded track");
    const row = buildQueueRowSummary({
      track,
      index: 0,
      isCurrent: true,
      isPlayingNow: false,
      albumContext,
      isHydrating: true,
    });
    expect(row.sourceLabel).toBe("embedded .mp5p");
    expect(row.albumContextLabel).toBe("Package - track 1/2");
    expect(row.statusLabel).toBe("Hydrating");
    expect(row.metadataPending).toBe(true);
  });

  it("formats playback labels and timeline ranges", () => {
    expect(
      playbackStateLabel({
        readiness: "decoding",
        playState: "preparing",
        hasTrack: true,
      }),
    ).toBe("Decoding audio");
    expect(
      playbackStateLabel({
        readiness: "ready",
        playState: "paused",
        hasTrack: true,
        isEnded: true,
      }),
    ).toBe("Ended");
    expect(formatTimelineRange(61.2, 125)).toEqual({
      current: "1:01",
      duration: "2:05",
      remaining: "-1:03",
    });
  });

  it("describes lyric display context", () => {
    const lines = [
      { timeMs: 0, text: "Intro", section: "Verse" },
      { timeMs: 1000, text: "Current", section: "Verse" },
      { timeMs: 2000, text: "Hook", section: "Hook" },
    ];
    expect(lyricsModeLabel(true, true)).toBe("Karaoke synced");
    expect(lyricsEmptyMessage(true)).toMatch(/No lyrics/i);
    expect(lyricLineDisplay(lines, 0, 1)).toMatchObject({
      tone: "previous",
      sectionLabel: "Verse",
    });
    expect(lyricLineDisplay(lines, 1, 1)).toMatchObject({
      tone: "current",
      sectionLabel: undefined,
    });
    expect(lyricLineDisplay(lines, 2, 1)).toMatchObject({
      tone: "upcoming",
      sectionLabel: "Hook",
    });
  });

  it("describes stem control states clearly", () => {
    expect(
      describeStemControlState({
        selected: true,
        muted: false,
        solo: false,
        loaded: true,
        active: false,
        preparing: false,
        stemMixActive: true,
      }).label,
    ).toBe("Ready, not audible");
    expect(
      describeStemControlState({
        selected: true,
        muted: false,
        solo: false,
        loaded: true,
        active: true,
        preparing: false,
        stemMixActive: true,
      }),
    ).toMatchObject({ label: "Audible", audible: true });
    expect(
      describeStemControlState({
        selected: false,
        muted: false,
        solo: false,
        loaded: false,
        active: false,
        preparing: false,
        availability: "missing_fragments",
        stemMixActive: false,
      }).disabledReason,
    ).toMatch(/missing/i);
  });

  it("labels VISU fallback behavior", () => {
    expect(visuFallbackLabel(null)).toBe("Default visual");
    const theme = resolvePlayerTheme({ themeName: "Calm demo", playerStyle: "calm" });
    expect(visuFallbackLabel(theme)).toBe("VISU: Calm demo");
  });

  it("redacts local paths in player diagnostics", () => {
    const report = buildBetaDiagnosticsReport({
      conversion: dummyConversion(),
      queueLength: 1,
      currentFileLabel: "C:\\Users\\me\\Downloads\\private.mp5",
      decodeCacheSummary: "0/3",
      librarySummary: "0 entries",
      includePlaybackTrace: "load /home/me/secret/private.mp5",
    });
    expect(report).not.toMatch(/C:\\Users|\/home\/me/);
    expect(report).toMatch(/<path>/);
  });
});
