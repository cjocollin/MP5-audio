import { describe, expect, it } from "vitest";
import {
  parseCloudAudioBeat,
  parseCloudAudioSections,
} from "../apps/web/src/lib/ai/providers/cloudAudioAnalysis";
import { parseCloudLyricsJson } from "../apps/web/src/lib/ai/providers/cloudLyrics";
import { extractJsonObject } from "../apps/web/src/lib/ai/cloudJson";
import { sanitizeLyricLine, sanitizeUnsyncedLyrics } from "../apps/web/src/lib/ai/lyricSanitize";
import { mergeLyrcPayloads, mergeSongSections, offsetSongSections } from "../apps/web/src/lib/ai/mergeCloudResults";
import { estimateAiAnalysisSteps } from "../apps/web/src/lib/ai/aiAnalysisProgress";
import { providerSupportsAudio } from "../apps/web/src/lib/ai/providers/cloudAudioCall";
import { DEFAULT_AI_SETTINGS } from "../apps/web/src/lib/ai/aiSettings";
import { planSequentialClips } from "../apps/web/src/lib/ai/pcmToWavClip";

describe("cloud AI JSON parsing", () => {
  it("extracts JSON from fenced model output", () => {
    const raw = 'Here you go:\n```json\n{"bpm": 82, "key": "Am"}\n```';
    const parsed = extractJsonObject<{ bpm?: number; key?: string }>(raw);
    expect(parsed?.bpm).toBe(82);
    expect(parsed?.key).toBe("Am");
  });

  it("parses cloud audio beat with key", () => {
    const beat = parseCloudAudioBeat(
      { bpm: 128.4, key: "F# minor", timeSignature: "4/4", confidence: 0.9 },
      { providerId: "gemini", model: "gemini-3.5-flash" },
      true,
    );
    expect(beat?.bpm).toBe(128.4);
    expect(beat?.key).toBe("F# minor");
    expect(beat?.source).toBe("ai-cloud");
  });

  it("parses cloud sections with normalized types", () => {
    const sections = parseCloudAudioSections([
      { type: "intro", startMs: 0, endMs: 12000, title: "Intro" },
      { type: "pre-chorus", startMs: 45000, endMs: 52000, title: "Pre" },
      { type: "chorus", startMs: 52000, endMs: 78000 },
    ]);
    expect(sections).toHaveLength(3);
    expect(sections[0]?.type).toBe("intro");
    expect(sections[1]?.type).toBe("pre_chorus");
    expect(sections[2]?.type).toBe("chorus");
    expect(sections[0]?.source).toBe("ai");
  });

  it("parses cloud lyrics unsynced and synced", () => {
    const lyrc = parseCloudLyricsJson({
      unsynced: "Line one\nLine two",
      synced: [
        { timeMs: 1500, text: "Line one", section: "Verse" },
        { timeMs: 4200, text: "Line two" },
      ],
    });
    expect(lyrc?.unsynced).toContain("Line one");
    expect(lyrc?.synced).toHaveLength(2);
    expect(lyrc?.synced?.[0]?.timeMs).toBe(1500);
  });

  it("strips |Intro-style markers from lyrics", () => {
    const lyrc = parseCloudLyricsJson({
      unsynced: "|Intro\nFirst line\n|Verse\nSecond line",
      synced: [
        { timeMs: 0, text: "|Intro" },
        { timeMs: 1000, text: "First line" },
        { timeMs: 2000, text: "Second line |Chorus" },
      ],
    });
    expect(lyrc?.unsynced).toBe("First line\nSecond line");
    expect(lyrc?.synced?.map((l) => l.text)).toEqual(["First line", "Second line"]);
  });

  it("estimates analysis steps for long tracks with cloud features", () => {
    const settings = {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      apiKey: "test-key",
      localBeat: true,
      cloudStructure: true,
      cloudLyrics: true,
      cloudMoodVibe: true,
      providerId: "gemini",
    };
    const steps = estimateAiAnalysisSteps(settings, 300);
    expect(steps).toBeGreaterThan(4);
  });

  it("plans sequential clips for long tracks", () => {
    const clips = planSequentialClips(300, 120, 8);
    expect(clips).toHaveLength(3);
    expect(clips[2]?.startSec).toBe(240);
  });

  it("merges structure segments with offsets", () => {
    const merged = mergeSongSections([
      offsetSongSections(parseCloudAudioSections([{ type: "intro", startMs: 0, endMs: 10000 }]), 0),
      offsetSongSections(parseCloudAudioSections([{ type: "chorus", startMs: 0, endMs: 20000 }]), 90000),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.startMs).toBe(90000);
  });

  it("merges lyric chunks with offsets", () => {
    const merged = mergeLyrcPayloads([
      { offsetMs: 0, lyrc: { unsynced: "Line A", synced: [{ timeMs: 1000, text: "Line A" }] } },
      { offsetMs: 120000, lyrc: { unsynced: "Line B", synced: [{ timeMs: 500, text: "Line B" }] } },
    ]);
    expect(merged?.unsynced).toContain("Line A");
    expect(merged?.synced?.[1]?.timeMs).toBe(120500);
  });

  it("sanitizes standalone section labels", () => {
    expect(sanitizeUnsyncedLyrics("|Intro\nHello\n[Chorus]\nWorld")).toBe("Hello\nWorld");
    expect(sanitizeLyricLine("|Verse").isSectionOnly).toBe(true);
  });

  it("rejects non-audio providers for lyrics transcription", () => {
    expect(providerSupportsAudio("anthropic", "anthropic")).toBe(false);
    expect(providerSupportsAudio("gemini", "gemini")).toBe(true);
    expect(providerSupportsAudio("openai", "openai")).toBe(true);
  });
});
