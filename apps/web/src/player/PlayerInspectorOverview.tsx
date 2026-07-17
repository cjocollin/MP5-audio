import { getMetaValue, type IntegrityCheckResult, type Mp5File } from "@mp5/container";
import { codecLabel } from "../lib/codecDisplay";
import type { PlaylistTrack } from "../store/playerStore";
import { formatDuration, trackDisplayInfo } from "./playlistUtils";

interface Props {
  track?: PlaylistTrack;
  parsed?: Mp5File;
  duration: number;
  integrity?: IntegrityCheckResult | null;
}

function valueOrDash(value?: string | number | null) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

export function PlayerInspectorOverview({ track, parsed, duration, integrity }: Props) {
  const info = track ? trackDisplayInfo(track) : null;
  const meta = parsed?.meta ?? [];
  const head = parsed?.head;
  const fullCodecLabel = head ? codecLabel(head.codecId) : "";
  const isLossless = /lossless/i.test(fullCodecLabel);
  const integrityLabel = integrity?.status === "verified" || integrity?.status === "audio_verified"
    ? "Bit-exact"
    : isLossless
      ? "Bit-exact"
    : integrity?.status && integrity.status !== "missing"
      ? integrity.status.replace(/_/g, " ")
      : "Not verified";

  const leftRows = [
    ["Title", info?.title],
    ["Artist", info?.artist],
    ["Album", info?.album],
    ["Genre", getMetaValue(meta, "genre")],
    ["Duration", formatDuration(duration || info?.durationSec || null)],
    ["Comment", getMetaValue(meta, "comment")],
  ];
  const rightRows = [
    ["Codec", head ? fullCodecLabel.replace(/\s*\(.+\)$/, "") : null],
    ["Mode", head ? (isLossless ? "Lossless" : fullCodecLabel.replace(/^MP5-/, "")) : null],
    ["Integrity", integrityLabel],
    ["Container", track ? "MP5" : null],
    ["Channels", head ? `${head.channels}${head.channels === 1 ? " (mono)" : head.channels === 2 ? " (stereo)" : ""}` : null],
    ["Sample rate", head ? `${(head.sampleRate / 1000).toFixed(head.sampleRate % 1000 ? 1 : 0)} kHz` : null],
    ["Bit depth", head ? `${head.bitsPerSample}-bit` : null],
  ];

  return (
    <div className="mp5-overview-grid" data-testid="player-inspector-overview">
      {[leftRows, rightRows].map((rows, groupIndex) => (
        <dl key={groupIndex} className="mp5-overview-table">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{valueOrDash(value)}</dd>
            </div>
          ))}
        </dl>
      ))}
    </div>
  );
}
