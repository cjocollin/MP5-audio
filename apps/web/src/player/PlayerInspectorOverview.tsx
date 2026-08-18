import { getMetaValue, type IntegrityCheckResult, type Mp5File } from "@mp5/container";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { audiKbps, bitrateDetailLabel, c6BitrateInfo } from "../lib/c6Bitrate";
import { codecLabel } from "../lib/codecDisplay";
import type { PlaylistTrack } from "../store/playerStore";
import { formatDuration, trackDisplayInfo } from "./playlistUtils";

interface Props {
  track?: PlaylistTrack;
  parsed?: Mp5File;
  duration: number;
  integrity?: IntegrityCheckResult | null;
}

type OverviewRow = readonly [label: string, value?: string | number | null];

function valueOrDash(value?: string | number | null) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

export function PlayerInspectorOverview({ track, parsed, duration, integrity }: Props) {
  const info = track ? trackDisplayInfo(track) : null;
  const meta = parsed?.meta ?? [];
  const head = parsed?.head;
  const fullCodecLabel = head
    ? codecLabel(head.codecId, parsed?.audioFrames[0]?.data)
    : "";
  const audiFrame = parsed?.audioFrames[0]?.data;
  const bitrateLabel = audiFrame
    ? (head?.codecId === 6
        ? bitrateDetailLabel(c6BitrateInfo(audiFrame))
        : (() => {
            const kbps = audiKbps(audiFrame.length, duration || info?.durationSec || null);
            return kbps == null ? null : `${Math.round(kbps)} kbps`;
          })())
    : null;
  const isLossless = /lossless/i.test(fullCodecLabel);
  const isDefaultDemo = track?.origin === "default-demo";
  const integrityLabel = !track
    ? null
    : integrity?.status === "verified" || integrity?.status === "audio_verified"
      ? "Bit-exact"
      : isLossless
        ? "Bit-exact"
        : integrity?.status && integrity.status !== "missing"
          ? integrity.status.replace(/_/g, " ")
          : "Not verified";

  const leftRows: OverviewRow[] = [
    ["Title", info?.title],
    ["Artist", info?.artist],
    ["Album", info?.album || (isDefaultDemo ? "MP5 Public Beta Demo" : null)],
    ["Genre", getMetaValue(meta, "genre") || (isDefaultDemo ? "Test Tone" : null)],
    ["Duration", formatDuration(duration || info?.durationSec || null)],
    [
      "Comment",
      getMetaValue(meta, "comment") ||
        (isDefaultDemo ? "Synthetic 440 Hz tone — no copyrighted music." : null),
    ],
  ];
  const rightRows: OverviewRow[] = [
    ["Codec", head ? fullCodecLabel.replace(/\s*\(.+\)$/, "") : null],
    ["Mode", head ? (isLossless ? "Lossless" : fullCodecLabel.replace(/^MP5-/, "")) : null],
    ["Bitrate", bitrateLabel],
    ["Integrity", integrityLabel],
    ["Container", track ? "MP5" : null],
    ["Channels", head ? `${head.channels}${head.channels === 1 ? " (mono)" : head.channels === 2 ? " (stereo)" : ""}` : null],
    ["Sample rate", head ? `${(head.sampleRate / 1000).toFixed(head.sampleRate % 1000 ? 1 : 0)} kHz` : null],
    ["Bit depth", head ? `${head.bitsPerSample}-bit` : null],
  ];
  const mobileRows: OverviewRow[] = [
    rightRows[0]!,
    rightRows[1]!,
    rightRows[2]!,
    rightRows[3]!,
    leftRows[4]!,
    rightRows[4]!,
    rightRows[5]!,
    rightRows[6]!,
  ];
  const renderValue = (label: string, value?: string | number | null) =>
    label === "Integrity" && integrityLabel === "Bit-exact" ? (
      <span className="mp5-integrity-value">
        <CheckCircle size={13} weight="bold" aria-hidden /> Bit-exact
      </span>
    ) : (
      valueOrDash(value)
    );

  return (
    <div className="mp5-overview-grid" data-testid="player-inspector-overview">
      {[leftRows, rightRows].map((rows, groupIndex) => (
        <dl key={groupIndex} className="mp5-overview-table">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{renderValue(label, value)}</dd>
            </div>
          ))}
        </dl>
      ))}
      <dl className="mp5-overview-table mp5-overview-mobile" aria-label="Mobile track overview">
        {mobileRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{renderValue(label, value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
