import { decodeFailureHint } from "../converter/supportedSources";

/** Calm, actionable copy — not legal verification or codec superiority claims. */
export const USER_ERRORS = {
  sourceTooLarge:
    "This file is too large or long for a safe browser conversion. Try a shorter clip or export a smaller WAV from your DAW.",
  ffmpegLoadFailed:
    "Could not load FFmpeg (~31 MB, one-time per session). Refresh the page, check your network, or use a 16-bit PCM WAV file.",
  ffmpegTimeout:
    "FFmpeg took too long to load. Refresh the page or use a WAV file for this conversion.",
  wasmCodecsMissing:
    "MP5-L/C/H codecs are not loaded. Run pnpm wasm:build in the repo, then refresh — or use PCM reference mode for testing.",
  invalidMp5:
    "This file could not be read as MP5. It may be corrupt, truncated, or not an .mp5 file.",
  albumManifestInvalid:
    "The album manifest (.mp5p) is invalid. Check JSON format and track entries.",
  albumManifestUnreadable: "Could not read the album manifest file.",
  albumSidecarMissing:
    "One or more track files listed in the album manifest were not found. Add the .mp5 sidecars next to the manifest.",
  fingerprintMismatch:
    "Stored fingerprint or hash does not match this file. The file may have been edited outside MP5.",
  stemExportBlocked: "Fix stem errors before export — check sample rate and duration alignment.",
  stemAlignBlocked:
    "Some stems still do not match the full mix. Normalize stems, pad the full mix, or remove and re-import.",
  stemDecodeFailed:
    "No stems could be decoded. Check file format (WAV, FLAC, MP3, M4A, OGG) and try fewer files at once.",
  stemUnsupportedBatch:
    "No supported stem files to import. Use WAV, FLAC, MP3, M4A, or OGG.",
  stemChunkTooLarge:
    "Embedded stem data is too large for one chunk. Try segmented stem export or fewer stems.",
  libraryQuota:
    "Not enough browser storage to save. Remove older library items or free disk space in your browser settings.",
  libraryUnavailable: "Local library storage is not available in this browser.",
  batchCancelled: "Batch conversion was cancelled. Completed files are still available to download.",
  conversionCancelled: "Conversion cancelled.",
} as const;

export function formatConverterDecodeError(fileName: string, err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") return "";
  const msg = err instanceof Error ? err.message : String(err);
  if (/timed out/i.test(msg)) return USER_ERRORS.ffmpegTimeout;
  if (/ffmpeg/i.test(msg) && /load|fail/i.test(msg)) return USER_ERRORS.ffmpegLoadFailed;
  if (/Chunk payload exceeds|67108864/i.test(msg)) return USER_ERRORS.stemChunkTooLarge;
  const hint = decodeFailureHint(fileName);
  return msg && !msg.includes(hint.slice(0, 20))
    ? `${hint} Details: ${msg}`
    : hint;
}

export function formatPlaylistParseError(fileName: string): string {
  return `${USER_ERRORS.invalidMp5} File: ${fileName}`;
}
