/** Landing copy constants (used in UI + tests). */
export const LANDING_HEADLINE = "MP5 Audio";
export const LANDING_SUBHEADLINE =
  "An experimental smart audio format, converter, player, and album package system.";
export const LANDING_SUPPORTING =
  "Convert audio into .mp5, play it back with MP5-L v3 lossless audio, and explore a format designed for rich metadata, cover art, lyrics, content guidance, waveform data, and future interactive audio.";

export const FORMAT_MP5_EXPLAINER =
  ".mp5 = one smart song (single track). MP5-L v3 is the recommended lossless codec.";
export const FORMAT_MP5P_EXPLAINER =
  ".mp5p = one smart album/package — manifest (sidecar .mp5 files) or embedded (self-contained). Experimental.";

export const LANDING_BADGES = [
  "MP5 Public Beta",
  "MP5-L v3 default",
  ".mp5 + .mp5p",
  "PWA-ready",
  "Experimental",
] as const;

export const HONESTY_NO_BEAT_CLAIM =
  "MP5 does not claim to beat MP3, AAC, Opus, or FLAC.";

export const LANDING_SCREENSHOTS = [
  {
    src: "/screenshots/Player.png",
    label: "Player",
    alt: "MP5 Player with playlist, playback controls, and Format panel",
  },
  {
    src: "/screenshots/Converter.png",
    label: "Converter",
    alt: "MP5 Converter importing audio and exporting MP5-L v3",
  },
  {
    src: "/screenshots/Metadata.png",
    label: "Metadata",
    alt: "MP5 metadata editor with cover art, lyrics, and optional guidance",
  },
] as const;
