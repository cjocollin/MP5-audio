import type { StemDescriptor, StemType } from "@mp5/container";
import type { KaraokeAvailability } from "./karaokeMode";
import { isVocalStemType } from "./karaokeMode";

export type KaraokeAudioPlan =
  | { mode: "instrumental_only"; stemIds: string[]; message: string }
  | { mode: "mute_vocals"; stemIds: string[]; message: string }
  | { mode: "lyrics_only"; stemIds: []; message: string };

const NON_VOCAL_TYPES: StemType[] = [
  "drums",
  "bass",
  "guitar",
  "piano",
  "synths",
  "strings",
  "percussion",
  "instrumental",
  "effects",
  "custom",
];

export function stemsForKaraokeAudio(
  stems: StemDescriptor[],
  availability: KaraokeAvailability,
): KaraokeAudioPlan {
  if (!availability.hasSyncedLyrics) {
    return {
      mode: "lyrics_only",
      stemIds: [],
      message: "No synced lyrics",
    };
  }

  if (availability.instrumentalStemId) {
    return {
      mode: "instrumental_only",
      stemIds: [availability.instrumentalStemId],
      message: "Karaoke: instrumental stem only (fast path)",
    };
  }

  const nonVocal = stems.filter(
    (s) => !isVocalStemType(s.stemType) && NON_VOCAL_TYPES.includes(s.stemType),
  );
  if (nonVocal.length) {
    return {
      mode: "mute_vocals",
      stemIds: nonVocal.map((s) => s.stemId),
      message:
        "Karaoke: preparing non-vocal stems (no instrumental stem). This may take time on large files.",
    };
  }

  if (availability.vocalStemIds.length) {
    return {
      mode: "lyrics_only",
      stemIds: [],
      message:
        "Synced lyrics only — no instrumental stem. Add an instrumental stem at export for karaoke audio.",
    };
  }

  return {
    mode: "lyrics_only",
    stemIds: [],
    message: "Synced lyrics only — no compatible stems for karaoke audio.",
  };
}
