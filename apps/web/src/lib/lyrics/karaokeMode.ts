import type { StemDescriptor, StemType } from "@mp5/container";
import type { LyricSyncedLine } from "@mp5/container";

const VOCAL_STEM_TYPES: StemType[] = [
  "lead_vocals",
  "background_vocals",
  "acapella",
];

export interface KaraokeAvailability {
  hasSyncedLyrics: boolean;
  audioAvailable: boolean;
  instrumentalStemId: string | null;
  vocalStemIds: string[];
  reason?: string;
}

export function assessKaraokeAvailability(
  synced: LyricSyncedLine[] | undefined,
  stems: StemDescriptor[] | undefined,
): KaraokeAvailability {
  const hasSyncedLyrics = (synced?.length ?? 0) > 0;
  const list = stems ?? [];
  const instrumental = list.find((s) => s.stemType === "instrumental");
  const vocals = list.filter((s) => VOCAL_STEM_TYPES.includes(s.stemType));

  const audioAvailable = !!instrumental || vocals.length > 0;

  if (!hasSyncedLyrics) {
    return {
      hasSyncedLyrics: false,
      audioAvailable,
      instrumentalStemId: instrumental?.stemId ?? null,
      vocalStemIds: vocals.map((v) => v.stemId),
      reason: "No synced lyrics embedded",
    };
  }

  if (!audioAvailable) {
    return {
      hasSyncedLyrics: true,
      audioAvailable: false,
      instrumentalStemId: null,
      vocalStemIds: [],
      reason: "No instrumental or vocal stems for karaoke audio",
    };
  }

  return {
    hasSyncedLyrics: true,
    audioAvailable: true,
    instrumentalStemId: instrumental?.stemId ?? null,
    vocalStemIds: vocals.map((v) => v.stemId),
  };
}

/** Initial stem UI for karaoke: mute vocals or solo instrumental. */
export function karaokeStemUiPreset(
  stems: StemDescriptor[],
  availability: KaraokeAvailability,
): Map<string, { muted: boolean; solo: boolean }> {
  const map = new Map<string, { muted: boolean; solo: boolean }>();
  for (const s of stems) {
    map.set(s.stemId, { muted: false, solo: false });
  }
  if (availability.instrumentalStemId) {
    for (const s of stems) {
      map.set(s.stemId, {
        muted: s.stemId !== availability.instrumentalStemId,
        solo: s.stemId === availability.instrumentalStemId,
      });
    }
    return map;
  }
  for (const id of availability.vocalStemIds) {
    map.set(id, { muted: true, solo: false });
  }
  return map;
}

export function isVocalStemType(type: StemType): boolean {
  return VOCAL_STEM_TYPES.includes(type);
}
