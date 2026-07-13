import type { AiSettings } from "./aiSettings";
import { cloudAiConfigured } from "./aiSettings";
import { providerSupportsAudio } from "./providers/cloudAudioCall";
import { getAiProvider } from "./aiProviders";
import { pcmDurationSec, planSequentialClips } from "./pcmToWavClip";

const STRUCTURE_CHUNK_SEC = 90;
const STRUCTURE_MAX_CHUNKS = 8;
const LYRICS_CHUNK_SEC = 120;
const LYRICS_MAX_CHUNKS = 8;

export interface AiAnalysisProgress {
  label: string;
  detail?: string;
  step: number;
  totalSteps: number;
  percent: number;
}

export interface AiAnalysisStepReporter {
  start(label: string, detail?: string): void;
  done(): void;
  complete(label?: string): void;
}

export function formatClipRange(startSec: number, maxSec: number): string {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };
  return `${fmt(startSec)}–${fmt(startSec + maxSec)}`;
}

/** Estimate how many progress steps an analysis run will take. */
export function estimateAiAnalysisSteps(
  settings: AiSettings,
  durationSec: number,
): number {
  let steps = 0;
  if (settings.enabled && settings.localBeat) steps++;

  if (!settings.enabled || !cloudAiConfigured(settings)) return Math.max(steps, 1);

  const provider = getAiProvider(settings.providerId);
  const useAudio = provider
    ? providerSupportsAudio(settings.providerId, provider.apiStyle)
    : false;

  if (settings.cloudBeat || settings.cloudStructure) {
    if (settings.cloudStructure && useAudio) {
      steps += planSequentialClips(durationSec, STRUCTURE_CHUNK_SEC, STRUCTURE_MAX_CHUNKS).length;
    } else {
      steps += 1;
    }
  }

  if (settings.cloudLyrics) {
    if (useAudio) {
      steps += planSequentialClips(durationSec, LYRICS_CHUNK_SEC, LYRICS_MAX_CHUNKS).length;
    } else {
      steps += 1;
    }
  }

  if (settings.cloudMoodVibe || settings.cloudSummary || settings.cloudContentWarnings) {
    steps++;
  }

  return Math.max(steps, 1);
}

export function createAiProgressReporter(
  totalSteps: number,
  onProgress?: (progress: AiAnalysisProgress) => void,
): AiAnalysisStepReporter {
  let completed = 0;
  let lastLabel = "Analyzing…";

  const emit = (label: string, detail: string | undefined, percent: number) => {
    onProgress?.({
      label,
      detail,
      step: Math.min(completed + 1, totalSteps),
      totalSteps,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
    });
  };

  return {
    start(label, detail) {
      lastLabel = label;
      emit(label, detail, totalSteps ? (completed / totalSteps) * 100 : 0);
    },
    done() {
      completed++;
      emit(lastLabel, undefined, totalSteps ? (completed / totalSteps) * 100 : 100);
    },
    complete(label = "Analysis complete") {
      completed = totalSteps;
      emit(label, undefined, 100);
    },
  };
}

export function pcmDurationFromInput(
  pcm: Int16Array,
  sampleRate: number,
  channels: number,
): number {
  return pcmDurationSec(pcm, sampleRate, channels);
}
