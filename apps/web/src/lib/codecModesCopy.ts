export type CodecModeId = "mp5l" | "mp5c" | "mp5h" | "pcm";

export interface CodecModeHelp {
  id: CodecModeId;
  name: string;
  tagline: string;
  detail: string;
}

/** Copy for “What do these mean?” — policy-honest, non-scary. */
export const CODEC_MODE_HELP: CodecModeHelp[] = [
  {
    id: "mp5l",
    name: "MP5-L v3",
    tagline: "Lossless · recommended default",
    detail:
      "Bit-exact listening export. Modest compression vs raw PCM. Use this for normal playback and sharing.",
  },
  {
    id: "mp5c",
    name: "MP5-C",
    tagline: "Experimental lab codec",
    detail:
      "Lossy research codec. May hiss on all presets — not for normal listening. Lab and comparison only.",
  },
  {
    id: "mp5h",
    name: "MP5-H",
    tagline: "Hybrid · large · not default",
    detail:
      "MP5-C base plus a lossless CORR correction layer when present. Files are much larger than MP5-L.",
  },
  {
    id: "pcm",
    name: "PCM",
    tagline: "Reference / debug",
    detail: "Uncompressed samples in the container. For testing, parity checks, or when WASM codecs are unavailable.",
  },
];

export const MP5_HONEST_LIMIT =
  "MP5 does not claim to beat MP3, AAC, Opus, or FLAC. It is an experimental smart-audio container with optional metadata.";
