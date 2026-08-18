/**
 * Public About-page format comparison data.
 *
 * Peer sizes: local 16-bit FLAC/MP5 corpus (FORMAT_COMPARISON_FLAC_MP3_WAV.json).
 * MP5 mode / legacy sizes: ORIGAMI benches in benchmarks/real-music/
 * (MP5H_VALIDATION.md, listening/LISTENING_VALIDATION.md, audio-quality gate).
 * Never invent compression percentages. Never claim to beat FLAC/MP3/AAC/Opus.
 */

/** Industry peer rows always shown in the comparison table. */
export type FormatComparisonPeerId = "wav" | "flac" | "mp3" | "mp5l";

/** Current MP5 codec modes (optional via About dropdown). */
export type FormatComparisonModeId = "pcm" | "mp5c2" | "mp5h" | "mp5c";

/** Older / superseded variants (optional via About legacy dropdown). */
export type FormatComparisonLegacyId = "mp5c_v3";

export type FormatComparisonId =
  | FormatComparisonPeerId
  | FormatComparisonModeId
  | FormatComparisonLegacyId;

export type FormatComparisonGroup = "peer" | "mp5_mode" | "legacy";

export type FormatType = "uncompressed" | "lossless" | "lossy" | "hybrid";

export type BitExactStatus =
  | "yes"
  | "yes_when_from_same_pcm"
  | "no"
  | "n_a_reference";

export type MeasurementStatus = "pending" | "measured" | "not_applicable";

export type MeasurementCorpus =
  | "peer_16bit_subset"
  | "origami_pcm_ref"
  | "origami_listening"
  | "vnext_real_track_gate"
  /** 19 ORIGAMI segment excerpts, 48 kHz stereo — c2-real-track-remeasure.json. */
  | "origami_segments_c2";

/**
 * Measured size fields.
 * Ratios are vs the same-source WAV/PCM reference (1.00x = WAV/PCM size).
 */
export interface FormatMeasuredSizes {
  status: MeasurementStatus;
  sizeBytes: number | null;
  ratioVsWav: number | null;
  /**
   * Optional: size / FLAC or size / MP5-L for A/B only.
   * Do not present as "beats FLAC".
   */
  ratioVsFlac5: number | null;
  ratioVsWavLabel: string;
  note: string | null;
  corpus?: MeasurementCorpus;
}

export interface FormatComparisonRow {
  id: FormatComparisonId;
  group: FormatComparisonGroup;
  format: string;
  type: FormatType;
  typeLabel: string;
  typicalUse: string;
  compression: string;
  bitExact: BitExactStatus;
  bitExactLabel: string;
  browserSupport: string;
  projectStance: string;
  measured: FormatMeasuredSizes;
}

export interface FormatComparisonFootnote {
  id: string;
  text: string;
}

export type Mp5CompareView = "peers" | "modes" | "legacy";

export interface FormatComparisonTable {
  title: string;
  honestyLead: string;
  columns: ReadonlyArray<{ key: string; label: string; help?: string }>;
  rows: ReadonlyArray<FormatComparisonRow>;
  modeRows: ReadonlyArray<FormatComparisonRow>;
  legacyRows: ReadonlyArray<FormatComparisonRow>;
  footnotes: ReadonlyArray<FormatComparisonFootnote>;
  howWeMeasured: string;
  howWeMeasuredModes: string;
  labOnlyNote: string;
  viewLabels: Record<Mp5CompareView, string>;
}

export const FORMAT_COMPARISON_COLUMNS = [
  { key: "format", label: "Format" },
  {
    key: "type",
    label: "Type",
    help: "Uncompressed reference vs lossless (bit-exact) vs lossy/hybrid.",
  },
  { key: "typicalUse", label: "Typical use" },
  {
    key: "compression",
    label: "Compression",
    help: "Qualitative. Measured size vs WAV/PCM appears beside this when available.",
  },
  {
    key: "ratioVsWav",
    label: "Size vs WAV",
    help: "Same-source PCM. 1.00x = uncompressed WAV/PCM. Smaller is more compressed.",
  },
  {
    key: "bitExact",
    label: "Bit-exact?",
    help: "Decoded PCM matches the source sample-for-sample when both are lossless from the same master.",
  },
  { key: "browserSupport", label: "Browser / playback" },
  { key: "projectStance", label: "MP5 project stance" },
] as const;

/** Industry peers — Size vs WAV from two native 16-bit masters. */
export const FORMAT_COMPARISON_ROWS: ReadonlyArray<FormatComparisonRow> = [
  {
    id: "wav",
    group: "peer",
    format: "WAV (PCM)",
    type: "uncompressed",
    typeLabel: "Uncompressed",
    typicalUse: "Exchange, editing, measurement reference",
    compression: "None — stores raw PCM samples (plus a small header).",
    bitExact: "n_a_reference",
    bitExactLabel: "Reference (identity)",
    browserSupport: "Universal in browsers via Web Audio / decode of PCM WAV.",
    projectStance:
      'Size baseline for this table. Not "higher quality" than FLAC or MP5-L when all three are lossless from the same source.',
    measured: {
      status: "measured",
      sizeBytes: 98569332,
      ratioVsWav: 1,
      ratioVsFlac5: null,
      ratioVsWavLabel: "1.00x",
      note: "16-bit PCM WAV baseline for the two native 16-bit masters used in Size vs WAV.",
      corpus: "peer_16bit_subset",
    },
  },
  {
    id: "flac",
    group: "peer",
    format: "FLAC",
    type: "lossless",
    typeLabel: "Lossless",
    typicalUse: "Archival, distribution, open lossless playback",
    compression:
      "Mature lossless entropy coding. Typically much smaller than WAV; industry default for open lossless.",
    bitExact: "yes_when_from_same_pcm",
    bitExactLabel: "Yes (same PCM source)",
    browserSupport:
      "Native decode varies by browser; widely supported via libraries / OS players.",
    projectStance: "Industry lossless peer. MP5 does not claim to beat FLAC.",
    measured: {
      status: "measured",
      sizeBytes: 64640941,
      ratioVsWav: 0.6558,
      ratioVsFlac5: null,
      ratioVsWavLabel: "0.66x",
      note: "Same two 16-bit masters as WAV/MP5; total FLAC / total WAV.",
      corpus: "peer_16bit_subset",
    },
  },
  {
    id: "mp3",
    group: "peer",
    format: "MP3",
    type: "lossy",
    typeLabel: "Lossy",
    typicalUse: "Compatibility, streaming, portable playback",
    compression:
      "Lossy perceptual coding. Far smaller than lossless formats by discarding audio — not a fair quality peer to WAV/FLAC/MP5-L.",
    bitExact: "no",
    bitExactLabel: "No",
    browserSupport: "Near-universal native browser and device support.",
    projectStance:
      "Lossy size/compatibility peer only. MP5 does not claim to beat MP3.",
    measured: {
      status: "measured",
      sizeBytes: 22356792,
      ratioVsWav: 0.2268,
      ratioVsFlac5: null,
      ratioVsWavLabel: "0.23x",
      note: "libmp3lame 320 kbps CBR from the same two 16-bit masters (lossy).",
      corpus: "peer_16bit_subset",
    },
  },
  {
    id: "mp5l",
    group: "peer",
    format: "MP5-L (v4)",
    type: "lossless",
    typeLabel: "Lossless",
    typicalUse: "MP5 Public Beta default listening / batch export",
    compression:
      "Experimental lossless (packed Rice + multi-mode stereo). Near FLAC size on same-depth sources — not a claim to beat FLAC.",
    bitExact: "yes",
    bitExactLabel: "Yes (bit-exact)",
    browserSupport:
      "Requires the MP5 web app / WASM decoder (not a native browser codec).",
    projectStance:
      "Recommended MP5 path. Does not claim to beat MP3, AAC, Opus, or FLAC.",
    measured: {
      status: "measured",
      sizeBytes: 64219148,
      ratioVsWav: 0.6515,
      ratioVsFlac5: 0.9935,
      ratioVsWavLabel: "0.65x",
      note: "Paired .mp5 exports for the same two 16-bit masters.",
      corpus: "peer_16bit_subset",
    },
  },
];

/**
 * Current MP5 modes — Size vs PCM from ORIGAMI / gate benches.
 * Comparable across modes; not mixed unlabeled with the peer corpus.
 */
export const FORMAT_COMPARISON_MODE_ROWS: ReadonlyArray<FormatComparisonRow> = [
  {
    id: "pcm",
    group: "mp5_mode",
    format: "PCM (in .mp5)",
    type: "uncompressed",
    typeLabel: "Uncompressed",
    typicalUse: "Reference / debug fallback inside the container",
    compression: "Raw PCM samples in the MP5 container — size ~ WAV.",
    bitExact: "yes",
    bitExactLabel: "Yes (bit-exact)",
    browserSupport: "MP5 web app / WASM when codecs are unavailable.",
    projectStance: "Debug / baseline only — not the normal export path.",
    measured: {
      status: "measured",
      sizeBytes: 29676732,
      ratioVsWav: 1,
      ratioVsFlac5: null,
      ratioVsWavLabel: "1.00x",
      note: "ORIGAMI PCM fallback (MP5H_VALIDATION / listening exports).",
      corpus: "origami_pcm_ref",
    },
  },
  {
    id: "mp5c2",
    group: "mp5_mode",
    format: "MP5-C2",
    type: "lossless",
    typeLabel: "Lossless · lab",
    typicalUse: "Converter lab / advanced option (not default; batch stays MP5-L)",
    compression:
      "Quiet/fragile/tail units are MP5-L; loud units take whichever is smaller — signal-relative + lossless CORR, or plain MP5-L. Every unit restores the source exactly, so it is larger than MP5-L rather than smaller.",
    bitExact: "yes",
    bitExactLabel: "Yes (bit-exact)",
    browserSupport: "MP5 web app (CodecId MP5C2 / AUDI 0x43 0x34).",
    projectStance:
      "Bit-exact but no size win over MP5-L, so it stays lab-gated and non-default. Not a claim to beat FLAC or MP3. Distinct from classic MP5-C.",
    measured: {
      status: "measured",
      sizeBytes: 22581388,
      ratioVsWav: 0.7738,
      ratioVsFlac5: null,
      ratioVsWavLabel: "0.77x",
      note: "Fresh remeasure of the shipping CodecId 5 encoder (preset 2) over 19 ORIGAMI segment excerpts (152 s, 48 kHz stereo): 22,581,388 B vs 29,184,000 B PCM = 0.77x PCM, and 1.07x MP5-L v4 on the same PCM. Decode verified sample-for-sample equal to the source; every emitted unit was bit-exact (no lossy units). Source: benchmarks/audio-quality/c2-real-track-remeasure.json.",
      corpus: "origami_segments_c2",
    },
  },
  {
    id: "mp5h",
    group: "mp5_mode",
    format: "MP5-H (High)",
    type: "hybrid",
    typeLabel: "Hybrid · lossless",
    typicalUse: "Experimental hybrid when bit-exact + C base is acceptable",
    compression:
      "MP5-C base + lossless CORR. Bit-exact but much larger than MP5-L (~2x L on ORIGAMI).",
    bitExact: "yes",
    bitExactLabel: "Yes (with CORR)",
    browserSupport: "MP5 web app (experimental).",
    projectStance:
      "Bit-exact hybrid research path. Larger than MP5-L — L stays the recommended export.",
    measured: {
      status: "measured",
      sizeBytes: 45754519,
      ratioVsWav: 1.54,
      ratioVsFlac5: null,
      ratioVsWavLabel: "1.54x",
      note: "ORIGAMI MP5-H High base+CORR vs PCM (MP5H_VALIDATION.md); ~2.01x MP5-L.",
      corpus: "origami_pcm_ref",
    },
  },
  {
    id: "mp5c",
    group: "mp5_mode",
    format: "MP5-C classic (legacy, High v4)",
    type: "lossy",
    typeLabel: "Lossy · lab",
    typicalUse: "Lab listening / research only",
    compression:
      "Lossy research codec. Minimal size win vs PCM on dense masters (~0.97x); may hiss on some presets.",
    bitExact: "no",
    bitExactLabel: "No",
    browserSupport: "MP5 web app (lab-gated).",
    projectStance:
      "Lab-only. Not for normal listening unless explicitly showing lab limits. Does not beat FLAC/MP3.",
    measured: {
      status: "measured",
      sizeBytes: 28698445,
      ratioVsWav: 0.967,
      ratioVsFlac5: null,
      ratioVsWavLabel: "0.97x",
      note: "ORIGAMI MP5-C High (~0.97x PCM; MP5H_VALIDATION / listening).",
      corpus: "origami_pcm_ref",
    },
  },
];

/** Older / superseded variants. */
export const FORMAT_COMPARISON_LEGACY_ROWS: ReadonlyArray<FormatComparisonRow> = [
  {
    id: "mp5c_v3",
    group: "legacy",
    format: "MP5-C classic Standard v3",
    type: "lossy",
    typeLabel: "Lossy · legacy",
    typicalUse: "Historical A/B only — do not use",
    compression:
      "Superseded lossy preset. Smaller than v4 Standard but much worse hiss (~24.5 dB SNR on ORIGAMI).",
    bitExact: "no",
    bitExactLabel: "No",
    browserSupport: "May still decode; not offered as a recommended export.",
    projectStance:
      "Legacy. User-confirmed worse than Standard v4. Kept here for honest history only.",
    measured: {
      status: "measured",
      sizeBytes: null,
      ratioVsWav: 0.872,
      ratioVsFlac5: null,
      ratioVsWavLabel: "0.87x",
      note: "ORIGAMI listening validation — Standard v3 ratio vs PCM; ~24.5 dB SNR.",
      corpus: "origami_listening",
    },
  },
];

export const FORMAT_COMPARISON_HOW_WE_MEASURED = [
  "How we measured (peers): Same local FLAC masters → WAV (pcm_s16le) + MP3 320 kbps CBR + existing MP5-L exports.",
  "Size vs WAV uses the two native 16-bit tracks so WAV, FLAC, and MP5-L share the same PCM depth (FLAC 0.66x, MP5-L 0.65x, MP3 0.23x).",
  "24-bit masters were excluded from that column because paired .mp5 files there are sized like 16-bit encodes.",
].join(" ");

export const FORMAT_COMPARISON_HOW_WE_MEASURED_MODES = [
  "MP5 modes / legacy sizes use published ORIGAMI benches (vs PCM), not the 16-bit peer corpus — so mode rows compare to each other fairly.",
  "Sources: benchmarks/real-music/MP5H_VALIDATION.md, listening/LISTENING_VALIDATION.md, benchmarks/audio-quality/c2-real-track-remeasure.json.",
  "The MP5-C2 row is a separate fresh run over 19 ORIGAMI segment excerpts (152 s, 48 kHz), so treat it as same-material rather than same-file against the other mode rows.",
].join(" ");

export const FORMAT_COMPARISON_LAB_ONLY_NOTE =
  "MP5-C classic (legacy) is lab-only and may add audible hiss. MP5-C2 is bit-exact lossless but larger than MP5-L, and MP5-H is a bit-exact hybrid that is larger again — both are non-default lab paths. MP5-L remains the recommended export.";

export const FORMAT_COMPARISON_HONESTY_LEAD =
  "MP5 is an experimental Public Beta. It does not claim to beat MP3, AAC, Opus, or FLAC. WAV is the uncompressed size reference — not a higher listening-quality tier than FLAC or MP5-L when all are lossless from the same source.";

export const FORMAT_COMPARISON_VIEW_LABELS: Record<Mp5CompareView, string> = {
  peers: "Peers only (WAV / FLAC / MP3 / MP5-L)",
  modes: "Include current MP5 modes (C2 / H / classic C / PCM)",
  legacy: "Include current + legacy (adds MP5-C classic v3)",
};

export const FORMAT_COMPARISON_FOOTNOTES: ReadonlyArray<FormatComparisonFootnote> = [
  { id: "honesty", text: FORMAT_COMPARISON_HONESTY_LEAD },
  {
    id: "lossless-parity",
    text: "When WAV, FLAC, and MP5-L are produced from the same PCM, decoded audio matches sample-for-sample. File size differs; listening quality does not.",
  },
  {
    id: "mp3-not-peer-quality",
    text: "MP3 at 320 kbps is a lossy encode. Smaller files reflect discarded audio, not a win over lossless formats.",
  },
  { id: "lab-only", text: FORMAT_COMPARISON_LAB_ONLY_NOTE },
  { id: "how-we-measured", text: FORMAT_COMPARISON_HOW_WE_MEASURED },
  { id: "how-we-measured-modes", text: FORMAT_COMPARISON_HOW_WE_MEASURED_MODES },
];

export const FORMAT_COMPARISON_TABLE: FormatComparisonTable = {
  title: "Format comparison",
  honestyLead: FORMAT_COMPARISON_HONESTY_LEAD,
  columns: FORMAT_COMPARISON_COLUMNS.map((c) => ({ ...c })),
  rows: FORMAT_COMPARISON_ROWS,
  modeRows: FORMAT_COMPARISON_MODE_ROWS,
  legacyRows: FORMAT_COMPARISON_LEGACY_ROWS,
  footnotes: FORMAT_COMPARISON_FOOTNOTES,
  howWeMeasured: FORMAT_COMPARISON_HOW_WE_MEASURED,
  howWeMeasuredModes: FORMAT_COMPARISON_HOW_WE_MEASURED_MODES,
  labOnlyNote: FORMAT_COMPARISON_LAB_ONLY_NOTE,
  viewLabels: FORMAT_COMPARISON_VIEW_LABELS,
};

export function rowsForCompareView(view: Mp5CompareView): FormatComparisonRow[] {
  if (view === "peers") return [...FORMAT_COMPARISON_ROWS];
  if (view === "modes") {
    return [...FORMAT_COMPARISON_ROWS, ...FORMAT_COMPARISON_MODE_ROWS];
  }
  return [
    ...FORMAT_COMPARISON_ROWS,
    ...FORMAT_COMPARISON_MODE_ROWS,
    ...FORMAT_COMPARISON_LEGACY_ROWS,
  ];
}

export function getFormatComparisonRow(
  id: FormatComparisonId,
): FormatComparisonRow | undefined {
  return (
    FORMAT_COMPARISON_ROWS.find((row) => row.id === id) ??
    FORMAT_COMPARISON_MODE_ROWS.find((row) => row.id === id) ??
    FORMAT_COMPARISON_LEGACY_ROWS.find((row) => row.id === id)
  );
}

export function formatComparisonMeasurementsPending(): boolean {
  return FORMAT_COMPARISON_ROWS.some(
    (row) => row.id !== "wav" && row.measured.status === "pending",
  );
}
