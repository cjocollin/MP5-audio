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
    name: "MP5-L v4",
    tagline: "Lossless · recommended default",
    detail:
      "Bit-exact listening export (v4 bitstream). Use this for normal playback and sharing. On a provisional 19-master held-out set it measured about level with FFmpeg flac -5 (median 0.997x, worst 1.002x) — corpus-scoped, not a general win over FLAC. Encode hard-fails with no silent v3 fallback — Retry as MP5-L v3 (lab) if needed. v3 remains available under lab/advanced.",
  },
  {
    id: "mp5c2",
    name: "MP5-C2",
    tagline: "Lossless · bit-exact · lab · not default",
    detail:
      "Bit-exact: quiet/fragile/tail passages use MP5-L, and loud units take the smaller of signal-relative + lossless CORR or MP5-L. On a real-music remeasure it came out slightly larger than MP5-L v4 (about 1.07x), so there is no size win and MP5-L v4 stays the recommended default. Lab/advanced only. Distinct from classic MP5-C.",
  },
  {
    id: "mp5c",
    name: "MP5-C classic (legacy)",
    tagline: "Experimental lab codec · legacy",
    detail:
      "Lossy research codec (CodecId 1). May hiss on all presets — not for normal listening. Lab and comparison only.",
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
