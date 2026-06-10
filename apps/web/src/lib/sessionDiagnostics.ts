/** Session-local diagnostics for Beta testers - never auto-sent. */
import { APP_VERSION } from "../generated/appVersion";
import { activeConversionLabel } from "../store/conversionStore";
import { getCodecLoadState } from "../wasm/codec";
import { getFfmpegLoadState } from "../converter/ffmpegLoader";
import { getIngestDiagnostics } from "./ingest/ingestDiagnostics";
import { FEEDBACK_PRIVACY_NOTE } from "./betaFeedback";

export type UserErrorRecord = {
  source: string;
  message: string;
  at: string;
};

let lastUserError: UserErrorRecord | null = null;

export function recordUserFacingError(source: string, message: string) {
  if (!message.trim()) return;
  lastUserError = {
    source,
    message: message.trim(),
    at: new Date().toISOString(),
  };
}

export function getLastUserFacingError(): UserErrorRecord | null {
  return lastUserError;
}

export type DiagnosticsReportInput = {
  conversion: Parameters<typeof activeConversionLabel>[0];
  queueLength: number;
  currentFileLabel: string;
  decodeCacheSummary: string;
  librarySummary: string;
  includePlaybackTrace?: string;
};

const SUPPORTED_FEATURES = [
  "MP5-L v3 playback and export (recommended)",
  "MP5-C / MP5-H lab modes",
  "Stems and karaoke (experimental)",
  "Embedded and manifest .mp5p (experimental)",
  "Browser-local library (IndexedDB)",
  "No telemetry / no auto-upload",
];

export function buildBetaDiagnosticsReport(input: DiagnosticsReportInput): string {
  const ingest = getIngestDiagnostics();
  const lines = [
    "MP5 Audio - Beta diagnostics (paste into GitHub issue if helpful)",
    `App version: ${APP_VERSION}`,
    `Browser: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
    `Supported: ${SUPPORTED_FEATURES.join("; ")}`,
    `WASM codec: ${getCodecLoadState()}`,
    `FFmpeg WASM: ${getFfmpegLoadState()}`,
    `Conversion: ${activeConversionLabel(input.conversion)}`,
    `Playlist queue: ${input.queueLength}`,
    `Current file: ${input.currentFileLabel}`,
    `Decode cache: ${input.decodeCacheSummary}`,
    `Library: ${input.librarySummary}`,
    `Ingest: ${ingest.ingestMode} - chunks ${ingest.chunkCount} - integrity ${ingest.integrityStatus}`,
    lastUserError
      ? `Last error (${lastUserError.source} @ ${lastUserError.at}): ${lastUserError.message}`
      : "Last error: (none recorded this session)",
    FEEDBACK_PRIVACY_NOTE,
  ];
  if (input.includePlaybackTrace?.trim()) {
    lines.push("", "--- Playback trace (optional) ---", input.includePlaybackTrace.trim());
  }
  return lines.join("\n");
}

export function supportedFeaturesList(): readonly string[] {
  return SUPPORTED_FEATURES;
}