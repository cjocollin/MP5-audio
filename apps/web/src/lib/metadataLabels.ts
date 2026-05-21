/** User-facing metadata category labels (internal chunk fourCCs unchanged). */

export const METADATA_GUIDANCE_INTRO =
  "MP5 content guidance tags are optional metadata. They help different apps choose how to display, filter, or personalize audio. A standard music player may only use title, artist, album art, lyrics, and content notices. Specialized app metadata is optional and can be ignored by most players.";

export const SECTION = {
  trackInfo: "Track info",
  coverArt: "Cover art",
  lyrics: "Lyrics",
  contentGuidance: "Content guidance",
  contentNotices: "Content notices",
  sensitiveThemes: "Sensitive themes",
  listenerComfort: "Listener comfort",
  moodVibe: "Mood & vibe",
  visualTheme: "Visual theme",
  credits: "Credits",
  rightsLicense: "Rights & license",
  releaseIdentifiers: "Release identifiers",
  specializedAppMetadata: "Specialized app metadata",
  havenRecoveryProfile: "Haven / Recovery profile",
  customAppTags: "Custom app tags",
} as const;

export const CONTENT_GUIDANCE_HELP =
  "Optional tags that help players, libraries, families, accessibility tools, and specialized apps filter or explain audio. These tags do not affect playback.";

export type SpecializedProfileId =
  | "none"
  | "custom"
  | "family"
  | "wellness"
  | "education"
  | "podcast"
  | "haven";

/** Profile dropdown order (Haven / Recovery last). */
export const SPECIALIZED_PROFILE_OPTIONS: { id: SpecializedProfileId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "custom", label: "Custom app tags" },
  { id: "family", label: "Family / content filtering" },
  { id: "wellness", label: "Wellness" },
  { id: "education", label: "Education / study" },
  { id: "podcast", label: "Podcast / spoken word" },
  { id: "haven", label: "Haven / Recovery" },
];

export function specializedProfileLabel(id: SpecializedProfileId): string {
  return SPECIALIZED_PROFILE_OPTIONS.find((p) => p.id === id)?.label ?? "None";
}

/** Maps internal chunk fourCC → display name in export preview / player. */
export const CHUNK_DISPLAY_NAME: Record<string, string> = {
  EXPL: SECTION.contentNotices,
  SAFE: SECTION.sensitiveThemes,
  SENS: SECTION.listenerComfort,
  RECV: SECTION.havenRecoveryProfile,
  MOOD: "Mood",
  VIBE: "Vibe",
  LYRC: SECTION.lyrics,
  VISU: SECTION.visualTheme,
  CRDT: SECTION.credits,
  LICN: SECTION.rightsLicense,
  IDEN: SECTION.releaseIdentifiers,
};

export const CREDITS_HELP =
  "Optional detailed credits for artists, producers, engineers, and labels. One name per line in list fields. Performers: Name | instrument per line.";

export const RIGHTS_HELP =
  "Optional license and usage notes. Informational only — MP5 does not enforce licenses or DRM.";

export const IDENTIFIERS_HELP =
  "Optional release identifiers (ISRC, UPC, URLs). URLs must use http or https.";

export const VISUAL_THEME_HELP =
  "Optional colors and mood for the player UI. Does not affect audio decode or playback.";

export const SPECIALIZED_APP_HELP =
  "Optional app-specific metadata. Most music files and players do not need this.";

export const SPECIALIZED_PROFILE_NONE_EMPTY =
  "No specialized app profile selected. Most MP5 music files do not need one.";

export const CUSTOM_APP_TAGS_POSTPONED =
  "Custom app tags need a dedicated optional chunk (for example APPT). That chunk is not in the MVP converter yet — use Content guidance or Haven / Recovery where applicable.";

export const PROFILE_COMING_SOON =
  "Additional fields for this profile are not available in the converter yet.";

export const CONTENT_GUIDANCE_PLAYER_HELP =
  "Optional listener context — informational only. Playback is never blocked. Apps may ignore tags they do not use.";

/** User-facing labels for warningSource values in EXPL / SAFE / SENS / RECV. */
export type WarningSourceDisplayId =
  | "artist"
  | "distributor"
  | "ai"
  | "user"
  | "unknown";

export function formatWarningSourceLabel(source?: string | null): string {
  switch (source) {
    case "user":
      return "user-provided";
    case "artist":
      return "artist-provided";
    case "distributor":
      return "distributor-provided";
    case "ai":
      return "AI-suggested";
    case "unknown":
    default:
      return "unknown";
  }
}

