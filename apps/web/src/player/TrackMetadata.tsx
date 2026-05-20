import type { Mp5File } from "@mp5/container";
import { CodecId } from "@mp5/container";
import {
  codecLabel,
  describeMp5cPlayback,
  describeMp5hPlayback,
  describeMp5lPlayback,
  formatCodecSummary,
  presetLabelForCodec,
  type Mp5cPlaybackLabels,
  type Mp5hPlaybackLabels,
  type Mp5lPlaybackLabels,
} from "../lib/codecDisplay";
import type { Mp5hDecodeInfo } from "./decodeMp5";

interface Props {
  parsed?: Mp5File;
  title?: string;
  decodePath?: string;
  mp5h?: Mp5hDecodeInfo;
  fileBytes?: number;
  /** When true, only show format/codec panel (title shown in Now Playing). */
  hideTrackTitles?: boolean;
}

function compressionRatio(parsed: Mp5File, fileBytes?: number): number | null {
  if (!fileBytes || !parsed.head) return null;
  const pcmBytes =
    Number(parsed.head.totalSamples) *
    parsed.head.channels *
    (parsed.head.bitsPerSample / 8);
  if (pcmBytes <= 0) return null;
  return fileBytes / pcmBytes;
}

function CodecDetailRows({
  testId,
  rows,
  warning,
}: {
  testId: string;
  rows: { label: string; value: string; rowTestId?: string }[];
  warning?: string;
}) {
  return (
    <CodecDetailRowsInner testId={testId} rows={rows} warning={warning} />
  );
}

function CodecDetailRowsInner({
  testId,
  rows,
  warning,
}: {
  testId: string;
  rows: { label: string; value: string; rowTestId?: string }[];
  warning?: string;
}) {
  return (
    <div className="mt-2 space-y-1 text-xs" data-testid={testId}>
      {rows.map((row) => (
        <p key={row.label} data-testid={row.rowTestId}>
          <span className="text-gray-500">{row.label}</span>{" "}
          <span className="text-gray-200">{row.value}</span>
        </p>
      ))}
      {warning && (
        <p className="text-amber-200/90 mt-1" data-testid={`${testId}-warning`}>
          {warning}
        </p>
      )}
    </div>
  );
}

function Mp5lDetailBlock({ labels }: { labels: Mp5lPlaybackLabels }) {
  return (
    <CodecDetailRows
      testId="mp5l-playback-detail"
      rows={[
        { label: "Container:", value: labels.containerMode },
        { label: "Encoder:", value: labels.encoderVersion },
        {
          label: "Default export:",
          value: labels.defaultExport,
          rowTestId: "mp5l-default-export",
        },
        {
          label: "Output quality:",
          value: labels.outputQuality,
          rowTestId: "mp5l-output-quality",
        },
        {
          label: "Bit-exact:",
          value: labels.bitExact ? "Yes (lossless)" : "Unknown",
          rowTestId: "mp5l-bit-exact",
        },
      ]}
    />
  );
}

function Mp5cDetailBlock({ labels }: { labels: Mp5cPlaybackLabels }) {
  return (
    <CodecDetailRows
      testId="mp5c-playback-detail"
      warning={labels.warning}
      rows={[
        { label: "Container:", value: labels.containerMode },
        { label: "Bitstream:", value: labels.bitstreamVersion },
        { label: "Output quality:", value: labels.outputQuality },
      ]}
    />
  );
}

function Mp5hDetailBlock({ labels }: { labels: Mp5hPlaybackLabels }) {
  return (
    <CodecDetailRows
      testId="mp5h-playback-detail"
      warning={labels.warning}
      rows={[
        { label: "Container:", value: labels.containerMode },
        { label: "Base layer:", value: labels.baseLayer },
        {
          label: "Correction:",
          value: labels.correctionLayer,
          rowTestId: "mp5h-corr-status",
        },
        {
          label: "Decode mode:",
          value: labels.decodeMode,
          rowTestId: "mp5h-decode-mode",
        },
        {
          label: "Output quality:",
          value: labels.outputQuality,
          rowTestId: "mp5h-output-quality",
        },
      ]}
    />
  );
}

export function TrackMetadata({ parsed, title, decodePath, mp5h, fileBytes, hideTrackTitles }: Props) {
  const meta = parsed?.meta ?? [];
  const get = (k: string) => meta.find((m) => m.key === k)?.value;
  const displayTitle = get("title") ?? title ?? "Unknown";
  const artist = get("artist") ?? "Unknown artist";
  const album = get("album") ?? "";
  const head = parsed?.head;
  const encoder = parsed?.info.find((i) => i.key === "encoder")?.value;
  const frameData = parsed?.audioFrames[0]?.data;
  const isMp5c = head?.codecId === CodecId.MP5C;
  const isMp5l = head?.codecId === CodecId.MP5L;
  const isMp5h = head?.codecId === CodecId.MP5H;
  const isPcm = head?.codecId === CodecId.PCM;
  const ratio = parsed ? compressionRatio(parsed, fileBytes) : null;
  const mp5lLabels = isMp5l ? describeMp5lPlayback(frameData) : undefined;
  const mp5cLabels = isMp5c ? describeMp5cPlayback(frameData) : undefined;
  const mp5hLabels =
    isMp5h && parsed
      ? describeMp5hPlayback(parsed, mp5h?.enhancedActive ?? false)
      : undefined;

  return (
    <div className="space-y-3">
      {head ? (
        <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-accent/80 font-semibold mb-1">
            Format
          </p>
          <p className="text-lg font-bold text-accent" data-testid="codec-label">
            {codecLabel(head.codecId)}
          </p>
          {mp5lLabels && <Mp5lDetailBlock labels={mp5lLabels} />}
          {mp5cLabels && <Mp5cDetailBlock labels={mp5cLabels} />}
          {mp5hLabels && <Mp5hDetailBlock labels={mp5hLabels} />}
          {isPcm && (
            <p className="text-xs text-gray-300 mt-2" data-testid="pcm-reference-note">
              Reference / debug export — uncompressed PCM in container. Use for testing or when WASM codecs are unavailable.
            </p>
          )}
          {head.codecId !== CodecId.MP5L && head.codecId !== CodecId.PCM && !isMp5h && (
            <p className="text-sm text-gray-300 mt-0.5" data-testid="preset-label">
              Quality: {presetLabelForCodec(head.codecId, head.presetId)}
            </p>
          )}
          {ratio != null && (isMp5c || isMp5h || isMp5l) && (
            <p className="text-xs text-gray-400 mt-1 font-mono" data-testid="compression-ratio">
              Container size vs PCM: {(ratio * 100).toFixed(1)}% ({ratio < 1 ? "smaller" : "larger"} than PCM)
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2 font-mono">{formatCodecSummary(head)}</p>
          {decodePath && (
            <p className="text-xs text-gray-400 mt-2" data-testid="decode-path">
              Decode path: <span className="text-accent font-mono">{decodePath}</span>
            </p>
          )}
          {encoder && (
            <p className="text-xs text-gray-500 mt-1 font-mono" data-testid="encoder-info">
              Encoder: {encoder}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Load an .mp5 file to see codec info</p>
      )}

      {!hideTrackTitles && (
        <div>
          <h1 className="text-2xl font-bold truncate">{displayTitle}</h1>
          <p className="text-gray-400">{artist}</p>
          {album && <p className="text-gray-500 text-sm">{album}</p>}
        </div>
      )}
    </div>
  );
}
