export type SourceSupportLevel = "native" | "ffmpeg" | "unsupported";

export interface SourceFormatInfo {
  ext: string;
  label: string;
  level: SourceSupportLevel;
  note: string;
}

/** Honest Alpha source-format guidance for the converter UI. */
export const SUPPORTED_SOURCE_FORMATS: SourceFormatInfo[] = [
  {
    ext: ".wav",
    label: "WAV",
    level: "native",
    note: "Fastest path — decoded in the browser when possible; keeps sample rate and channels.",
  },
  {
    ext: ".flac",
    label: "FLAC",
    level: "ffmpeg",
    note: "Decoded via FFmpeg.wasm; metadata via FFmpeg when available.",
  },
  {
    ext: ".mp3",
    label: "MP3",
    level: "ffmpeg",
    note: "Decoded via FFmpeg.wasm; tags extracted when present.",
  },
  {
    ext: ".m4a",
    label: "M4A / AAC",
    level: "ffmpeg",
    note: "Decoded via FFmpeg.wasm; album art when embedded.",
  },
  {
    ext: ".aac",
    label: "AAC",
    level: "ffmpeg",
    note: "Same FFmpeg path as M4A.",
  },
  {
    ext: ".ogg",
    label: "OGG / Opus",
    level: "ffmpeg",
    note: "Depends on FFmpeg.wasm build; Opus/Vorbis commonly work.",
  },
  {
    ext: ".opus",
    label: "Opus",
    level: "ffmpeg",
    note: "Same FFmpeg path as OGG when supported by the WASM build.",
  },
];

export const FFMPEG_DECODE_NOTE =
  "Non-WAV sources are transcoded to 44.1 kHz stereo PCM before MP5-L export (Alpha). WAV keeps native rate and channel layout.";

export const METADATA_LIMIT_NOTE =
  "Metadata and cover art come from source tags when FFmpeg can read them. Missing tags can be edited before export. Cover art is limited to 2 MiB.";

export function formatLabelForExtension(filename: string): SourceFormatInfo | undefined {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : "";
  return SUPPORTED_SOURCE_FORMATS.find((f) => f.ext === ext);
}

export function decodeFailureHint(filename: string): string {
  const info = formatLabelForExtension(filename);
  if (!info) {
    return "This file type may not be supported. Try WAV, FLAC, MP3, M4A, or OGG — or export a WAV from your DAW.";
  }
  if (info.level === "native") {
    return "WAV decode failed — the file may be corrupt or use an unsupported WAV variant (32-bit float, etc.). Try re-exporting 16-bit PCM WAV.";
  }
  return `${info.label} decode failed — FFmpeg.wasm could not read this file. Try a smaller clip, 16-bit WAV, or check your network (first load downloads FFmpeg).`;
}
