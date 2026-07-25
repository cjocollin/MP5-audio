import type { BeatPayload, SectPayload, SectType, SongSection } from "@mp5/container";
import type { AiSettings } from "../aiSettings";
import { extractJsonObject } from "../cloudJson";
import { formatClipRange, type AiAnalysisStepReporter } from "../aiAnalysisProgress";
import { getAiProvider } from "../aiProviders";
import { bytesToBase64, pcmDurationSec, pcmToWavClip, pcmToWavClipRange, planSequentialClips, type PcmClipRange } from "../pcmToWavClip";
import { mergeSongSections, offsetSongSections } from "../mergeCloudResults";
import { callCloudWithOptionalAudio, providerSupportsAudio } from "./cloudAudioCall";
import type { CloudMetadataContext } from "./cloudMetadata";

const ANALYZER_ID = "mp5-audio-cloud";
const STRUCTURE_CHUNK_SEC = 90;
const STRUCTURE_MAX_CHUNKS = 8;
const BPM_CLIP_SEC = 30;

export interface CloudAudioAnalysisOptions {
  bpm?: boolean;
  key?: boolean;
  structure?: boolean;
}

export interface CloudAudioAnalysisResult {
  beat?: BeatPayload;
  sect?: SectPayload;
}

interface CloudSectionJson {
  type?: string;
  startMs?: number;
  endMs?: number;
  title?: string;
}

interface CloudAudioJson {
  bpm?: number;
  key?: string;
  timeSignature?: string;
  confidence?: number;
  sections?: CloudSectionJson[];
}

const SECT_TYPE_MAP: Record<string, SectType> = {
  intro: "intro",
  verse: "verse",
  pre_chorus: "pre_chorus",
  prechorus: "pre_chorus",
  "pre-chorus": "pre_chorus",
  chorus: "chorus",
  post_chorus: "post_chorus",
  postchorus: "post_chorus",
  bridge: "bridge",
  drop: "drop",
  hook: "hook",
  breakdown: "breakdown",
  solo: "solo",
  outro: "outro",
  silence: "silence",
  custom: "custom",
};

function normalizeSectType(raw: string): SectType {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  return SECT_TYPE_MAP[t] ?? "custom";
}

function parsePositiveMs(n: unknown): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

export function parseCloudAudioSections(raw: unknown): SongSection[] {
  if (!Array.isArray(raw)) return [];
  const sections: SongSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as CloudSectionJson;
    const startMs = parsePositiveMs(row.startMs);
    if (startMs == null) continue;
    const type = normalizeSectType(typeof row.type === "string" ? row.type : "custom");
    const title = typeof row.title === "string" ? row.title.trim().slice(0, 64) : "";
    const endMs = parsePositiveMs(row.endMs);
    sections.push({
      sectionId: `sect-${sections.length + 1}`,
      type,
      startMs,
      ...(endMs != null && endMs > startMs ? { endMs } : {}),
      ...(title ? { title, label: title } : {}),
      source: "ai",
    });
  }
  sections.sort((a, b) => a.startMs - b.startMs);
  return sections;
}

export function parseCloudAudioBeat(
  parsed: CloudAudioJson,
  settings: Pick<AiSettings, "providerId" | "model">,
  wantKey: boolean,
): BeatPayload | null {
  const bpm = typeof parsed.bpm === "number" && Number.isFinite(parsed.bpm) ? parsed.bpm : undefined;
  if (bpm == null || bpm < 40 || bpm > 220) return null;

  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : undefined;

  const key =
    wantKey && typeof parsed.key === "string" && parsed.key.trim()
      ? parsed.key.trim().slice(0, 24)
      : undefined;

  const providerLabel = getAiProvider(settings.providerId)?.label ?? settings.providerId;

  return {
    bpm: Math.round(bpm * 10) / 10,
    ...(key ? { key } : {}),
    timeSignature: typeof parsed.timeSignature === "string" ? parsed.timeSignature : "4/4",
    confidence,
    source: "ai-cloud",
    analyzer: `${ANALYZER_ID}/${providerLabel}/${settings.model}`,
  };
}

function buildAudioPrompt(
  ctx: CloudMetadataContext,
  opts: CloudAudioAnalysisOptions,
  localHintBpm?: number,
  clip?: PcmClipRange,
  durationSec?: number,
): string {
  const keys: string[] = [];
  if (opts.bpm) keys.push("bpm (number, quarter-note tempo 40-220)");
  if (opts.key) keys.push('key (string like "Am" or "F# major")');
  if (opts.bpm) keys.push("timeSignature (string like 4/4)", "confidence (0-1)");
  if (opts.structure) {
    keys.push(
      "sections (array of { type, startMs, endMs?, title? }; type one of intro, verse, pre_chorus, chorus, bridge, hook, outro, custom)",
    );
  }

  const segmentNote =
    clip && durationSec != null
      ? `Audio segment ${clip.index + 1}/${clip.total}, starts at ${Math.round(clip.startSec)}s in a ${Math.round(durationSec)}s track.`
      : "";

  return [
    "Listen to the attached audio clip and analyze the music.",
    segmentNote,
    `Return JSON only with keys: ${keys.join(", ")}.`,
    opts.bpm
      ? "Use quarter-note BPM (typical pop/rock kick pulse), not double-time hi-hat rate. Prefer slower musical pulse if unsure."
      : "",
    opts.structure
      ? "Mark every major section heard in THIS segment. Use startMs/endMs in milliseconds relative to THIS segment start (0 = segment start). Include all verses, choruses, bridges, and outro you hear."
      : "",
    "",
    `Title: ${ctx.title || "Unknown"}`,
    `Artist: ${ctx.artist || "Unknown"}`,
    ctx.album ? `Album: ${ctx.album}` : "",
    ctx.genre ? `Genre: ${ctx.genre}` : "",
    localHintBpm != null && opts.bpm ? `Local analyzer hint (may be wrong): ${localHintBpm} BPM` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function suggestCloudAudioAnalysis(
  pcm: Int16Array,
  sampleRate: number,
  channels: number,
  ctx: CloudMetadataContext,
  settings: Pick<AiSettings, "providerId" | "apiKey" | "apiBaseUrl" | "model">,
  opts: CloudAudioAnalysisOptions,
  localHintBpm?: number,
  progress?: AiAnalysisStepReporter,
): Promise<CloudAudioAnalysisResult> {
  const wantBpm = opts.bpm === true;
  const wantKey = opts.key === true;
  const wantStructure = opts.structure === true;
  if (!wantBpm && !wantKey && !wantStructure) return {};

  if (!settings.apiKey.trim()) {
    throw new Error("Add an API key in Settings to use cloud audio analysis.");
  }
  if (!settings.model.trim()) {
    throw new Error("Choose a cloud model in Settings.");
  }

  const provider = getAiProvider(settings.providerId) ?? getAiProvider("openai")!;
  const durationSec = pcmDurationSec(pcm, sampleRate, channels);
  const useAudio = providerSupportsAudio(settings.providerId, provider.apiStyle);

  const out: CloudAudioAnalysisResult = {};

  if (useAudio && wantStructure) {
    const clips = planSequentialClips(durationSec, STRUCTURE_CHUNK_SEC, STRUCTURE_MAX_CHUNKS);
    const bpmClipIdx = wantBpm ? Math.min(clips.length - 1, Math.floor(clips.length * 0.25)) : -1;
    const sectionChunks: ReturnType<typeof parseCloudAudioSections>[] = [];

    for (const clip of clips) {
      const includesBpm = wantBpm && clip.index === bpmClipIdx;
      progress?.start(
        `Song structure · part ${clip.index + 1} of ${clip.total}`,
        `Sending ${formatClipRange(clip.startSec, clip.maxSec)} to your AI provider${includesBpm ? " (includes BPM/key)" : ""}. Waiting for response…`,
      );

      const wav = pcmToWavClipRange(pcm, sampleRate, channels, clip.startSec, clip.maxSec);
      const wavBase64 = wav.length > 0 ? bytesToBase64(wav) : undefined;
      if (!wavBase64) continue;

      const chunkOpts: CloudAudioAnalysisOptions = {
        bpm: wantBpm && clip.index === bpmClipIdx,
        key: wantKey && clip.index === bpmClipIdx,
        structure: true,
      };

      const prompt = buildAudioPrompt(ctx, chunkOpts, localHintBpm, clip, durationSec);
      const content = await callCloudWithOptionalAudio(settings, prompt, wavBase64);
      const parsed = extractJsonObject<CloudAudioJson>(content);
      if (!parsed) throw new Error(`Cloud AI audio segment ${clip.index + 1} was not valid JSON.`);

      if (chunkOpts.bpm) {
        const beat = parseCloudAudioBeat(parsed, settings, wantKey || wantBpm);
        if (beat) out.beat = beat;
      } else if (chunkOpts.key && typeof parsed.key === "string" && parsed.key.trim() && !out.beat) {
        const providerLabel = getAiProvider(settings.providerId)?.label ?? settings.providerId;
        out.beat = {
          key: parsed.key.trim().slice(0, 24),
          source: "ai-cloud",
          analyzer: `${ANALYZER_ID}/${providerLabel}/${settings.model}`,
        };
      }

      const sections = offsetSongSections(
        parseCloudAudioSections(parsed.sections),
        Math.round(clip.startSec * 1000),
      );
      if (sections.length) sectionChunks.push(sections);
      progress?.done();
    }

    const merged = mergeSongSections(sectionChunks);
    if (merged.length) {
      out.sect = { version: 1, sections: merged, source: "ai-cloud" };
    }

    return out;
  }

  if (!useAudio) {
    throw new Error(
      "Cloud audio analysis requires an audio-capable provider (Google Gemini or OpenAI). Text-only BPM/key invention is disabled.",
    );
  }

  const wav = pcmToWavClip(pcm, sampleRate, channels, BPM_CLIP_SEC, 0.25);
  const wavBase64 = wav.length > 0 ? bytesToBase64(wav) : undefined;
  if (!wavBase64) {
    throw new Error("Could not prepare an audio clip for cloud analysis.");
  }

  const promptOpts: CloudAudioAnalysisOptions = {
    bpm: wantBpm,
    key: wantKey || wantBpm,
    structure: wantStructure,
  };

  const prompt = buildAudioPrompt(ctx, promptOpts, localHintBpm);

  progress?.start(
    wantStructure ? "Cloud audio analysis" : "Cloud BPM and key",
    "Sending a ~30s audio clip to your AI provider. Waiting for response…",
  );

  const content = await callCloudWithOptionalAudio(settings, prompt, wavBase64);
  const parsed = extractJsonObject<CloudAudioJson>(content);
  if (!parsed) throw new Error("Cloud AI audio response was not valid JSON.");

  if (wantBpm) {
    const beat = parseCloudAudioBeat(parsed, settings, wantKey || wantBpm);
    if (beat) out.beat = beat;
  } else if (wantKey && typeof parsed.key === "string" && parsed.key.trim()) {
    const providerLabel = getAiProvider(settings.providerId)?.label ?? settings.providerId;
    out.beat = {
      key: parsed.key.trim().slice(0, 24),
      source: "ai-cloud",
      analyzer: `${ANALYZER_ID}/${providerLabel}/${settings.model}`,
    };
  }

  if (wantStructure) {
    const sections = parseCloudAudioSections(parsed.sections);
    if (sections.length) {
      out.sect = {
        version: 1,
        sections,
        source: "ai-cloud",
      };
    }
  }

  progress?.done();
  return out;
}

/** @deprecated Use suggestCloudAudioAnalysis — kept for tests and narrow BPM-only callers. */
export async function suggestCloudBeat(
  pcm: Int16Array,
  sampleRate: number,
  channels: number,
  ctx: CloudMetadataContext,
  settings: Pick<AiSettings, "providerId" | "apiKey" | "apiBaseUrl" | "model">,
  localHintBpm?: number,
): Promise<BeatPayload | null> {
  const result = await suggestCloudAudioAnalysis(
    pcm,
    sampleRate,
    channels,
    ctx,
    settings,
    { bpm: true, key: true },
    localHintBpm,
  );
  return result.beat ?? null;
}
