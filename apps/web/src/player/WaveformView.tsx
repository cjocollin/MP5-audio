interface Props {
  peaks: number[];
  progress: number;
  onSeek?: (ratio: number) => void;
}

export function WaveformView({ peaks, progress, onSeek }: Props) {
  if (!peaks.length) {
    return <div className="h-16 rounded-xl bg-surface-elevated animate-pulse" />;
  }
  return (
    <svg
      className="w-full h-16 rounded-xl bg-surface-elevated cursor-pointer"
      viewBox={`0 0 ${peaks.length} 32`}
      preserveAspectRatio="none"
      onClick={(e) => {
        if (!onSeek) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - rect.left) / rect.width);
      }}
    >
      {peaks.map((p, i) => {
        const h = Math.max(1, p * 28);
        const played = i / peaks.length <= progress;
        return (
          <rect
            key={i}
            x={i}
            y={16 - h / 2}
            width={1}
            height={h}
            fill={played ? "#8b5cf6" : "#4b5563"}
          />
        );
      })}
    </svg>
  );
}
