import type {
  CoverArt,
  CrdtPayload,
  ExplPayload,
  HiltPayload,
  IdenPayload,
  LicnPayload,
  LyrcPayload,
  RecvPayload,
  SafePayload,
  SensPayload,
  SectPayload,
  VisuPayload,
  VisualIntensity,
  VisuPlayerStyle,
} from "@mp5/container";
import {
  formatSyncedLyricsText,
  parseSyncedLyricsText,
} from "../lib/lyrics/lyrcTimestampParser";
import {
  formatHighlightsText,
  formatSectionsText,
  hookFromSections,
  parseHighlightsText,
  parseSectionsText,
} from "../lib/sections/sectionParser";
import { decodeSect, decodeHilt, decodeVisu, decodeCrdt, decodeLicn, decodeIden } from "@mp5/container";
import {
  crdtEditsFromPayload,
  emptyCrdtEdits,
  crdtPayloadFromEdits,
  hasCrdtEdits,
  emptyLicnEdits,
  licnEditsFromPayload,
  licnPayloadFromEdits,
  hasLicnEdits,
  emptyIdenEdits,
  idenEditsFromPayload,
  idenPayloadFromEdits,
  hasIdenEdits,
  type ManualCrdtEdits,
  type ManualLicnEdits,
  type ManualIdenEdits,
} from "../lib/creditsRights/textFormat";
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
  /** LRC-style synced lines — `[mm:ss.xx] text` */
  lyricsSyncedText: string;
  lyricsSource: string;
  /** Song sections — `[mm:ss.xx-mm:ss.xx|Type] title` */
  sectionsText: string;
  highlightsText: string;
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
  visualTheme: ManualVisualThemeEdits;
  credits: ManualCrdtEdits;
  rights: ManualLicnEdits;
  identifiers: ManualIdenEdits;
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

export const VISU_INTENSITY_OPTIONS: { id: VisualIntensity | ""; label: string }[] = [
  { id: "", label: "(default)" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

export const VISU_STYLE_OPTIONS: { id: VisuPlayerStyle | ""; label: string }[] = [
  { id: "", label: "(default)" },
  { id: "calm", label: "Calm" },
  { id: "bold", label: "Bold" },
  { id: "minimal", label: "Minimal" },
  { id: "cinematic", label: "Cinematic" },
  { id: "neon", label: "Neon" },
  { id: "custom", label: "Custom" },
];

export interface ManualVisualThemeEdits {
  themeName: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  moodLabel: string;
  visualIntensity: VisualIntensity | "";
  playerStyle: VisuPlayerStyle | "";
}

export const EMPTY_VISUAL_THEME: ManualVisualThemeEdits = {
  themeName: "",
  primaryColor: "",
  accentColor: "",
  backgroundColor: "",
  moodLabel: "",
  visualIntensity: "",
  playerStyle: "",
};

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
    lyricsSyncedText: source.lyrics?.synced?.length
      ? formatSyncedLyricsText(source.lyrics.synced)
      : "",
    lyricsSource: source.lyrics?.source ?? "",
    sectionsText: "",
    highlightsText: "",
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
    visualTheme: { ...EMPTY_VISUAL_THEME },
    credits: { ...emptyCrdtEdits() },
    rights: { ...emptyLicnEdits() },
    identifiers: { ...emptyIdenEdits() },
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

export function manualEditsFromParsedOptional(
  optional: Map<string, Uint8Array>,
): Pick<
  ManualMetadataEdits,
  "sectionsText" | "highlightsText" | "visualTheme" | "credits" | "rights" | "identifiers"
> {
  const sect = decodeSect(optional.get("SECT"));
  const hilt = decodeHilt(optional.get("HILT"));
  const visu = decodeVisu(optional.get("VISU"));
  const crdt = decodeCrdt(optional.get("CRDT"));
  const licn = decodeLicn(optional.get("LICN"));
  const iden = decodeIden(optional.get("IDEN"));
  return {
    sectionsText: sect?.sections.length ? formatSectionsText(sect.sections) : "",
    highlightsText: hilt?.highlights.length ? formatHighlightsText(hilt.highlights) : "",
    visualTheme: visu ? visualThemeEditsFromPayload(visu) : { ...EMPTY_VISUAL_THEME },
    credits: crdtEditsFromPayload(crdt),
    rights: licnEditsFromPayload(licn),
    identifiers: idenEditsFromPayload(iden),
  };
}

export function visualThemeEditsFromPayload(visu: VisuPayload): ManualVisualThemeEdits {
  return {
    themeName: visu.themeName ?? "",
    primaryColor: visu.primaryColor ?? "",
    accentColor: visu.accentColor ?? "",
    backgroundColor: visu.backgroundColor ?? "",
    moodLabel: visu.moodLabel ?? "",
    visualIntensity: visu.visualIntensity ?? "",
    playerStyle: visu.playerStyle ?? "",
  };
}

export function hasVisualThemeEdits(v: ManualVisualThemeEdits): boolean {
  return !!(
    v.themeName.trim() ||
    v.primaryColor.trim() ||
    v.accentColor.trim() ||
    v.backgroundColor.trim() ||
    v.moodLabel.trim() ||
    v.visualIntensity ||
    v.playerStyle
  );
}

export function visuPayloadFromEdits(v: ManualVisualThemeEdits): VisuPayload | null {
  if (!hasVisualThemeEdits(v)) return null;
  const payload: VisuPayload = { source: "user" };
  const name = v.themeName.trim();
  if (name) payload.themeName = name;
  const primary = v.primaryColor.trim();
  if (primary) payload.primaryColor = primary;
  const accent = v.accentColor.trim();
  if (accent) payload.accentColor = accent;
  const bg = v.backgroundColor.trim();
  if (bg) payload.backgroundColor = bg;
  const mood = v.moodLabel.trim();
  if (mood) payload.moodLabel = mood;
  if (v.visualIntensity) payload.visualIntensity = v.visualIntensity;
  if (v.playerStyle) payload.playerStyle = v.playerStyle;
  return payload;
}

export function sectionsParseErrors(text: string): string[] {
  if (!text.trim()) return [];
  return parseSectionsText(text).errors;
}

export function syncedLyricsParseErrors(syncedText: string): string[] {
  if (!syncedText.trim()) return [];
  return parseSyncedLyricsText(syncedText).errors;
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
  const syncedRaw = edits.lyricsSyncedText.trim();
  let lyrics: LyrcPayload | null = null;

  if (unsynced || syncedRaw) {
    const source = edits.lyricsSource.trim() || "user";
    const payload: LyrcPayload = { source };
    if (unsynced) payload.unsynced = unsynced;
    if (syncedRaw) {
      const { lines, errors } = parseSyncedLyricsText(syncedRaw);
      if (errors.length) {
        /* Caller should surface parse errors; skip invalid synced on export. */
      } else if (lines.length) {
        payload.synced = lines;
      }
    }
    if (payload.unsynced || payload.synced?.length) {
      lyrics = payload;
    }
  }

  overrides.lyrics = lyrics;

  const sectionsRaw = edits.sectionsText.trim();
  const highlightsRaw = edits.highlightsText.trim();
  if (sectionsRaw) {
    const { sections, errors } = parseSectionsText(sectionsRaw);
    if (!errors.length && sections.length) {
      overrides.sect = { version: 1, sections, source: "user" };
      const hook = hookFromSections(sections);
      if (hook) overrides.hook = hook;
    }
  } else {
    overrides.sect = null;
    overrides.hook = null;
  }
  if (highlightsRaw) {
    const { highlights, errors } = parseHighlightsText(highlightsRaw);
    if (!errors.length && highlights.length) {
      overrides.hilt = { highlights, source: "user" };
    }
  } else {
    overrides.hilt = null;
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

  const visu = visuPayloadFromEdits(edits.visualTheme);
  if (visu) {
    overrides.visu = visu;
  }

  if (hasCrdtEdits(edits.credits)) {
    overrides.crdt = crdtPayloadFromEdits(edits.credits);
  } else {
    overrides.crdt = null;
  }

  if (hasLicnEdits(edits.rights)) {
    overrides.licn = licnPayloadFromEdits(edits.rights);
  } else {
    overrides.licn = null;
  }

  if (hasIdenEdits(edits.identifiers)) {
    overrides.iden = idenPayloadFromEdits(edits.identifiers);
  } else {
    overrides.iden = null;
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
