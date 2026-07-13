import type { LyrcPayload, LyricSyncedLine } from "@mp5/container";
import type { AiSettings } from "../aiSettings";
import { extractJsonObject } from "../cloudJson";
import { formatClipRange, type AiAnalysisStepReporter } from "../aiAnalysisProgress";
import { mergeLyrcPayloads } from "../mergeCloudResults";
import { sanitizeLyricLine, sanitizeUnsyncedLyrics } from "../lyricSanitize";
import { getAiProvider } from "../aiProviders";
import {
  bytesToBase64,
  pcmDurationSec,
  pcmToWavClipRange,
  planSequentialClips,
  type PcmClipRange,
} from "../pcmToWavClip";
import { callCloudLyricsTranscription, providerSupportsAudio } from "./cloudAudioCall";

const ANALYZER_ID = "mp5-lyrics-cloud";
const LYRICS_CHUNK_SEC = 120;
const LYRICS_MAX_CHUNKS = 8;

interface CloudLyricsJson {
  unsynced?: string;
  synced?: { timeMs?: number; text?: string; section?: string }[];
}

function parsePositiveMs(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function parseCloudLyricsJson(parsed: CloudLyricsJson): LyrcPayload | null {
  const unsyncedRaw =
    typeof parsed.unsynced === "string" && parsed.unsynced.trim() ? parsed.unsynced.trim() : "";
  const unsynced = unsyncedRaw
    ? sanitizeUnsyncedLyrics(unsyncedRaw).slice(0, 256 * 1024)
    : undefined;

  const synced: LyricSyncedLine[] = [];
  let pendingSection: string | undefined;

  if (Array.isArray(parsed.synced)) {
    for (const row of parsed.synced) {
      if (!row || typeof row !== "object") continue;
      const timeMs = parsePositiveMs(row.timeMs);
      if (timeMs == null) continue;

      const rawText = typeof row.text === "string" ? row.text : "";
      const rowSection =
        typeof row.section === "string" && row.section.trim()
          ? row.section.trim().slice(0, 48)
          : undefined;

      const cleaned = sanitizeLyricLine(rawText);
      const section = rowSection ?? cleaned.section ?? pendingSection;
      if (cleaned.isSectionOnly) {
        if (cleaned.section) pendingSection = cleaned.section;
        else if (rowSection) pendingSection = rowSection;
        continue;
      }
      if (cleaned.section) pendingSection = cleaned.section;

      if (!cleaned.text) continue;
      synced.push({
        timeMs,
        text: cleaned.text.slice(0, 512),
        ...(section ? { section } : {}),
      });
    }
    synced.sort((a, b) => a.timeMs - b.timeMs);
  }

  if (!unsynced && !synced.length) return null;

  return {
    ...(unsynced ? { unsynced } : {}),
    ...(synced.length ? { synced } : {}),
    source: "ai-cloud",
  };
}

/** Prompt for verbatim audio transcription — intentionally omits title/artist to avoid lyric hallucination. */
function buildLyricsPrompt(clip: PcmClipRange, durationSec: number): string {
  return [
    "Listen to the attached audio and transcribe ONLY words that are sung or spoken in this clip.",
    `Segment ${clip.index + 1} of ${clip.total} · starts at ${Math.round(clip.startSec)}s in a ${Math.round(durationSec)}s track.`,
    'Return JSON: { "unsynced": string, "synced": [{ "timeMs": number, "text": string }] }',
    "Rules:",
    "- VERBATIM from this audio only. Do NOT use song title, artist, album, or lyrics you remember from the internet.",
    "- Do NOT invent, rewrite, or 'correct' lyrics. If a word is unclear, write [unclear] or skip the line.",
    "- If this segment has no vocals (instrumental only), return { \"unsynced\": \"\", \"synced\": [] }.",
    "- unsynced: one heard lyric line per row for this segment.",
    "- synced: optional timestamps in ms from this segment start (0). Omit section labels.",
    "- No markdown, no section tags (Intro/Verse/Chorus) in lyric text.",
    clip.index > 0
      ? "- This continues a longer track — transcribe only what is sung in THIS clip."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function transcribeLyricsChunk(
  pcm: Int16Array,
  sampleRate: number,
  channels: number,
  settings: Pick<AiSettings, "providerId" | "apiKey" | "apiBaseUrl" | "model">,
  clip: PcmClipRange,
  durationSec: number,
): Promise<LyrcPayload | null> {
  const wav = pcmToWavClipRange(pcm, sampleRate, channels, clip.startSec, clip.maxSec);
  const wavBase64 = wav.length > 0 ? bytesToBase64(wav) : undefined;
  if (!wavBase64) return null;

  const prompt = buildLyricsPrompt(clip, durationSec);
  const content = await callCloudLyricsTranscription(settings, prompt, wavBase64);
  const parsed = extractJsonObject<CloudLyricsJson>(content);
  if (!parsed) throw new Error(`Cloud AI lyrics segment ${clip.index + 1} was not valid JSON.`);

  return parseCloudLyricsJson(parsed);
}

export async function suggestCloudLyrics(
  pcm: Int16Array,
  sampleRate: number,
  channels: number,
  _ctx: import("./cloudMetadata").CloudMetadataContext,
  settings: Pick<AiSettings, "providerId" | "apiKey" | "apiBaseUrl" | "model">,
  progress?: AiAnalysisStepReporter,
): Promise<LyrcPayload | null> {
  if (!settings.apiKey.trim()) {
    throw new Error("Add an API key in Settings to use cloud lyrics transcription.");
  }
  if (!settings.model.trim()) {
    throw new Error("Choose a cloud model in Settings.");
  }

  const provider = getAiProvider(settings.providerId) ?? getAiProvider("openai")!;
  if (!providerSupportsAudio(settings.providerId, provider.apiStyle)) {
    throw new Error(
      "Cloud lyrics requires Google Gemini or OpenAI with audio support. Claude, DeepSeek, and other text-only providers will guess lyrics incorrectly — switch provider in Settings.",
    );
  }

  const durationSec = pcmDurationSec(pcm, sampleRate, channels);
  const clips = planSequentialClips(durationSec, LYRICS_CHUNK_SEC, LYRICS_MAX_CHUNKS);
  const parts: { offsetMs: number; lyrc: LyrcPayload }[] = [];

  for (const clip of clips) {
    progress?.start(
      `Lyrics · part ${clip.index + 1} of ${clip.total}`,
      `Transcribing ${formatClipRange(clip.startSec, clip.maxSec)} verbatim from audio. Waiting for AI…`,
    );

    const lyrc = await transcribeLyricsChunk(pcm, sampleRate, channels, settings, clip, durationSec);
    if (lyrc) {
      parts.push({ offsetMs: Math.round(clip.startSec * 1000), lyrc });
    }
    progress?.done();
  }

  const merged = mergeLyrcPayloads(parts);
  if (!merged) return null;

  const providerLabel = getAiProvider(settings.providerId)?.label ?? settings.providerId;
  return {
    ...merged,
    source: `${ANALYZER_ID}/${providerLabel}/${settings.model}`,
  };
}
