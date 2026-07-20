export type CodecModeId = "mp5l" | "mp5c" | "mp5c2" | "mp5h" | "pcm";

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
      "Bit-exact listening export. Modest compression vs raw PCM. Use this for normal playback and sharing. Experimental v4 framing/QLP is lab-only while FLAC-class compression remains a chase, not a claim.",
  },
  {
    id: "mp5c2",
    name: "MP5-C2",
    tagline: "Hybrid quiet-lossless + signal-relative loud · not default",
    detail:
      "Lossless on quiet/fragile/tail passages; mid/loud units pick the smaller of bit-exact SR+CORR or MP5-L. Often lands near MP5-L size on dense music. MP5-L remains the recommended default. Distinct from classic lab MP5-C.",
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
    tagline: "Hybrid · often larger than MP5-L · not default",
    detail:
      "MP5-C base plus lossless CORR (sample-exact when CORR is applied). Often larger than MP5-L on real music; export size-gates against pure MP5-L and may resolve to MP5-L with an honest CodecId. Not a claim to beat MP3/AAC/Opus.",
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
