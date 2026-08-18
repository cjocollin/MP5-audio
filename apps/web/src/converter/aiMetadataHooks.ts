import type {
  BeatPayload,
  CoverArt,
  ExplPayload,
  LyrcPayload,
  MoodPayload,
  SafePayload,
  SectPayload,
  SummPayload,
  VisuPayload,
  VibePayload,
} from "@mp5/container";
import {
  createAiProgressReporter,
  estimateAiAnalysisSteps,
  pcmDurationFromInput,
  type AiAnalysisProgress,
} from "../lib/ai/aiAnalysisProgress";
import { loadAiSettings, cloudAiConfigured } from "../lib/ai/aiSettings";
import { getAiProvider } from "../lib/ai/aiProviders";
import { analyzeBeatFromPcm } from "../lib/ai/providers/localBeat";
import { suggestCloudAudioAnalysis } from "../lib/ai/providers/cloudAudioAnalysis";
import { suggestCloudLyrics } from "../lib/ai/providers/cloudLyrics";
import { suggestCloudMetadata, type CloudMetadataContext } from "../lib/ai/providers/cloudMetadata";
import { deriveCoverPalette, suggestCoverThemeName } from "../lib/visualTheme/coverPalette";

export type { AiAnalysisProgress } from "../lib/ai/aiAnalysisProgress";

export interface AiMetadataSuggestions {
  beat?: BeatPayload;
  beatCloud?: BeatPayload;
  sect?: SectPayload;
  lyrc?: LyrcPayload;
  expl?: ExplPayload;
  safe?: SafePayload;
  mood?: MoodPayload;
  vibe?: VibePayload;
  summ?: SummPayload;
  visu?: VisuPayload;
  coverPaletteError?: string;
  cloudBeatError?: string;
  cloudStructureError?: string;
  cloudLyricsError?: string;
  cloudContentWarningsError?: string;
}

export interface AiEnrichmentInput {
  pcm: Int16Array;
  sampleRate: number;
  channels: number;
  cover?: CoverArt;
  context: CloudMetadataContext;
  onProgress?: (progress: AiAnalysisProgress) => void;
}

function hasAnyCloudTextFeature(settings: ReturnType<typeof loadAiSettings>): boolean {
  return settings.cloudMoodVibe || settings.cloudSummary || settings.cloudContentWarnings;
}

function cloudMetadataStepLabel(settings: ReturnType<typeof loadAiSettings>): string {
  const parts: string[] = [];
  if (settings.cloudMoodVibe) parts.push("mood/vibe");
  if (settings.cloudSummary) parts.push("summary");
  if (settings.cloudContentWarnings) parts.push("content warnings");
  return `Cloud ${parts.join(", ")}…`;
}

function cloudMetadataStepDetail(settings: ReturnType<typeof loadAiSettings>): string {
  const provider = getAiProvider(settings.providerId)?.label ?? "AI provider";
  return `Sending title, artist, and lyrics excerpt to ${provider} (text only).`;
}

export async function enrichWithAi(input: AiEnrichmentInput): Promise<AiMetadataSuggestions> {
  const settings = loadAiSettings();
  if (!settings.enabled) return {};

  const durationSec = pcmDurationFromInput(input.pcm, input.sampleRate, input.channels);
  const totalSteps = estimateAiAnalysisSteps(settings, durationSec, input.cover ? 1 : 0);
  const progress = createAiProgressReporter(totalSteps, input.onProgress);

  const out: AiMetadataSuggestions = {};

  if (input.cover) {
    progress.start("Local cover palette", "Extracting theme colors on-device — no artwork upload.");
    try {
      const palette = await deriveCoverPalette(input.cover);
      out.visu = {
        ...palette,
        themeName: suggestCoverThemeName(palette, input.context),
        visualIntensity: "medium",
        playerStyle: "custom",
        coverArtDerived: true,
        source: "app",
      };
    } catch (err) {
      out.coverPaletteError = err instanceof Error ? err.message : String(err);
    }
    progress.done();
  }

  if (settings.localBeat) {
    progress.start("Local tempo analysis", "Estimating BPM on-device — no API call.");
    const beat = analyzeBeatFromPcm(input.pcm, input.sampleRate, input.channels);
    if (beat) out.beat = beat;
    progress.done();
  }

  const cloudReady = cloudAiConfigured(settings);
  const wantCloudAudio = settings.cloudBeat || settings.cloudStructure;

  if (cloudReady && wantCloudAudio) {
    try {
      const audio = await suggestCloudAudioAnalysis(
        input.pcm,
        input.sampleRate,
        input.channels,
        input.context,
        settings,
        {
          bpm: settings.cloudBeat,
          key: settings.cloudBeat,
          structure: settings.cloudStructure,
        },
        out.beat?.bpm,
        progress,
      );
      if (audio.beat) out.beatCloud = audio.beat;
      if (audio.sect) out.sect = audio.sect;
      if (settings.cloudBeat && !audio.beat) {
        out.cloudBeatError = "Cloud AI returned no tempo.";
      }
      if (settings.cloudStructure && !audio.sect?.sections.length) {
        out.cloudStructureError = "Cloud AI returned no song sections.";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (settings.cloudBeat) out.cloudBeatError = msg;
      if (settings.cloudStructure) out.cloudStructureError = msg;
      if (!hasAnyCloudTextFeature(settings) && !settings.cloudLyrics) throw err;
    }
  }

  if (cloudReady && settings.cloudLyrics) {
    try {
      const lyrc = await suggestCloudLyrics(
        input.pcm,
        input.sampleRate,
        input.channels,
        input.context,
        settings,
        progress,
      );
      if (lyrc) out.lyrc = lyrc;
      else out.cloudLyricsError = "Cloud AI returned no lyrics.";
    } catch (err) {
      out.cloudLyricsError = err instanceof Error ? err.message : String(err);
      if (!hasAnyCloudTextFeature(settings) && !wantCloudAudio) throw err;
    }
  }

  if (cloudReady && hasAnyCloudTextFeature(settings)) {
    try {
      progress.start(cloudMetadataStepLabel(settings), cloudMetadataStepDetail(settings));
      const cloud = await suggestCloudMetadata(input.context, settings, {
        moodVibe: settings.cloudMoodVibe,
        summary: settings.cloudSummary,
        contentWarnings: settings.cloudContentWarnings,
      });
      progress.done();
      if (cloud.mood) out.mood = cloud.mood;
      if (cloud.vibe) out.vibe = cloud.vibe;
      if (cloud.summ) out.summ = cloud.summ;
      if (cloud.expl) out.expl = cloud.expl;
      if (cloud.safe) out.safe = cloud.safe;
      if (settings.cloudContentWarnings && !cloud.expl && !cloud.safe) {
        out.cloudContentWarningsError = "Cloud AI returned no content warnings.";
      }
    } catch (err) {
      progress.done();
      if (settings.cloudContentWarnings) {
        out.cloudContentWarningsError = err instanceof Error ? err.message : String(err);
      }
      if (settings.cloudMoodVibe || settings.cloudSummary) throw err;
    }
  }

  progress.complete();
  return out;
}

export function suggestionsToTagString(tags?: string[]): string {
  return (tags ?? []).join(", ");
}

export function beatBpmLabel(beat?: BeatPayload): string {
  if (beat?.bpm == null) return "";
  return String(beat.bpm);
}
