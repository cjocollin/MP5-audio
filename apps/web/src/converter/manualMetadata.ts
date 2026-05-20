import type { CoverArt, ExplPayload, RecvPayload, SafePayload, SensPayload } from "@mp5/container";
import type { SpecializedProfileId } from "../lib/metadataLabels";
import type { SourceMetadata } from "./extractSourceMetadata";
import type { UserMetadataOverrides } from "./buildExportBundles";

export type { SpecializedProfileId };

export interface ManualMetaFields {
  title: string;
  artist: string;
  album: string;
  albumartist: string;
  genre: string;
  year: string;
  date: string;
  tracknumber: string;
  discnumber: string;
  composer: string;
  comment: string;
}

export interface ManualMetadataEdits {
  meta: ManualMetaFields;
  /** undefined = use detected cover; null = user removed cover */
  cover: CoverArt | null | undefined;
  lyricsUnsynced: string;
  lyricsSource: string;
  expl: {
    explicit: boolean;
    cleanVersionAvailable: boolean;
    strongLanguage: boolean;
    sexualContent: boolean;
    violence: boolean;
    drugReferences: boolean;
    alcoholReferences: boolean;
    selfHarmThemes: boolean;
    traumaThemes: boolean;
    matureThemes: boolean;
  };
  moodTags: string;
  vibeTags: string;
  safe: {
    griefThemes: boolean;
    traumaThemes: boolean;
    intenseEmotional: boolean;
    distressingThemes: boolean;
  };
  sens: {
    suddenLoudSounds: boolean;
    harshFrequencies: boolean;
    intenseBass: boolean;
    sensoryOverloadRisk: boolean;
  };
  specializedProfile: SpecializedProfileId;
  havenProfile: {
    recoverySensitive: boolean;
    relapseThemes: boolean;
    cravingTriggers: boolean;
    groundingFriendly: boolean;
    panicFriendly: boolean;
  };
}

export const MOOD_TAG_SUGGESTIONS = ["calm", "sad", "energetic", "hopeful", "dark", "emotional"] as const;
export const VIBE_TAG_SUGGESTIONS = ["focus", "sleep", "workout", "study", "grounding", "party"] as const;

const EMPTY_SAFE = {
  griefThemes: false,
  traumaThemes: false,
  intenseEmotional: false,
  distressingThemes: false,
};

const EMPTY_SENS = {
  suddenLoudSounds: false,
  harshFrequencies: false,
  intenseBass: false,
  sensoryOverloadRisk: false,
};

const EMPTY_HAVEN_PROFILE = {
  recoverySensitive: false,
  relapseThemes: false,
  cravingTriggers: false,
  groundingFriendly: false,
  panicFriendly: false,
};

export const EMPTY_MANUAL_META: ManualMetaFields = {
  title: "",
  artist: "",
  album: "",
  albumartist: "",
  genre: "",
  year: "",
  date: "",
  tracknumber: "",
  discnumber: "",
  composer: "",
  comment: "",
};

export function manualEditsFromSource(source: SourceMetadata): ManualMetadataEdits {
  const m = source.meta;
  return {
    meta: {
      title: m.title ?? "",
      artist: m.artist ?? "",
      album: m.album ?? "",
      albumartist: m.albumartist ?? "",
      genre: m.genre ?? "",
      year: m.year ?? "",
      date: m.date ?? "",
      tracknumber: m.tracknumber ?? "",
      discnumber: m.discnumber ?? "",
      composer: m.composer ?? "",
      comment: m.comment ?? "",
    },
    cover: source.cover,
    lyricsUnsynced: source.lyrics?.unsynced ?? "",
    lyricsSource: source.lyrics?.source ?? "",
    expl: {
      explicit: false,
      cleanVersionAvailable: false,
      strongLanguage: false,
      sexualContent: false,
      violence: false,
      drugReferences: false,
      alcoholReferences: false,
      selfHarmThemes: false,
      traumaThemes: false,
      matureThemes: false,
    },
    moodTags: "",
    vibeTags: "",
    safe: { ...EMPTY_SAFE },
    sens: { ...EMPTY_SENS },
    specializedProfile: "none",
    havenProfile: { ...EMPTY_HAVEN_PROFILE },
  };
}

export function appendTagInput(current: string, tag: string): string {
  const tags = parseTagInput(current);
  if (tags.includes(tag)) return current;
  return [...tags, tag].join(", ");
}

export function parseTagInput(input: string): string[] {
  return input
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 32);
}

/** All standard keys, including empty strings (empty clears detected value on export). */
export function metaRecordFromManual(fields: ManualMetaFields): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value.trim();
  }
  return out;
}

export function hasExplFlags(expl: ManualMetadataEdits["expl"]): boolean {
  return Object.values(expl).some(Boolean);
}

export function buildOverridesFromEdits(edits: ManualMetadataEdits): UserMetadataOverrides {
  const overrides: UserMetadataOverrides = {
    meta: metaRecordFromManual(edits.meta),
  };

  if (edits.cover === null) {
    overrides.cover = null;
  } else if (edits.cover) {
    overrides.cover = edits.cover;
  }

  const unsynced = edits.lyricsUnsynced.trim();
  if (unsynced) {
    overrides.lyrics = {
      unsynced,
      source: edits.lyricsSource.trim() || "user",
    };
  } else {
    overrides.lyrics = null;
  }

  if (hasExplFlags(edits.expl)) {
    const expl: ExplPayload = {
      ...edits.expl,
      warningSource: "user",
      aiGenerated: false,
    };
    overrides.expl = expl;
  }

  const moodTags = parseTagInput(edits.moodTags);
  if (moodTags.length) {
    overrides.mood = { tags: moodTags, source: "user" };
  }

  const vibeTags = parseTagInput(edits.vibeTags);
  if (vibeTags.length) {
    overrides.vibe = { tags: vibeTags, source: "user" };
  }

  if (hasSafeFlags(edits.safe)) {
    const tags: string[] = [];
    if (edits.safe.intenseEmotional) tags.push("intense emotional content");
    overrides.safe = {
      griefThemes: edits.safe.griefThemes || undefined,
      traumaThemes: edits.safe.traumaThemes || undefined,
      distressingThemes: edits.safe.distressingThemes || undefined,
      tags: tags.length ? tags : undefined,
      warningSource: "user",
      aiGenerated: false,
    } satisfies SafePayload;
  }

  if (hasSensFlags(edits.sens)) {
    overrides.sens = {
      suddenLoudSounds: edits.sens.suddenLoudSounds || undefined,
      harshFrequencies: edits.sens.harshFrequencies || undefined,
      intenseBass: edits.sens.intenseBass || undefined,
      sensoryOverloadRisk: edits.sens.sensoryOverloadRisk || undefined,
      warningSource: "user",
      aiGenerated: false,
    } satisfies SensPayload;
  }

  if (edits.specializedProfile === "haven" && hasHavenProfileFlags(edits.havenProfile)) {
    overrides.recv = {
      recoverySafe: edits.havenProfile.recoverySensitive || undefined,
      relapseThemes: edits.havenProfile.relapseThemes || undefined,
      cravingTriggers: edits.havenProfile.cravingTriggers || undefined,
      groundingFriendly: edits.havenProfile.groundingFriendly || undefined,
      panicFriendly: edits.havenProfile.panicFriendly || undefined,
      warningSource: "user",
      aiGenerated: false,
    } satisfies RecvPayload;
  }

  return overrides;
}

function hasSafeFlags(s: ManualMetadataEdits["safe"]): boolean {
  return Object.values(s).some(Boolean);
}

function hasSensFlags(s: ManualMetadataEdits["sens"]): boolean {
  return Object.values(s).some(Boolean);
}

function hasHavenProfileFlags(r: ManualMetadataEdits["havenProfile"]): boolean {
  return Object.values(r).some(Boolean);
}

export function detectedMetaRows(source: SourceMetadata): { key: string; label: string; value: string }[] {
  const labels: Record<string, string> = {
    title: "Title",
    artist: "Artist",
    album: "Album",
    albumartist: "Album artist",
    genre: "Genre",
    year: "Year",
    date: "Date",
    tracknumber: "Track",
    discnumber: "Disc",
    composer: "Composer",
    comment: "Comment",
  };
  return Object.entries(labels)
    .map(([key, label]) => ({ key, label, value: source.meta[key] ?? "" }))
    .filter((r) => r.value);
}
