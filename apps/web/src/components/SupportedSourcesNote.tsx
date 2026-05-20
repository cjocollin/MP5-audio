import {
  FFMPEG_DECODE_NOTE,
  METADATA_LIMIT_NOTE,
  SUPPORTED_SOURCE_FORMATS,
} from "../converter/supportedSources";

export function SupportedSourcesNote() {
  return (
    <details
      className="rounded-lg border border-white/5 bg-surface-elevated/60 text-xs text-gray-500"
      data-testid="supported-sources-panel"
    >
      <summary className="cursor-pointer px-3 py-2 text-gray-400 hover:text-gray-300">
        Supported source formats (Alpha)
      </summary>
      <div className="px-3 pb-3 space-y-2">
        <ul className="space-y-1">
          {SUPPORTED_SOURCE_FORMATS.map((f) => (
            <li key={f.ext}>
              <span className="text-gray-400">{f.label}</span>
              {f.level === "native" ? (
                <span className="text-green-500/80"> · native</span>
              ) : (
                <span className="text-amber-500/70"> · FFmpeg.wasm</span>
              )}
              <span className="block text-gray-600">{f.note}</span>
            </li>
          ))}
        </ul>
        <p data-testid="ffmpeg-decode-note">{FFMPEG_DECODE_NOTE}</p>
        <p data-testid="metadata-limit-note">{METADATA_LIMIT_NOTE}</p>
      </div>
    </details>
  );
}
